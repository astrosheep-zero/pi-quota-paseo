import type { PluginServerContext } from "@getpaseo/plugin/server";
import { inputSchema } from "../shared/input.ts";
import { letterIconPath } from "./icons.ts";
import { discover, fetchUsage, listLoadProviders, type UsageDeps } from "./usage.ts";

export const CATCH_ALL_ID = "pi-quota";
const DEFAULT_ICON = "icon.svg";

/** Providers with a real brand mark; everything else gets a letter tile. */
const BRAND_ICONS: Record<string, string> = {
  "openai-codex": "icons/brand/codex.svg",
  "kimi-coding": "icons/brand/kimi.svg",
  deepseek: "icons/brand/deepseek.svg",
  "opencode-go": "icons/brand/opencode.svg",
  "opencode-go-2": "icons/brand/opencode.svg",
};

export interface SourcePlan {
  provider: string;
  label: string;
  icon: string;
}

/**
 * One source per provider, each with its own icon: brand logos where a brand
 * exists, a generated letter tile otherwise. Sources register synchronously
 * when the plugin loads, so the provider list freezes at load — the catch-all
 * source below keeps later additions visible without a restart.
 */
export function buildSourcePlan(settings: unknown): SourcePlan[] {
  return listLoadProviders(settings).map(({ provider, label }) => ({
    provider,
    label,
    icon: BRAND_ICONS[provider] ?? letterIconPath(provider),
  }));
}

export function registerSources(
  server: Pick<PluginServerContext, "registerUsageSource">,
  plan: SourcePlan[],
  deps: UsageDeps = {},
): void {
  const loaded = new Set(plan.map((entry) => entry.provider));
  for (const { provider, label, icon } of plan) {
    server.registerUsageSource({
      id: `${CATCH_ALL_ID}-${provider}`,
      label,
      icon,
      input: inputSchema,
      discover: async (scope) =>
        (await discover(scope, deps, (p) => p === provider))
          .map(({ label: _label, ...account }) => account),
      fetch: (input) => fetchUsage(input, deps),
    });
  }
  // Late providers stay visible without a restart; a reload gives them icons.
  server.registerUsageSource({
    id: CATCH_ALL_ID,
    label: "Pi Quota",
    icon: DEFAULT_ICON,
    input: inputSchema,
    discover: (scope) => discover(scope, deps, (p) => !loaded.has(p)),
    fetch: (input) => fetchUsage(input, deps),
  });
}
