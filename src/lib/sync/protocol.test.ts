import { describe, expect, it } from "vitest";
import {
  FrameDecoder,
  MessageInbox,
  encodeMessage,
  idsNeeded,
  runGoodsSync,
  type CatalogItem,
  type SyncMessage,
  type SyncRecord,
} from "./protocol";

describe("goods sync protocol", () => {
  it("splits and rejoins a message", () => {
    const bytes = encodeMessage({
      t: "need",
      ids: ["coat", "lamp"],
    });
    const decoder = new FrameDecoder();
    expect(decoder.push(bytes.slice(0, 3))).toEqual([]);
    expect(decoder.push(bytes.slice(3))).toEqual([
      { t: "need", ids: ["coat", "lamp"] },
    ]);
  });

  it("asks only for a newer remote good", () => {
    const local: CatalogItem[] = [
      { id: "coat", updatedAt: "2026-10-30 02:00:00", deleted: false },
      { id: "lamp", updatedAt: "2026-10-28 02:00:00", deleted: false },
    ];
    const remote: CatalogItem[] = [
      { id: "coat", updatedAt: "2026-10-29 02:00:00", deleted: false },
      { id: "hat", updatedAt: "2026-10-30 03:00:00", deleted: false },
      { id: "old", updatedAt: "2026-10-30 03:00:00", deleted: true },
    ];
    expect(idsNeeded(local, remote)).toEqual(["hat"]);
  });

  it("does not ask again for the same good under a different id", () => {
    const local: CatalogItem[] = [
      {
        id: "pc-socks",
        updatedAt: "2026-10-30 02:00:00",
        deleted: false,
        title: "socks",
        purchasedOn: "2026-10-01",
        priceCents: 200,
        forWhom: "jackie",
      },
    ];
    const remote: CatalogItem[] = [
      {
        id: "phone-socks",
        updatedAt: "2026-10-30 02:00:00",
        deleted: false,
        title: "socks",
        purchasedOn: "2026-10-01",
        priceCents: 200,
        forWhom: "jackie",
      },
    ];
    expect(idsNeeded(local, remote)).toEqual([]);
  });

  it("exchanges the newer good in each direction", async () => {
    const link = couple();
    const coat = record("coat", "2026-10-30 04:00:00");
    const hat = record("hat", "2026-10-30 05:00:00");
    const [left, right] = await Promise.all([
      runGoodsSync({
        ...link.left,
        lead: true,
        hello: { name: "computer", mtu: 185 },
        catalog: () => [item(coat)],
        records: (ids) => (ids.includes("coat") ? [coat] : []),
        apply: async (records) => ({
          inserted: records.length,
          updated: 0,
          unchanged: 0,
          changes: records.map((record) => ({
            title: String(record.good.title ?? "Untitled"),
            action: "added" as const,
          })),
        }),
      }),
      runGoodsSync({
        ...link.right,
        lead: false,
        hello: { name: "phone", mtu: 185 },
        catalog: () => [item(hat)],
        records: (ids) => (ids.includes("hat") ? [hat] : []),
        apply: async (records) => ({
          inserted: records.length,
          updated: 0,
          unchanged: 0,
          changes: records.map((record) => ({
            title: String(record.good.title ?? "Untitled"),
            action: "added" as const,
          })),
        }),
      }),
    ]);
    expect(left.took.inserted).toBe(1);
    expect(right.took.inserted).toBe(1);
    expect(left.peer.inserted).toBe(1);
    expect(right.peer.inserted).toBe(1);
  });
});

function item(record: SyncRecord): CatalogItem {
  return {
    id: String(record.good.id),
    updatedAt: String(record.good.updated_at),
    deleted: record.good.soft_deleted === 1,
  };
}

function record(id: string, updatedAt: string): SyncRecord {
  return {
    good: {
      id,
      title: id,
      updated_at: updatedAt,
      soft_deleted: 0,
    },
    purse: [],
  };
}

function couple() {
  const leftInbox = new MessageInbox();
  const rightInbox = new MessageInbox();
  return {
    left: {
      send: async (message: SyncMessage) => rightInbox.push(message),
      receive: () => leftInbox.next(),
    },
    right: {
      send: async (message: SyncMessage) => leftInbox.push(message),
      receive: () => rightInbox.next(),
    },
  };
}
