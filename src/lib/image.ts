/** Resize + JPEG-compress an image file for compact local storage. */
export async function compressImageFile(
  file: File,
  options?: { maxEdge?: number; quality?: number },
): Promise<string> {
  const maxEdge = options?.maxEdge ?? 1280;
  const quality = options?.quality ?? 0.72;

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not process image");
    ctx.drawImage(bitmap, 0, 0, width, height);

    return canvas.toDataURL("image/jpeg", quality);
  } finally {
    bitmap.close();
  }
}
