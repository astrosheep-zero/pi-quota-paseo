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
