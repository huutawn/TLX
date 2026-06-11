import { parseCssColor } from '../color-harmony';

export function contrastRatio(foreground: string, background: string): number {
  const fg = parseCssColor(foreground);
  const bg = parseCssColor(background);
  if (!fg || !bg) return 0;

  const foregroundLum = relativeLuminance(fg);
  const backgroundLum = relativeLuminance(bg);
  const lighter = Math.max(foregroundLum, backgroundLum);
  const darker = Math.min(foregroundLum, backgroundLum);
  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance([red, green, blue]: [number, number, number]) {
  const [r, g, b] = [red, green, blue].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}
