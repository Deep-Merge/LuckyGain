import {
  FrameDecoder,
  MessageInbox,
  encodeMessage,
  type SyncMessage,
} from "./protocol";

const SERVICE = "8c0e1000-7b3a-4c3e-9b2a-6f1d4a8e0001";
const WRITE = "8c0e1000-7b3a-4c3e-9b2a-6f1d4a8e0002";
const NOTIFY = "8c0e1000-7b3a-4c3e-9b2a-6f1d4a8e0003";

type SyncDevice = {
  name?: string;
  gatt?: { connect: () => Promise<SyncServer> };
  addEventListener: (type: string, listener: () => void) => void;
};

type SyncServer = {
  getPrimaryService: (uuid: string) => Promise<SyncService>;
  disconnect: () => void;
};

type SyncService = {
  getCharacteristic: (uuid: string) => Promise<SyncCharacteristic>;
};

type SyncCharacteristic = {
  writeValue: (value: BufferSource) => Promise<void>;
  startNotifications: () => Promise<SyncCharacteristic>;
  value?: DataView;
  addEventListener: (type: string, listener: (event: Event) => void) => void;
};

type SyncBluetooth = {
  requestDevice: (options: {
    filters: Array<{ services: string[] }>;
    optionalServices: string[];
  }) => Promise<SyncDevice>;
};

function bluetoothApi(): SyncBluetooth | null {
  const host = navigator as Navigator & { bluetooth?: SyncBluetooth };
  return host.bluetooth ?? null;
}

export class WebBluetoothLink {
  private chunkSize = 20;
  private readonly inbox = new MessageInbox();
  private readonly decoder = new FrameDecoder();
  private device: SyncDevice;
  private server: SyncServer;
  private writer: SyncCharacteristic;

  private constructor(
    device: SyncDevice,
    server: SyncServer,
    writer: SyncCharacteristic,
  ) {
    this.device = device;
    this.server = server;
    this.writer = writer;
  }

  static supported(): boolean {
    return bluetoothApi() != null;
  }

  static async connect(): Promise<WebBluetoothLink> {
    const bluetooth = bluetoothApi();
    if (!bluetooth) {
      throw new Error("Open LuckyGain in Chrome to use Bluetooth.");
    }
    const device = await bluetooth.requestDevice({
      filters: [{ services: [SERVICE] }],
      optionalServices: [SERVICE],
    });
    const server = await device.gatt?.connect();
    if (!server) throw new Error("Could not open the Bluetooth connection.");
    const service = await server.getPrimaryService(SERVICE);
    const writer = await service.getCharacteristic(WRITE);
    const notify = await service.getCharacteristic(NOTIFY);
    const link = new WebBluetoothLink(device, server, writer);
    notify.addEventListener("characteristicvaluechanged", (event) => {
      const value = (event.target as unknown as SyncCharacteristic).value;
      if (!value) return;
      link.take(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
    });
    device.addEventListener("gattserverdisconnected", () => {
      link.inbox.fail(new Error("The phone disconnected."));
    });
    await notify.startNotifications();
    return link;
  }

  get name(): string {
    return this.device.name || "Phone";
  }

  setChunkSize(mtu: number) {
    // Huawei drops writes that fill the whole packet. Stay under the negotiated size.
    this.chunkSize = Math.max(20, Math.min(160, mtu - 3));
  }

  send(message: SyncMessage): Promise<void> {
    return this.write(encodeMessage(message));
  }

  receive() {
    return this.inbox.next();
  }

  async close() {
    try {
      this.server.disconnect();
    } catch {
      // The phone may already be gone.
    }
  }

  private take(chunk: Uint8Array) {
    try {
      const messages = this.decoder.push(chunk);
      for (const message of messages) {
        this.inbox.push(message);
        this.onInbound?.();
      }
    } catch (error) {
      this.inbox.fail(
        error instanceof Error ? error : new Error("Could not read the sync."),
      );
    }
  }

  onInbound: (() => void) | null = null;

  private async write(bytes: Uint8Array) {
    for (let offset = 0; offset < bytes.length; offset += this.chunkSize) {
      const slice = bytes.slice(offset, offset + this.chunkSize);
      try {
        await this.writer.writeValue(slice);
      } catch (error) {
        throw new Error(friendlyBluetoothError(error));
      }
    }
  }
}

export function friendlyBluetoothError(error: unknown): string {
  const raw = error instanceof Error ? error.message : "";
  if (/gatt|not supported|operation already in progress/i.test(raw)) {
    return "Bluetooth stalled while sending. Stay near the phone and tap Sync again.";
  }
  if (/disconnect/i.test(raw)) {
    return "The phone disconnected. Tap Connect on the phone, then connect here again.";
  }
  return raw || "Could not sync goods.";
}
