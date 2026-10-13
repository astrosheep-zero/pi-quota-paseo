import { mkdir, readFile, writeFile } from "node:fs/promises";
import { TILE_COLORS } from "../server/icons.ts";

// Frozen medium-weight system glyph outlines: no fonts needed on the client.
const paths: Record<string, string> = JSON.parse(
  await readFile(new URL("./letter-paths.json", import.meta.url), "utf8"),
);
const dir = new URL("../icons/letters/", import.meta.url);
await mkdir(dir, { recursive: true });
await Promise.all(Object.entries(paths).flatMap(([letter, d]) => TILE_COLORS.map((color, index) =>
  writeFile(new URL(`${letter.toLowerCase()}-${index}.svg`, dir),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="${color}" d="${d}"/></svg>\n`),
)));
