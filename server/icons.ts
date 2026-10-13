// Prebuilt system-medium letter outlines. A name hash chooses a muted ink color.
export const TILE_COLORS = [
  "#7A8CA0", "#8C8495", "#89907E", "#7E8C86", "#92897E",
  "#788995", "#9F8679", "#8D8791", "#858B82", "#7C9293",
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
