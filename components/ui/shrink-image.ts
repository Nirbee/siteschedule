/**
 * Shrinks a phone photo in the browser before sending it to a server action (they accept
 * ~1 MB). JPEG at the given longest side; EXIF is not carried over by the canvas.
 */
export async function shrinkImage(file: File, maxSide: number, quality = 0.9): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), "image/jpeg", quality),
  );
}
