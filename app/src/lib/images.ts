import { Directory, File, Paths } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

/**
 * Downscales a photo so its long edge is at most 2048px — plenty for text recognition and
 * keeps stored receipt images small.
 */
export async function prepareImage(uri: string, width: number, height: number): Promise<string> {
  const ctx = ImageManipulator.manipulate(uri);
  if (Math.max(width, height) > 2048) {
    ctx.resize(width >= height ? { width: 2048 } : { height: 2048 });
  }
  const image = await ctx.renderAsync();
  const result = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
  return result.uri;
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
