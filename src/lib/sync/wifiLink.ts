import { MessageInbox, type SyncMessage } from "./protocol";

export const WIFI_SYNC_PORT = 38471;

export type WifiInfo = {
  port: number;
  ips: string[];
  code: string;
};

type SyncFrame =
  | { k: "sync"; m: SyncMessage }
  | { k: "peer"; connected: boolean }
  | { k: "open"; url: string }
  | { k: "reject"; message: string };

export async function readWifiInfo(): Promise<WifiInfo> {
  const response = await fetch(`http://127.0.0.1:${WIFI_SYNC_PORT}/info`);
  if (!response.ok) {
    throw new Error("Wi-Fi sync is not running on this computer.");
  }
  return (await response.json()) as WifiInfo;
}

export class WifiSyncLink {
  private readonly inbox = new MessageInbox();
  private readonly socket: WebSocket;
  onInbound: (() => void) | null = null;
  onPeer: ((connected: boolean) => void) | null = null;
  onOpenUrl: ((url: string) => void) | null = null;
  onDead: (() => void) | null = null;

  private constructor(socket: WebSocket) {
    this.socket = socket;
    socket.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return;
      this.take(event.data);
    });
    socket.addEventListener("close", () => {
      this.onPeer?.(false);
      this.inbox.fail(new Error("The phone disconnected."));
      this.onDead?.();
    });
  }

  static connect(): Promise<WifiSyncLink> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(
        `ws://127.0.0.1:${WIFI_SYNC_PORT}/sync?role=computer`,
      );
      const fail = () =>
        reject(
          new Error(
            "Could not open Wi-Fi sync. Restart LuckyGain on this computer.",
          ),
        );
      socket.addEventListener("open", () => resolve(new WifiSyncLink(socket)));
      socket.addEventListener("error", fail);
    });
  }

  send(message: SyncMessage): Promise<void> {
    if (this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("The phone disconnected."));
    }
    this.socket.send(JSON.stringify({ k: "sync", m: message }));
    return Promise.resolve();
  }

  receive() {
    return this.inbox.next();
  }

  close() {
    this.socket.close();
  }

  private take(text: string) {
    let frame: SyncFrame;
    try {
      frame = JSON.parse(text) as SyncFrame;
    } catch {
      this.inbox.fail(new Error("Could not read the sync."));
      return;
    }
    if (frame.k === "peer") {
      this.onPeer?.(frame.connected);
      return;
    }
    if (frame.k === "reject") {
      this.inbox.fail(new Error(frame.message));
      return;
    }
    if (frame.k === "open") {
      const url = frame.url.trim();
      if (url) this.onOpenUrl?.(url);
      return;
    }
    if (frame.k !== "sync") return;
    this.inbox.push(frame.m);
    if (frame.m.t === "hello") this.onInbound?.();
  }

  forgetPending() {
    this.inbox.clear();
  }
}
