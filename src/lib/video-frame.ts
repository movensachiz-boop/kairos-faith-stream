// Fit camera frames upright into a stable landscape canvas without cropping.
export function landscapeFrame(width: number, height: number, targetWidth = 1280, targetHeight = 720) {
  if (width <= 0 || height <= 0) return null;
  const scale = Math.min(targetWidth / width, targetHeight / height);
  const w = width * scale, h = height * scale;
  return { x: (targetWidth - w) / 2, y: (targetHeight - h) / 2, width: w, height: h };
}
