// Prebuilt, font-free initial tiles. A name hash chooses a stable background.
export const TILE_COLORS = [
  "#0d9488", "#ea580c", "#7c3aed", "#16a34a", "#dc2626",
  "#2563eb", "#db2777", "#d97706", "#0891b2", "#65a30d",
];

export function tileColor(provider: string): string {
  let hash = 5381;
  for (let i = 0; i < provider.length; i++)
    hash = ((hash << 5) + hash + provider.charCodeAt(i)) | 0;
  return TILE_COLORS[(hash >>> 0) % TILE_COLORS.length]!;
}

export function tileLetter(provider: string): string {
  const letter = provider.trim().charAt(0).toUpperCase();
  return /^[A-Z0-9]$/.test(letter) ? letter : "?";
}

export function letterIconPath(provider: string): string {
  const letter = tileLetter(provider);
  if (letter === "?") return "icon.svg";
  return `icons/letters/${letter.toLowerCase()}-${TILE_COLORS.indexOf(tileColor(provider))}.svg`;
}
