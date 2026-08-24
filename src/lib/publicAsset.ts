/** Public/` assets, safe for Electron file:// (base is "./" in production). */
export function publicAsset(file: string): string {
  const base = import.meta.env.BASE_URL || "/";
  const name = file.replace(/^\/+/, "");
  return `${base}${name}`;
}
