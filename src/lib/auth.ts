const HASH_KEY = "luckygain.auth.hash.v1";
const SALT_KEY = "luckygain.auth.salt.v1";
const SESSION_KEY = "luckygain.auth.session.v1";

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomSalt(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return toHex(bytes.buffer);
}

async function deriveHash(password: string, saltHex: string): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const saltBytes = new Uint8Array(
    saltHex.match(/.{1,2}/g)!.map((h) => Number.parseInt(h, 16)),
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations: 120_000,
      hash: "SHA-256",
    },
    keyMaterial,
    256,
  );
  return toHex(bits);
}

export function hasPassword(): boolean {
  return Boolean(localStorage.getItem(HASH_KEY) && localStorage.getItem(SALT_KEY));
}

export function isSessionUnlocked(): boolean {
  return sessionStorage.getItem(SESSION_KEY) === "1";
}

export function markSessionUnlocked(): void {
  sessionStorage.setItem(SESSION_KEY, "1");
}

export function lockSession(): void {
  sessionStorage.removeItem(SESSION_KEY);
}

export async function setPassword(password: string): Promise<void> {
  const trimmed = password.trim();
  if (trimmed.length < 4) {
    throw new Error("Password must be at least 4 characters");
  }
  const salt = randomSalt();
  const hash = await deriveHash(trimmed, salt);
  localStorage.setItem(SALT_KEY, salt);
  localStorage.setItem(HASH_KEY, hash);
  markSessionUnlocked();
}

export async function verifyPassword(password: string): Promise<boolean> {
  const salt = localStorage.getItem(SALT_KEY);
  const expected = localStorage.getItem(HASH_KEY);
  if (!salt || !expected) return false;
  const actual = await deriveHash(password.trim(), salt);
  return actual === expected;
}

export async function changePassword(
  currentPassword: string,
  nextPassword: string,
): Promise<void> {
  if (!hasPassword()) {
    await setPassword(nextPassword);
    return;
  }
  const ok = await verifyPassword(currentPassword);
  if (!ok) {
    throw new Error("Current password is incorrect");
  }
  await setPassword(nextPassword);
}
