import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Where Pi resolves its agent directory from a launch environment. */
export function resolveAgentDir(env: Record<string, string>): string {
  const override = env.PI_CODING_AGENT_DIR;
  if (override !== undefined && override !== "") return override;
  const home = env.HOME || env.USERPROFILE || homedir();
  return join(home, ".pi", "agent");
}

export type ReadSettings = (agentDir: string) => Promise<unknown>;

/**
 * Provider baseUrl overrides from Pi's models.json. Adapters for relay
 * providers (new-api, Sub2API) need the baseUrl to build the query URL, the
 * same way the extension resolves it from the model registry. Malformed
 * files or entries are ignored: a broken models.json must not take quota
 * down with it.
 */
export async function readProviderBaseUrls(agentDir: string): Promise<Record<string, string>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await fs.readFile(join(agentDir, "models.json"), "utf8"));
  } catch {
    return {};
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const providers = (parsed as Record<string, unknown>).providers;
  if (providers === null || typeof providers !== "object" || Array.isArray(providers)) return {};
  const baseUrls: Record<string, string> = Object.create(null);
  for (const [provider, entry] of Object.entries(providers as Record<string, unknown>)) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) continue;
    const baseUrl = (entry as Record<string, unknown>).baseUrl;
    if (typeof baseUrl === "string" && baseUrl.trim() !== "") baseUrls[provider] = baseUrl;
  }
  return baseUrls;
}

export interface PluginConfig {
  hide: string[];
}

export type ReadPluginConfig = (agentDir: string) => Promise<PluginConfig>;

const CONFIG_FILE = "pi-quota-paseo.json";

/**
 * The plugin's own optional config file next to Pi's agent config:
 * `{ "hide": ["kimi-coding"] }` keeps providers out of every discovery
 * scope. Missing or invalid content means no filtering, never an error.
 */
export const readPluginConfig: ReadPluginConfig = async (agentDir) => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await fs.readFile(join(agentDir, CONFIG_FILE), "utf8"));
  } catch {
    return { hide: [] };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    console.warn(`Ignoring malformed ${CONFIG_FILE}`);
    return { hide: [] };
  }
  const hide = (parsed as Record<string, unknown>).hide;
  if (!Array.isArray(hide) || hide.some((p) => typeof p !== "string")) {
    if (hide !== undefined) console.warn(`Ignoring malformed "hide" list in ${CONFIG_FILE}`);
    return { hide: [] };
  }
  return { hide };
};

/**
 * Read Pi's global settings file. A missing or unreadable file means "no
 * configured providers", matching the extension's treatment of absent
 * settings; malformed JSON is warned about and treated the same way so a
 * broken file cannot take down discovery for the built-in providers.
 */
export const readPiSettings: ReadSettings = async (agentDir) => {
  let text: string;
  try {
    text = await fs.readFile(join(agentDir, "settings.json"), "utf8");
  } catch {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    console.warn(`Ignoring malformed Pi settings file in ${agentDir}`);
    return {};
  }
};
