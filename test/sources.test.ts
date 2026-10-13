import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import type { UsageSourceRegistration } from "@getpaseo/plugin/server/usage";
import { buildSourcePlan, registerSources } from "../server/sources.ts";
import { letterIconPath, letterTileSvg, tileColor, tileLetter } from "../server/icons.ts";
import type { UsageDeps } from "../server/usage.ts";

const providerOf = (account: { input: unknown }) => (account.input as { provider: string }).provider;

test("letter tiles are stable, font-free SVGs; same initials can have different colors", async () => {
  assert.equal(tileLetter("micu-ant"), "M");
  assert.equal(tileLetter("9relay"), "9");
  assert.equal(letterIconPath("未知"), "icon.svg");
  assert.equal(tileColor("cctq"), tileColor("cctq"));
  assert.notEqual(tileColor("cctq"), tileColor("codex-for"));
  const svg = letterTileSvg("micu-ant");
  assert.match(svg, /fill="#fff"/);
  assert.doesNotMatch(svg, /<text|<script|href=/);
  assert.equal(await readFile(new URL(`../${letterIconPath("micu-ant")}`, import.meta.url), "utf8"), svg);
});

test("source plan gives brands their logo and configured providers their initial; aliases stay absorbed", async () => {
  const plan = buildSourcePlan({ quotaUsage: { providers: {
    "my-ds": { adapter: "deepseek" },
    "ds-alias": { adapter: "alias", of: "my-ds" },
    "opencode-go-2": { adapter: "opencode-go" },
  } } });
  assert.equal(plan.find((s) => s.provider === "kimi-coding")?.icon, "icons/brand/kimi.svg");
  assert.equal(plan.find((s) => s.provider === "opencode-go-2")?.icon, "icons/brand/opencode.svg");
  assert.equal(plan.find((s) => s.provider === "my-ds")?.icon, letterIconPath("my-ds"));
  assert.ok(!plan.some((s) => s.provider === "ds-alias"));
  for (const source of plan) {
    const svg = await readFile(new URL(`../${source.icon}`, import.meta.url), "utf8");
    assert.match(svg, /^<svg\s/);
  }
});

test("per-provider sources and late-provider catch-all partition discovery in both scopes; hide stays live", async () => {
  let settings: unknown = {};
  let hide: string[] = [];
  const plan = buildSourcePlan(settings);
  const registered: UsageSourceRegistration[] = [];
  const deps: UsageDeps = {
    env: { PI_CODING_AGENT_DIR: "/tmp/pi-quota-test" },
    readSettings: async () => settings,
    readPluginConfig: async () => ({ hide }),
    spawn: async (args) => {
      const provider = args[args.indexOf("--provider") + 1];
      if (!["kimi-coding", "my-relay"].includes(provider!))
        return { code: 1, stdout: JSON.stringify({ status: "not_ready", provider }) };
      return { code: 0, stdout: JSON.stringify({ status: "ready", provider, authType: "api_key", credentials: `key-${provider}` }) };
    },
  };
  registerSources({ registerUsageSource: (s) => { registered.push(s); } }, plan, deps);
  const kimi = registered.find((s) => s.id === "pi-quota-kimi-coding")!;
  const fallback = registered.find((s) => s.id === "pi-quota")!;
  settings = { quotaUsage: { providers: { "my-relay": { adapter: "deepseek" } } } };
  const accounts = await kimi.discover({ kind: "global" });
  assert.deepEqual(accounts.map(providerOf), ["kimi-coding"]);
  assert.equal(accounts[0]?.label, undefined);
  assert.deepEqual((await fallback.discover({ kind: "global" })).map(providerOf), ["my-relay"]);
  const session = { kind: "session" as const, provider: "pi", model: "kimi-coding/model", env: deps.env! };
  assert.equal((await kimi.discover(session)).length, 1);
  assert.equal((await fallback.discover(session)).length, 0);
  assert.equal((await kimi.discover({ ...session, model: "my-relay/model" })).length, 0);
  assert.equal((await fallback.discover({ ...session, model: "my-relay/model" })).length, 1);
  hide = ["kimi-coding", "my-relay"];
  assert.equal((await kimi.discover({ kind: "global" })).length, 0);
  assert.equal((await fallback.discover({ kind: "global" })).length, 0);
});
