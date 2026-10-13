/**
 * Letter-tile icons for providers without a brand logo (relays etc.): a
 * rounded color tile with the provider's first letter as a white pixel glyph.
 * Tiles are generated per provider (not per letter) so same-letter providers
 * still get distinct colors.
 */

/** Classic 5x7 pixel font, X = filled. */
const FONT: Record<string, string[]> = {
  A: [".XXX.", "X...X", "X...X", "XXXXX", "X...X", "X...X", "X...X"],
  B: ["XXXX.", "X...X", "X...X", "XXXX.", "X...X", "X...X", "XXXX."],
  C: [".XXXX", "X....", "X....", "X....", "X....", "X....", ".XXXX"],
  D: ["XXXX.", "X...X", "X...X", "X...X", "X...X", "X...X", "XXXX."],
  E: ["XXXXX", "X....", "X....", "XXXX.", "X....", "X....", "XXXXX"],
  F: ["XXXXX", "X....", "X....", "XXXX.", "X....", "X....", "X...."],
  G: [".XXXX", "X....", "X....", "X..XX", "X...X", "X...X", ".XXXX"],
  H: ["X...X", "X...X", "X...X", "XXXXX", "X...X", "X...X", "X...X"],
  I: ["XXXXX", "..X..", "..X..", "..X..", "..X..", "..X..", "XXXXX"],
  J: ["..XXX", "...X.", "...X.", "...X.", "...X.", "X..X.", ".XX.."],
  K: ["X...X", "X..X.", "X.X..", "XX...", "X.X..", "X..X.", "X...X"],
  L: ["X....", "X....", "X....", "X....", "X....", "X....", "XXXXX"],
  M: ["X...X", "XX.XX", "X.X.X", "X.X.X", "X...X", "X...X", "X...X"],
  N: ["X...X", "XX..X", "XX..X", "X.X.X", "X..XX", "X..XX", "X...X"],
  O: [".XXX.", "X...X", "X...X", "X...X", "X...X", "X...X", ".XXX."],
  P: ["XXXX.", "X...X", "X...X", "XXXX.", "X....", "X....", "X...."],
  Q: [".XXX.", "X...X", "X...X", "X...X", "X.X.X", "X..X.", ".XX.X"],
  R: ["XXXX.", "X...X", "X...X", "XXXX.", "X.X..", "X..X.", "X...X"],
  S: [".XXXX", "X....", "X....", ".XXX.", "....X", "....X", "XXXX."],
  T: ["XXXXX", "..X..", "..X..", "..X..", "..X..", "..X..", "..X.."],
  U: ["X...X", "X...X", "X...X", "X...X", "X...X", "X...X", ".XXX."],
  V: ["X...X", "X...X", "X...X", "X...X", "X...X", ".X.X.", "..X.."],
  W: ["X...X", "X...X", "X...X", "X.X.X", "X.X.X", "XX.XX", "X...X"],
  X: ["X...X", "X...X", ".X.X.", "..X..", ".X.X.", "X...X", "X...X"],
  Y: ["X...X", "X...X", ".X.X.", "..X..", "..X..", "..X..", "..X.."],
  Z: ["XXXXX", "....X", "...X.", "..X..", ".X...", "X....", "XXXXX"],
  "0": [".XXX.", "X...X", "X..XX", "X.X.X", "XX..X", "X...X", ".XXX."],
  "1": ["..X..", ".XX..", "..X..", "..X..", "..X..", "..X..", ".XXX."],
  "2": [".XXX.", "X...X", "....X", "...X.", "..X..", ".X...", "XXXXX"],
  "3": ["XXXXX", "...X.", "..X..", "...X.", "....X", "X...X", ".XXX."],
  "4": ["...X.", "..XX.", ".X.X.", "X..X.", "XXXXX", "...X.", "...X."],
  "5": ["XXXXX", "X....", "XXXX.", "....X", "....X", "X...X", ".XXX."],
  "6": ["..XX.", ".X...", "X....", "XXXX.", "X...X", "X...X", ".XXX."],
  "7": ["XXXXX", "....X", "...X.", "..X..", ".X...", ".X...", ".X..."],
  "8": [".XXX.", "X...X", "X...X", ".XXX.", "X...X", "X...X", ".XXX."],
  "9": [".XXX.", "X...X", "X...X", ".XXXX", "....X", "...X.", ".XX.."],
};

/** Distinct, theme-independent tile colors; picked by provider-name hash. */
export const TILE_COLORS = [
  "#0d9488",
  "#ea580c",
  "#7c3aed",
  "#16a34a",
  "#dc2626",
  "#2563eb",
  "#db2777",
  "#d97706",
  "#0891b2",
  "#65a30d",
];

/** djb2; stable across runs so a provider keeps its color. */
export function tileColor(provider: string): string {
  let hash = 5381;
  for (let i = 0; i < provider.length; i++) {
    hash = ((hash << 5) + hash + provider.charCodeAt(i)) | 0;
  }
  return TILE_COLORS[(hash >>> 0) % TILE_COLORS.length]!;
}

export function tileLetter(provider: string): string {
  const ch = provider.trim().charAt(0).toUpperCase();
  return FONT[ch] ? ch : "?";
}

/** Rounded 21-unit tile, white 5x7 glyph centered, on a 24x24 canvas. */
export const TILE_INITIALS = Object.keys(FONT);

export function letterIconPath(provider: string): string {
  const letter = tileLetter(provider);
  if (letter === "?") return "icon.svg";
  return `icons/letters/${letter.toLowerCase()}-${TILE_COLORS.indexOf(tileColor(provider))}.svg`;
}

export function letterTileSvg(provider: string, color = tileColor(provider)): string {
  const glyph = FONT[tileLetter(provider)] ?? []; 
  const s = 1.9;
  const ox = (24 - 5 * s) / 2;
  const oy = (24 - 7 * s) / 2 + 0.3;
  const pixels: string[] = [];
  glyph.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      if (row[c] !== "X") continue;
      const x = Number((ox + c * s).toFixed(2));
      const y = Number((oy + r * s).toFixed(2));
      pixels.push(`M${x} ${y}h${s}v${s}h-${s}z`);
    }
  });
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">` +
    `<rect x="1.5" y="1.5" width="21" height="21" rx="5" fill="${color}"/>` +
    `<path fill="#fff" d="${pixels.join("")}"/>` +
    `</svg>\n`
  );
}

