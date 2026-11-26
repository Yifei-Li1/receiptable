import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { Directory, File, Paths } from "expo-file-system";

/**
 * Downscales a photo so the long edge is at most 1568px (Claude's useful max for vision)
 * and returns a JPEG file URI plus its base64.
 */
export async function prepareForUpload(uri: string, width: number, height: number) {
  const ctx = ImageManipulator.manipulate(uri);
  const longEdge = Math.max(width, height);
  if (longEdge > 1568) {
    ctx.resize(width >= height ? { width: 1568 } : { height: 1568 });
  }
  const image = await ctx.renderAsync();
  const result = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true });
  return { uri: result.uri, base64: result.base64 ?? "" };
}

/** Copies an image into the app's document directory so it survives cache cleanup. */
export async function persistImage(uri: string): Promise<string> {
  const dir = new Directory(Paths.document, "receipts");
  if (!dir.exists) dir.create({ intermediates: true });
  const dest = new File(dir, `${Date.now()}.jpg`);
  await new File(uri).copy(dest);
  return dest.uri;
}

export function deleteImage(uri: string | null) {
  if (!uri) return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {}
}
