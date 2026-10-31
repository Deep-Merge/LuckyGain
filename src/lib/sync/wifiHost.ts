import { readWifiInfo, WifiSyncLink, type WifiInfo } from "./wifiLink";

type Listener = () => void;

class WifiHost {
  info: WifiInfo | null = null;
  phone = false;
  error: string | null = null;
  pendingUrl: string | null = null;
  link: WifiSyncLink | null = null;

  private listeners = new Set<Listener>();
  private stopped = true;
  private retry = 0;

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    void this.open();
  }

  stop() {
    this.stopped = true;
    window.clearTimeout(this.retry);
    this.link?.close();
    this.link = null;
    this.phone = false;
  }

  clearPending() {
    this.pendingUrl = null;
    this.emit();
  }

  private emit() {
    for (const listener of this.listeners) listener();
  }

  private async open() {
    try {
      const next = await readWifiInfo();
      if (this.stopped) return;
      this.info = next;
      this.error = null;
      this.emit();
      const socket = await WifiSyncLink.connect();
      if (this.stopped) {
        socket.close();
        return;
      }
      this.link = socket;
      socket.onPeer = (connected) => {
        if (this.stopped) return;
        this.phone = connected;
        this.emit();
      };
      socket.onOpenUrl = (url) => {
        if (this.stopped) return;
        this.pendingUrl = url;
        this.emit();
        const opened = window.open(url, "_blank", "noopener,noreferrer");
        if (opened) {
          this.pendingUrl = null;
          this.emit();
        }
      };
      socket.onDead = () => {
        if (this.stopped) return;
        this.link = null;
        this.phone = false;
        this.emit();
        this.retry = window.setTimeout(() => void this.open(), 1200);
      };
    } catch (caught) {
      if (this.stopped) return;
      this.error =
        caught instanceof Error ? caught.message : "Could not open Wi-Fi sync.";
      this.emit();
      this.retry = window.setTimeout(() => void this.open(), 1500);
    }
  }
}

export const wifiHost = new WifiHost();
