import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const WIFI_SYNC_PORT = 38471;
const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const MAX_BYTES = 32 * 1024 * 1024;

/** @type {import('node:net').Socket | null} */
let computer = null;
/** @type {import('node:net').Socket | null} */
let phone = null;
/** @type {import('node:http').Server | null} */
let server = null;
let code = "";

export function lanAddresses() {
  const skip =
    /virtual|hyper-v|vethernet|wsl|vmware|virtualbox|vpn|astrill|bluetooth|loopback|tunnel/i;
  const addresses = [];
  for (const [name, entries] of Object.entries(os.networkInterfaces())) {
    if (skip.test(name)) continue;
    for (const entry of entries ?? []) {
      if (entry.internal) continue;
      const family = entry.family;
      if (family !== "IPv4" && family !== 4) continue;
      if (entry.address.startsWith("198.18.")) continue;
      addresses.push(entry.address);
    }
  }
  const rank = (ip) =>
    ip.startsWith("192.168.") ? 0 : ip.startsWith("10.") ? 1 : 2;
  return addresses.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

const codeFile = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "wifi-sync-code.txt",
);

function rememberedCode() {
  try {
    const saved = fs.readFileSync(codeFile, "utf8").replace(/\D/g, "");
    if (saved.length === 4) return saved;
  } catch {
    // First run on this computer.
  }
  const next = String(crypto.randomInt(1000, 10000));
  fs.mkdirSync(path.dirname(codeFile), { recursive: true });
  fs.writeFileSync(codeFile, `${next}\n`);
  return next;
}

export function startWifiRelay() {
  if (server) return { port: WIFI_SYNC_PORT, code, close };
  code = rememberedCode();
  server = http.createServer((req, res) => {
    if (!isLoopback(req.socket.remoteAddress)) {
      res.writeHead(403);
      res.end();
      return;
    }
    if (req.method === "OPTIONS") {
      writeCors(res, 204);
      res.end();
      return;
    }
    const path = (req.url ?? "/").split("?")[0];
    if (req.method === "GET" && path === "/info") {
      writeCors(res, 200);
      res.end(
        JSON.stringify({
          port: WIFI_SYNC_PORT,
          ips: lanAddresses(),
          code,
        }),
      );
      return;
    }
    res.writeHead(404);
    res.end();
  });
  server.on("upgrade", (req, socket) => {
    const url = new URL(req.url ?? "/", "http://local");
    if (url.pathname !== "/sync") {
      rejectUpgrade(socket, "Wi-Fi sync is not on this path.");
      return;
    }
    const role = url.searchParams.get("role");
    if (role === "computer") {
      if (!isLoopback(socket.remoteAddress)) {
        rejectUpgrade(socket, "The computer side stays on this machine.");
        return;
      }
      acceptUpgrade(req, socket, (peer) => attachComputer(peer));
      return;
    }
    if (role === "phone") {
      if (url.searchParams.get("code") !== code) {
        rejectUpgrade(socket, "That code does not match.");
        return;
      }
      acceptUpgrade(req, socket, (peer) => attachPhone(peer));
      return;
    }
    rejectUpgrade(socket, "Wi-Fi sync could not tell which side this is.");
  });
  server.on("error", (error) => {
    if (error && error.code === "EADDRINUSE") {
      console.log(`Wi-Fi sync is already listening on ${WIFI_SYNC_PORT}`);
      server = null;
      if (launchedDirectly) process.exit(0);
      return;
    }
    console.error("Wi-Fi sync failed to listen", error);
  });
  server.listen(WIFI_SYNC_PORT, "0.0.0.0", () => {
    const ips = lanAddresses();
    console.log(
      `Wi-Fi sync on ${ips[0] ?? "this computer"}:${WIFI_SYNC_PORT}  code ${code}`,
    );
  });
  return { port: WIFI_SYNC_PORT, code, close };
}

function close() {
  computer?.destroy();
  phone?.destroy();
  computer = null;
  phone = null;
  server?.close();
  server = null;
}

function attachComputer(socket) {
  computer?.destroy();
  computer = socket;
  socket.onclose = () => {
    if (computer !== socket) return;
    computer = null;
    tell(phone, { k: "peer", connected: false });
  };
  socket.onmessage = (text) => tell(phone, text);
  if (phone) tell(socket, { k: "peer", connected: true });
}

function attachPhone(socket) {
  phone?.destroy();
  phone = socket;
  socket.onclose = () => {
    if (phone !== socket) return;
    phone = null;
    tell(computer, { k: "peer", connected: false });
  };
  socket.onmessage = (text) => tell(computer, text);
  tell(computer, { k: "peer", connected: true });
  tell(socket, { k: "peer", connected: computer != null });
}

function tell(socket, payload) {
  if (!socket || socket.destroyed) return;
  const text = typeof payload === "string" ? payload : JSON.stringify(payload);
  sendText(socket, text);
}

function isLoopback(address) {
  if (!address) return false;
  return (
    address === "127.0.0.1" ||
    address === "::1" ||
    address === "::ffff:127.0.0.1"
  );
}

function writeCors(res, status) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Private-Network": "true",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Cache-Control": "no-store",
  });
}

function acceptUpgrade(req, socket, attach) {
  const key = req.headers["sec-websocket-key"];
  if (!key || Array.isArray(key)) {
    socket.destroy();
    return;
  }
  const accept = crypto
    .createHash("sha1")
    .update(key + GUID)
    .digest("base64");
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\n" +
      "Connection: Upgrade\r\n" +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
  );
  const peer = new PeerSocket(socket);
  attach(peer);
}

function rejectUpgrade(socket, message) {
  const body = JSON.stringify({ message });
  socket.write(
    "HTTP/1.1 401 Unauthorized\r\n" +
      "Content-Type: application/json; charset=utf-8\r\n" +
      "Connection: close\r\n" +
      `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n` +
      body,
  );
  socket.end();
}

class PeerSocket {
  /** @param {import('node:net').Socket} socket */
  constructor(socket) {
    this.socket = socket;
    this.destroyed = false;
    this.parser = new FrameParser({
      onMessage: (text) => this.onmessage?.(text),
      onPing: (payload) => sendFrame(socket, 0x0a, payload),
      onClose: () => this.destroy(),
    });
    socket.on("data", (chunk) => {
      try {
        this.parser.push(chunk);
      } catch (error) {
        console.error("Wi-Fi sync frame failed", error);
        this.destroy();
      }
    });
    socket.on("close", () => {
      this.destroyed = true;
      this.onclose?.();
    });
    socket.on("error", () => this.destroy());
    /** @type {((text: string) => void) | null} */
    this.onmessage = null;
    /** @type {(() => void) | null} */
    this.onclose = null;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.socket.destroy();
  }
}

function sendText(peer, text) {
  if (!peer || peer.destroyed) return;
  try {
    sendFrame(peer.socket, 0x01, Buffer.from(text));
  } catch {
    peer.destroy();
  }
}

function sendFrame(socket, opcode, payload) {
  const length = payload.length;
  let header;
  if (length < 126) {
    header = Buffer.alloc(2);
    header[1] = length;
  } else if (length < 65536) {
    header = Buffer.alloc(4);
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }
  header[0] = 0x80 | opcode;
  socket.write(header);
  if (length) socket.write(payload);
}

class FrameParser {
  constructor(handlers) {
    this.handlers = handlers;
    this.buffer = Buffer.alloc(0);
    this.parts = [];
  }

  push(chunk) {
    this.buffer = this.buffer.length
      ? Buffer.concat([this.buffer, chunk])
      : chunk;
    for (;;) {
      if (this.buffer.length < 2) return;
      const first = this.buffer[0];
      const second = this.buffer[1];
      let length = second & 0x7f;
      let offset = 2;
      if (length === 126) {
        if (this.buffer.length < 4) return;
        length = this.buffer.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (this.buffer.length < 10) return;
        const wide = this.buffer.readBigUInt64BE(2);
        if (wide > BigInt(MAX_BYTES)) throw new Error("sync frame is too large");
        length = Number(wide);
        offset = 10;
      }
      if (length > MAX_BYTES) throw new Error("sync frame is too large");
      const masked = (second & 0x80) !== 0;
      const maskLength = masked ? 4 : 0;
      if (this.buffer.length < offset + maskLength + length) return;
      let payload = this.buffer.subarray(
        offset + maskLength,
        offset + maskLength + length,
      );
      if (masked) {
        const mask = this.buffer.subarray(offset, offset + 4);
        const copy = Buffer.alloc(payload.length);
        for (let index = 0; index < copy.length; index += 1) {
          copy[index] = payload[index] ^ mask[index & 3];
        }
        payload = copy;
      }
      this.buffer = Buffer.from(
        this.buffer.subarray(offset + maskLength + length),
      );
      const opcode = first & 0x0f;
      const fin = (first & 0x80) !== 0;
      if (opcode === 0x08) {
        this.handlers.onClose?.();
        continue;
      }
      if (opcode === 0x09) {
        this.handlers.onPing?.(payload);
        continue;
      }
      if (opcode === 0x0a) continue;
      if (opcode !== 0x01 && opcode !== 0x00) continue;
      if (opcode === 0x01) this.parts = [payload];
      else this.parts.push(payload);
      if (!fin) continue;
      const text = Buffer.concat(this.parts).toString("utf8");
      this.parts = [];
      this.handlers.onMessage(text);
    }
  }
}

const launchedDirectly = (process.argv[1] ?? "")
  .replaceAll("\\", "/")
  .endsWith("electron/wifiRelay.mjs");

if (launchedDirectly) startWifiRelay();
