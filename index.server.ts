import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import { resolveAgentDir } from "./server/settings.ts";
import { buildSourcePlan, registerSources } from "./server/sources.ts";

export default function contribute(server: PluginServerContext) {
  // Paseo bundles plugins as CommonJS and registration is synchronous.
  // Only registration needs this snapshot; discovery/fetch still re-read.
  let settings: unknown = {};
  try {
    const env = Object.fromEntries(
      Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
    );
    settings = JSON.parse(readFileSync(join(resolveAgentDir(env), "settings.json"), "utf8"));
  } catch {
    // Built-in sources still register; the catch-all discovers later additions.
  }
  registerSources(server, buildSourcePlan(settings));
  return () => {};
}
