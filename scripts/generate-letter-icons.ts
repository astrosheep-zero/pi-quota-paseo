import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { TILE_COLORS, TILE_INITIALS, letterTileSvg } from "../server/icons.ts";

// Prebuilt SVGs: no font dependency and no writes to installed plugin dirs.
const dir = fileURLToPath(new URL("../icons/letters/", import.meta.url));
await mkdir(dir, { recursive: true });
await Promise.all(TILE_INITIALS.flatMap((letter) => TILE_COLORS.map((color, index) =>
  writeFile(`${dir}/${letter.toLowerCase()}-${index}.svg`, letterTileSvg(letter, color)),
)));
