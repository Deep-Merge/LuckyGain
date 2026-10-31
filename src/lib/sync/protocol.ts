export const SYNC_VERSION = 1;
export const MAX_FRAME_BYTES = 12 * 1024 * 1024;

export type CatalogItem = {
  id: string;
  updatedAt: string;
  deleted: boolean;
  title?: string;
  purchasedOn?: string;
  priceCents?: number;
  forWhom?: string;
};

export type SyncRecord = {
  good: Record<string, unknown>;
  purse: Array<Record<string, unknown>>;
};

export type SyncChange = {
  title: string;
  action: "added" | "updated";
};

export type SyncCounts = {
  inserted: number;
  updated: number;
  unchanged: number;
  changes: SyncChange[];
};

export type SyncMessage =
  | { t: "hello"; v: number; name: string; mtu: number }
  | { t: "catalog"; goods: CatalogItem[] }
  | { t: "need"; ids: string[] }
  | { t: "record"; good: Record<string, unknown>; purse: Array<Record<string, unknown>> }
  | { t: "batch" }
  | {
      t: "applied";
      inserted: number;
      updated: number;
      unchanged: number;
      changes: SyncChange[];
    }
  | { t: "error"; message: string };

export function goodsIdentity(item: {
  title?: string | null;
  purchasedOn?: string | null;
  priceCents?: number | null;
  forWhom?: string | null;
}): string {
  const title = (item.title ?? "").trim().toLowerCase();
  const purchasedOn = (item.purchasedOn ?? "").trim();
  if (!title || !purchasedOn) return "";
  return [
    title,
    purchasedOn,
    String(item.priceCents ?? ""),
    (item.forWhom ?? "").trim().toLowerCase(),
  ].join("\t");
}

export function idsNeeded(local: CatalogItem[], remote: CatalogItem[]): string[] {
  const mine = new Map(local.map((item) => [item.id, item]));
  const twins = new Map<string, CatalogItem>();
  for (const item of local) {
    const key = goodsIdentity(item);
    if (!key || twins.has(key)) continue;
    twins.set(key, item);
  }
  const ids: string[] = [];
  for (const item of remote) {
    const current = mine.get(item.id) ?? twins.get(goodsIdentity(item));
    if (!current) {
      if (!item.deleted) ids.push(item.id);
      continue;
    }
    if (item.updatedAt > current.updatedAt) ids.push(item.id);
  }
  return ids;
}

export function encodeMessage(message: SyncMessage): Uint8Array {
  const body = new TextEncoder().encode(JSON.stringify(message));
  if (body.length > MAX_FRAME_BYTES) {
    throw new Error("That sync message is too large");
  }
  const out = new Uint8Array(4 + body.length);
  new DataView(out.buffer).setUint32(0, body.length, false);
  out.set(body, 4);
  return out;
}

export class FrameDecoder {
  private buffer = new Uint8Array(0);

  push(chunk: Uint8Array): SyncMessage[] {
    if (!chunk.byteLength) return [];
    const next = new Uint8Array(this.buffer.length + chunk.length);
    next.set(this.buffer);
    next.set(chunk, this.buffer.length);
    this.buffer = next;
    const messages: SyncMessage[] = [];
    while (this.buffer.length >= 4) {
      const length = new DataView(
        this.buffer.buffer,
        this.buffer.byteOffset,
        this.buffer.byteLength,
      ).getUint32(0, false);
      if (length > MAX_FRAME_BYTES) {
        this.buffer = new Uint8Array(0);
        throw new Error("That sync message is too large");
      }
      if (this.buffer.length < 4 + length) break;
      const body = this.buffer.slice(4, 4 + length);
      this.buffer = this.buffer.slice(4 + length);
      messages.push(JSON.parse(new TextDecoder().decode(body)) as SyncMessage);
    }
    return messages;
  }
}

export class MessageInbox {
  private items: SyncMessage[] = [];
  private waiters: Array<(value: SyncMessage | Error) => void> = [];
  private failed: Error | null = null;

  push(message: SyncMessage) {
    const waiter = this.waiters.shift();
    if (waiter) waiter(message);
    else this.items.push(message);
  }

  fail(error: Error) {
    if (this.failed) return;
    this.failed = error;
    const waiters = this.waiters.splice(0);
    for (const waiter of waiters) waiter(error);
  }

  clear() {
    this.items = [];
  }

  next(): Promise<SyncMessage> {
    if (this.items.length) return Promise.resolve(this.items.shift()!);
    if (this.failed) return Promise.reject(this.failed);
    return new Promise((resolve, reject) => {
      this.waiters.push((value) => {
        if (value instanceof Error) reject(value);
        else resolve(value);
      });
    });
  }
}

export type SyncPhase = "compare" | "send" | "receive" | "save";

export type SyncProgress = {
  phase: SyncPhase;
  title: string;
  detail: string;
  value: number;
};

export type SyncSide = {
  send: (message: SyncMessage) => Promise<void>;
  receive: () => Promise<SyncMessage>;
  /** The leader speaks first. The other side waits, so the Bluetooth link stays one-way. */
  lead: boolean;
  hello: { name: string; mtu: number };
  onHello?: (mtu: number) => void;
  catalog: () => CatalogItem[];
  records: (ids: string[]) => SyncRecord[];
  apply: (records: SyncRecord[]) => Promise<SyncCounts>;
  onProgress?: (progress: SyncProgress) => void;
};

export async function runGoodsSync(side: SyncSide): Promise<{
  took: SyncCounts;
  peer: SyncCounts;
}> {
  const progress = side.onProgress ?? (() => {});
  const lead = side.lead;
  report(progress, "compare", "Comparing goods", "Looking for newer copies", 0.08);

  const hello = await exchange(
    side,
    {
      t: "hello",
      v: SYNC_VERSION,
      name: side.hello.name,
      mtu: side.hello.mtu,
    },
    "hello",
  );
  if (hello.v !== SYNC_VERSION) {
    throw new Error("The other side is using a different sync version");
  }
  side.onHello?.(hello.mtu);

  report(progress, "compare", "Comparing goods", "Checking both lists", 0.2);
  const catalog = await exchange(
    side,
    { t: "catalog", goods: side.catalog() },
    "catalog",
  );
  const wanted = idsNeeded(side.catalog(), catalog.goods);
  const need = await exchange(side, { t: "need", ids: wanted }, "need");
  const outgoing = side.records(need.ids);
  const incoming = lead
    ? await sendThenReceive(side, progress, outgoing, wanted.length)
    : await receiveThenSend(side, progress, outgoing, wanted.length);

  report(progress, "save", "Saving", "Writing the newer goods", 0.92);
  const took = await side.apply(incoming);
  const peer = await exchange(
    side,
    {
      t: "applied",
      inserted: took.inserted,
      updated: took.updated,
      unchanged: took.unchanged,
      changes: took.changes,
    },
    "applied",
  );
  report(progress, "save", "Saving", "Finished", 1);
  return {
    took: countsOf(took),
    peer: countsOf(peer),
  };
}

function countsOf(counts: SyncCounts): SyncCounts {
  return {
    inserted: counts.inserted,
    updated: counts.updated,
    unchanged: counts.unchanged,
    changes: readChanges(counts.changes),
  };
}

function readChanges(value: unknown): SyncChange[] {
  if (!Array.isArray(value)) return [];
  const changes: SyncChange[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as { title?: unknown; action?: unknown };
    if (row.action !== "added" && row.action !== "updated") continue;
    const title = typeof row.title === "string" ? row.title.trim() : "";
    changes.push({ title: title || "Untitled", action: row.action });
  }
  return changes;
}

async function exchange<T extends SyncMessage["t"]>(
  side: SyncSide,
  mine: Extract<SyncMessage, { t: T }>,
  type: T,
): Promise<Extract<SyncMessage, { t: T }>> {
  if (side.lead) {
    await side.send(mine);
    return expectType(side, type);
  }
  const theirs = await expectType(side, type);
  await side.send(mine);
  return theirs;
}

async function sendThenReceive(
  side: SyncSide,
  progress: (progress: SyncProgress) => void,
  outgoing: SyncRecord[],
  expected: number,
) {
  await sendRecords(side, progress, outgoing, 0.28, 0.56);
  return readRecords(side, progress, expected, 0.58, 0.86);
}

async function receiveThenSend(
  side: SyncSide,
  progress: (progress: SyncProgress) => void,
  outgoing: SyncRecord[],
  expected: number,
) {
  const incoming = await readRecords(side, progress, expected, 0.28, 0.56);
  await sendRecords(side, progress, outgoing, 0.58, 0.86);
  return incoming;
}

async function sendRecords(
  side: SyncSide,
  progress: (progress: SyncProgress) => void,
  outgoing: SyncRecord[],
  start: number,
  end: number,
) {
  if (!outgoing.length) {
    report(progress, "send", "Sending goods", "Nothing new from here", end);
  }
  for (let index = 0; index < outgoing.length; index += 1) {
    const record = outgoing[index];
    report(
      progress,
      "send",
      "Sending goods",
      `${index + 1} of ${outgoing.length}`,
      start + ((end - start) * (index + 1)) / outgoing.length,
    );
    await side.send({ t: "record", good: record.good, purse: record.purse });
  }
  await side.send({ t: "batch" });
}

async function readRecords(
  side: SyncSide,
  progress: (progress: SyncProgress) => void,
  expected: number,
  start: number,
  end: number,
) {
  const incoming: SyncRecord[] = [];
  if (!expected) {
    report(
      progress,
      "receive",
      "Receiving goods",
      "Nothing new from the other side",
      start,
    );
  }
  for (;;) {
    const message = await side.receive();
    if (message.t === "batch") break;
    if (message.t === "error") throw new Error(message.message);
    if (message.t !== "record") throw new Error("Sync got out of step");
    incoming.push({ good: message.good, purse: message.purse });
    const total = Math.max(expected, incoming.length);
    report(
      progress,
      "receive",
      "Receiving goods",
      `${incoming.length} of ${total}`,
      start + ((end - start) * incoming.length) / total,
    );
  }
  return incoming;
}

function report(
  progress: (progress: SyncProgress) => void,
  phase: SyncPhase,
  title: string,
  detail: string,
  value: number,
) {
  progress({ phase, title, detail, value });
}

async function expectType<T extends SyncMessage["t"]>(
  side: SyncSide,
  type: T,
): Promise<Extract<SyncMessage, { t: T }>> {
  const message = await side.receive();
  if (message.t === "error") throw new Error(message.message);
  if (message.t !== type) throw new Error("Sync got out of step");
  return message as Extract<SyncMessage, { t: T }>;
}
