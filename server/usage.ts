import { hashAccountKey, unavailable, type UsageAccount, type UsageReport, type UsageScope } from "@getpaseo/plugin/server/usage";
import {
  QuotaConfigError,
  QuotaError,
  codexAccountId,
  composeQuotaRegistry,
  createJsonClient,
  createPostJsonClient,
  parseQuotaConfig,
  validateSnapshot,
  type QuotaErrorCode,
} from "@astrosheep/pi-quota/query";
import { inputSchema } from "../shared/input.ts";
import { checkProviderAuth, spawnAuthCheck, type PiAuthReady, type SpawnAuthCheck } from "./pi-auth.ts";
import {
  readPiSettings,
  readPluginConfig,
  readProviderBaseUrls,
  resolveAgentDir,
  type ReadPluginConfig,
  type ReadSettings,
} from "./settings.ts";
import { snapshotToReport } from "./report.ts";

export interface UsageDeps {
  spawn?: SpawnAuthCheck;
  readSettings?: ReadSettings;
  readPluginConfig?: ReadPluginConfig;
  readBaseUrls?: (agentDir: string) => Promise<Record<string, string>>;
  getJson?: ReturnType<typeof createJsonClient>;
  postJson?: ReturnType<typeof createPostJsonClient>;
  env?: Record<string, string>;
  now?: () => number;
}

// Under Paseo's 20-second per-login deadline, with margin for auth resolution.
const FETCH_TIMEOUT_MS = 15_000;

/** process.env with the undefined values dropped, for child processes. */
function processEnvRecord(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}

// Adapters whose credentials live in the settings binding itself never call
// getAuth, so no `pi auth check` is needed to account for them.
const SETTINGS_BACKED_ADAPTERS = new Set(["yescode", "exec"]);

function quotaConfigOf(settings: unknown) {
  if (settings === null || typeof settings !== "object" || Array.isArray(settings)) return undefined;
  const quotaUsage = (settings as Record<string, unknown>).quotaUsage;
  if (quotaUsage === undefined) return undefined;
  return parseQuotaConfig(quotaUsage);
}

/** Settings-bound providers that authenticate from the settings file itself. */
function settingsBackedProviders(settings: unknown): Set<string> {
  const backed = new Set<string>();
  try {
    const config = quotaConfigOf(settings);
    if (!config) return backed;
    for (const [provider, options] of Object.entries(config.providers)) {
      if (SETTINGS_BACKED_ADAPTERS.has(options.adapter)) backed.add(provider);
    }
  } catch {
    // Invalid quotaUsage is handled (and warned about) in safeCompose.
  }
  return backed;
}

/**
 * Compose the quota registry exactly as the Pi extension does. An invalid
 * quotaUsage section never disables the built-in adapters: warn and fall back
 * to the built-in-only set, mirroring the extension's behavior.
 */
function safeCompose(settings: unknown): ReturnType<typeof composeQuotaRegistry> {
  try {
    return composeQuotaRegistry({ settings });
  } catch (error) {
    if (!(error instanceof QuotaConfigError)) throw error;
    console.warn("Ignoring invalid quotaUsage in Pi settings; using built-in adapters only");
    return composeQuotaRegistry();
  }
}

/** Rotation-stable, credential-free account identity within [A-Za-z0-9._-]. */
function accountKey(provider: string, auth: PiAuthReady, agentDir: string): string {
  if (auth.authType === "oauth") {
    const accountId = codexAccountId(auth.credentials);
    if (accountId !== undefined) return accountId.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 128);
    // Opaque OAuth tokens rotate on refresh; the store locator is the stable part.
    return hashAccountKey(`oauth:${provider}@${agentDir}`);
  }
  // API-key credentials only change when the account itself changes.
  return hashAccountKey(auth.credentials);
}

export async function discover(
  scope: UsageScope,
  deps: UsageDeps = {},
  include: (provider: string) => boolean = () => true,
): Promise<UsageAccount[]> {
  const env = scope.kind === "session" ? scope.env : (deps.env ?? processEnvRecord());
  const agentDir = resolveAgentDir(env);
  const readSettings = deps.readSettings ?? readPiSettings;
  const [settings, pluginConfig] = await Promise.all([
    readSettings(agentDir),
    (deps.readPluginConfig ?? readPluginConfig)(agentDir),
  ]);
  const hidden = new Set(pluginConfig.hide);
  const { registry, aliases } = safeCompose(settings);
  const settingsBacked = settingsBackedProviders(settings);

  let providers: string[];
  if (scope.kind === "global") {
    // An alias shares its target's account; listing both would query the same
    // credential twice and group into one card anyway.
    providers = registry
      .list()
      .map((adapter) => adapter.provider)
      .filter(
        (provider) =>
          aliases[provider] === undefined && !hidden.has(provider) && include(provider),
      );
  } else {
    if (scope.provider !== "pi") return [];
    const provider = scope.model?.split("/")[0];
    if (
      provider === undefined ||
      hidden.has(provider) ||
      !registry.get(provider) ||
      !include(provider)
    )
      return [];
    providers = [provider];
  }

  const spawn = deps.spawn ?? spawnAuthCheck;
  const accounts: UsageAccount[] = [];
  for (const provider of providers) {
    const adapter = registry.get(provider);
    if (!adapter) continue;
    const input = { provider, agentDir };
    if (settingsBacked.has(provider)) {
      accounts.push({
        key: hashAccountKey(`settings:${provider}@${agentDir}`),
        label: adapter.label,
        harness: "Pi",
        input,
      });
      continue;
    }
    // Alias adapters query under their target's identity (one hop), so auth
    // resolves for the target provider.
    const authProvider = aliases[provider] ?? provider;
    let auth: PiAuthReady | null;
    try {
      auth = await checkProviderAuth(authProvider, env, spawn);
    } catch (error) {
      console.warn(`pi auth check failed for ${authProvider}`, error);
      continue;
    }
    if (!auth) continue;
    accounts.push({
      key: accountKey(authProvider, auth, agentDir),
      label: adapter.label,
      harness: "Pi",
      input,
    });
  }
  return accounts;
}

/**
 * Providers to register sources for at plugin load: the registry minus
 * absorbed aliases. The hide list is intentionally not applied — hiding stays
 * a discover-time decision so config edits take effect without a reload.
 */
export function listLoadProviders(settings: unknown): { provider: string; label: string }[] {
  const { registry, aliases } = safeCompose(settings);
  return registry
    .list()
    .map((adapter) => ({ provider: adapter.provider, label: adapter.label }))
    .filter((entry) => aliases[entry.provider] === undefined);
}

function quotaErrorReport(code: QuotaErrorCode, retryAfterMs?: number): UsageReport {
  switch (code) {
    case "auth":
      return unavailable({ kind: "rejected", status: 401, refreshedBy: "pi" });
    case "account-access":
      return unavailable({ kind: "rejected", status: 403, refreshedBy: "pi" });
    case "unsupported-auth":
      return unavailable({
        kind: "no_quota",
        detail: "This provider's credentials or endpoint cannot be queried for quota",
      });
    case "rate-limit": {
      const waitMs = retryAfterMs;
      const when =
        waitMs === undefined ? "later" : waitMs < 60_000 ? "in a minute" : `in ${Math.ceil(waitMs / 60_000)}m`;
      return { status: "error", error: `Rate limited by the provider. Try again ${when}.` };
    }
    case "timeout":
      return { status: "error", error: "Provider request timed out" };
    case "network":
      return { status: "error", error: "Network error reaching the provider" };
    case "http":
      return { status: "error", error: "Provider service unavailable" };
    case "schema":
      return { status: "error", error: "Unrecognized quota response from the provider" };
  }
}

export async function fetchUsage(value: unknown, deps: UsageDeps = {}): Promise<UsageReport> {
  const input = inputSchema.parse(value);
  const readSettings = deps.readSettings ?? readPiSettings;
  // Re-read settings on every fetch: option changes and secret rotation in the
  // settings file take effect without rediscovery, and secrets never enter inputs.
  const settings = await readSettings(input.agentDir);
  const { registry } = safeCompose(settings);
  const adapter = registry.get(input.provider);
  if (!adapter) throw new Error(`Provider ${input.provider} no longer has a quota adapter`);

  const spawn = deps.spawn ?? spawnAuthCheck;
  // Relay adapters (new-api, Sub2API) build their query URL from the
  // provider's configured baseUrl, exactly as the extension resolves it from
  // the model registry.
  const baseUrls = await (deps.readBaseUrls ?? readProviderBaseUrls)(input.agentDir);
  const env = { ...(deps.env ?? processEnvRecord()), PI_CODING_AGENT_DIR: input.agentDir };
  let lastAuth: { provider: string; authType: string } | undefined;
  const queryContext = {
    provider: input.provider,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    now: deps.now ?? Date.now,
    async getAuth(provider: string) {
      const auth = await checkProviderAuth(provider, env, spawn);
      if (!auth) return undefined;
      lastAuth = { provider, authType: auth.authType };
      const baseUrl = baseUrls[provider];
      return baseUrl === undefined
        ? { apiKey: auth.credentials }
        : { apiKey: auth.credentials, baseUrl };
    },
    getJson: deps.getJson ?? createJsonClient(),
    postJson: deps.postJson ?? createPostJsonClient(),
  };
  const snapshot = await (async () => {
    try {
      return await adapter.query(queryContext);
    } catch (error) {
      // Self-heal: an expired OAuth login may only need the rotation the owning
      // CLI performs on every use. Delegate the refresh to `pi` itself — the
      // CLI writes its own store, we never do — then retry exactly once.
      if (!(error instanceof QuotaError) || error.code !== "auth" || lastAuth?.authType !== "oauth")
        throw error;
      const refreshed = await checkProviderAuth(lastAuth.provider, env, spawn, {
        allowRefresh: true,
      }).catch(() => null);
      if (!refreshed || refreshed.authType !== "oauth") throw error;
      return adapter.query(queryContext);
    }
  })().catch((error: unknown) => {
    if (error instanceof QuotaError) return quotaErrorReport(error.code, error.retryAfterMs);
    throw error;
  });
  if ("status" in snapshot) return snapshot;
  return snapshotToReport(validateSnapshot(snapshot));
}
