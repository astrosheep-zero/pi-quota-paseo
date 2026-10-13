import assert from "node:assert/strict";
import test from "node:test";
import { discover, fetchUsage, type UsageDeps } from "../server/usage.ts";
import type { SpawnAuthCheck } from "../server/pi-auth.ts";

const AGENT_DIR = "/tmp/pi-quota-paseo-test-agent";

function readySpawn(credentials: Record<string, string>): SpawnAuthCheck {
  return async (args) => {
    const provider = args[args.indexOf("--provider") + 1]!;
    const key = credentials[provider];
    return key === undefined
      ? { stdout: JSON.stringify({ status: "not_ready", provider, reason: "credentials_not_configured" }), code: 1 }
      : { stdout: JSON.stringify({ status: "ready", provider, authType: "api_key", credentials: key }), code: 0 };
  };
}

function deps(overrides: Partial<UsageDeps> = {}): UsageDeps {
  return {
    env: { HOME: "/nonexistent", PI_CODING_AGENT_DIR: AGENT_DIR, PATH: "/usr/bin" },
    readSettings: async () => ({}),
    ...overrides,
  };
}

test("global discovery lists auth-ready built-in providers only", async () => {
  const accounts = await discover(
    { kind: "global" },
    deps({ spawn: readySpawn({ deepseek: "sk-one", "kimi-coding": "sk-two" }) }),
  );
  const providers = accounts.map((account) => (account.input as { provider: string }).provider).sort();
  assert.deepEqual(providers, ["deepseek", "kimi-coding"]);
  for (const account of accounts) {
    assert.match(account.key, /^[A-Za-z0-9._-]{1,128}$/);
    assert.equal(account.harness, "Pi");
    assert.equal((account.input as { agentDir: string }).agentDir, AGENT_DIR);
  }
  // API-key accounts share a key exactly when the credential matches.
  const again = await discover(
    { kind: "global" },
    deps({ spawn: readySpawn({ deepseek: "sk-one", "kimi-coding": "sk-two" }) }),
  );
  assert.deepEqual(accounts.map((a) => a.key), again.map((a) => a.key));
});

test("global discovery includes settings-bound adapters and skips absorbed aliases", async () => {
  const settings = {
    quotaUsage: {
      providers: {
        "my-ds": { adapter: "deepseek" },
        "ds-alias": { adapter: "alias", of: "my-ds" },
        "my-yes": { adapter: "yescode", username: "u", password: "p" },
      },
    },
  };
  const accounts = await discover(
    { kind: "global" },
    deps({
      readSettings: async () => settings,
      spawn: readySpawn({ "my-ds": "sk-three" }),
    }),
  );
  const providers = accounts.map((account) => (account.input as { provider: string }).provider).sort();
  assert.deepEqual(providers, ["my-ds", "my-yes"]); // no ds-alias row, yescode without pi auth
});

test("session discovery resolves only the session model provider via its launch env", async () => {
  const spawnCalls: { args: string[]; env: Record<string, string> }[] = [];
  const spawn: SpawnAuthCheck = async (args, env) => {
    spawnCalls.push({ args, env });
    return readySpawn({ deepseek: "sk-session" })(args, env);
  };
  const sessionEnv = { HOME: "/home/session", PI_CODING_AGENT_DIR: "/session-agent", CUSTOM: "1" };
  const accounts = await discover(
    { kind: "session", provider: "pi", model: "deepseek/deepseek-chat", env: sessionEnv },
    deps({ spawn }),
  );
  assert.equal(accounts.length, 1);
  assert.equal((accounts[0]!.input as { provider: string }).provider, "deepseek");
  assert.equal((accounts[0]!.input as { agentDir: string }).agentDir, "/session-agent");
  // The auth check ran against the session's own launch environment, not ours.
  assert.deepEqual(spawnCalls[0]!.env, sessionEnv);
});

test("session discovery returns nothing for other harnesses or unmapped providers", async () => {
  const spawn = readySpawn({ deepseek: "sk-session" });
  assert.deepEqual(
    await discover({ kind: "session", provider: "claude", model: "deepseek/x", env: {} }, deps({ spawn })),
    [],
  );
  assert.deepEqual(
    await discover({ kind: "session", provider: "pi", model: "unknown/x", env: {} }, deps({ spawn })),
    [],
  );
  assert.deepEqual(
    await discover({ kind: "session", provider: "pi", env: {} }, deps({ spawn })),
    [],
  );
});

test("session discovery of an alias provider authenticates against its target", async () => {
  const settings = { quotaUsage: { providers: { "ds-alias": { adapter: "alias", of: "deepseek" } } } };
  const seen: string[] = [];
  const spawn: SpawnAuthCheck = async (args, env) => {
    seen.push(args[args.indexOf("--provider") + 1]!);
    return readySpawn({ deepseek: "sk-target" })(args, env);
  };
  const accounts = await discover(
    { kind: "session", provider: "pi", model: "ds-alias/deepseek-chat", env: { HOME: "/h" } },
    deps({ spawn, readSettings: async () => settings }),
  );
  assert.equal(accounts.length, 1);
  assert.deepEqual(seen, ["deepseek"]);
  assert.equal((accounts[0]!.input as { provider: string }).provider, "ds-alias");
});

test("fetch maps a missing login to a rejected report, never credentials", async () => {
  const report = await fetchUsage(
    { provider: "deepseek", agentDir: AGENT_DIR },
    deps({ spawn: readySpawn({}) }),
  );
  assert.deepEqual(report, {
    status: "unavailable",
    problem: { kind: "rejected", status: 401, refreshedBy: "pi" },
  });
});

test("fetch throws when the provider lost its adapter since discovery", async () => {
  await assert.rejects(
    fetchUsage({ provider: "not-configured", agentDir: AGENT_DIR }, deps()),
    /no longer has a quota adapter/,
  );
});

test("fetch end-to-end through an exec adapter bound in settings", async () => {
  const snapshot = {
    windows: [{ id: "w", label: "1d", remainingPercent: 50, resetAt: null, durationSeconds: 86400 }],
    fetchedAt: 0,
  };
  const command = [process.execPath, "-e", `console.log(JSON.stringify(${JSON.stringify(snapshot)}))`];
  const settings = { quotaUsage: { providers: { probe: { adapter: "exec", command, label: "Probe" } } } };
  const report = await fetchUsage(
    { provider: "probe", agentDir: AGENT_DIR },
    deps({ readSettings: async () => settings, now: () => 1_700_000_000_000 }),
  );
  if (report.status !== "available") assert.fail(`expected available, got ${JSON.stringify(report)}`);
  assert.equal(report.windows.length, 1);
  assert.equal(report.windows[0]!.id, "86400s"); // only 5h/weekly get named ids
  assert.equal(report.windows[0]!.usedPct, 50);
});

test("fetch treats a dying pi auth check as an auth rejection (known limitation)", async () => {
  // officialAuth converts any getAuth failure into QuotaError('auth'), so a
  // missing pi binary surfaces as 'rejected' rather than a raw spawn error.
  const spawn: SpawnAuthCheck = async () => {
    throw new Error("spawn pi ENOENT");
  };
  const report = await fetchUsage({ provider: "deepseek", agentDir: AGENT_DIR }, deps({ spawn }));
  assert.deepEqual(report, {
    status: "unavailable",
    problem: { kind: "rejected", status: 401, refreshedBy: "pi" },
  });
});
