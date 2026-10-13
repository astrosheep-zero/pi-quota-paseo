import assert from "node:assert/strict";
import test from "node:test";
import { snapshotToReport } from "../server/report.ts";
import type { QuotaSnapshot } from "@astrosheep/pi-quota/query";

test("windows convert remaining percent to used percent with duration names", () => {
  const report = snapshotToReport({
    windows: [
      { id: "shared/primary_window", label: "5h", remainingPercent: 72, resetAt: 1_800_000_000_000, durationSeconds: 18000 },
      { id: "shared/secondary_window", label: "1w", remainingPercent: null, resetAt: null, durationSeconds: 604800 },
    ],
    fetchedAt: 1_700_000_000_000,
  });
  assert.equal(report.status, "available");
  if (report.status !== "available") return;
  assert.equal(report.windows.length, 2);
  const [fiveHour, weekly] = report.windows;
  assert.equal(fiveHour.id, "five_hour");
  assert.equal(fiveHour.usedPct, 28);
  assert.equal(fiveHour.remainingPct, 72);
  assert.equal(fiveHour.resetsAt, new Date(1_800_000_000_000).toISOString());
  assert.equal(fiveHour.summary, true);
  assert.equal(fiveHour.tone, "ok");
  assert.equal(weekly.id, "weekly");
  assert.equal(weekly.usedPct, null);
  assert.equal(weekly.remainingPct, null);
  assert.equal(weekly.tone, "default");
});

test("scoped windows keep their quota domain in id and label", () => {
  const report = snapshotToReport({
    windows: [
      { id: "additional-0/primary_window", label: "5h", remainingPercent: 15, resetAt: null, durationSeconds: 18000, scope: "GPT-5.5-Codex" },
    ],
    fetchedAt: 1_700_000_000_000,
  });
  if (report.status !== "available") return;
  const [window] = report.windows;
  assert.equal(window.id, "gpt_5_5_codex:five_hour");
  assert.equal(window.label, "GPT-5.5-Codex · 5-hour");
  assert.equal(window.summary, undefined);
  assert.equal(window.tone, "warning"); // 15% remaining = 85% used, inside the 70..90 band
});

test("USD balances map to usage balances; other currencies become details", () => {
  const report = snapshotToReport({
    windows: [],
    balance: { currency: "USD", remaining: 12.5 },
    allowance: { currency: "CNY", limit: 100, used: 40, remaining: 60 },
    spend: { currency: "CNY", today: 3.21, lifetime: 100 },
    fetchedAt: 1_700_000_000_000,
  });
  if (report.status !== "available") return;
  assert.deepEqual(report.balances, [
    { id: "balance", label: "Balance", remaining: 12.5, unit: "usd", tone: "ok" },
  ]);
  const details = Object.fromEntries((report.details ?? []).map((d) => [d.id, d.value]));
  assert.equal(details.allowance, "60 CNY of 100 CNY");
  assert.equal(details.spend_today, "3.21 CNY");
  assert.equal(details.spend_lifetime, "100 CNY");
});

test("USD allowance becomes a metered balance and unlimited balance a detail", () => {
  const report = snapshotToReport({
    windows: [],
    balance: { currency: "USD", remaining: 0, unlimited: true },
    allowance: { currency: "USD", limit: 50, used: 49, remaining: 1 },
    fetchedAt: 1_700_000_000_000,
  });
  if (report.status !== "available") return;
  assert.deepEqual(report.balances, [
    { id: "allowance", label: "Quota", used: 49, remaining: 1, limit: 50, unit: "usd", tone: "danger" },
  ]);
  assert.deepEqual(report.details, [{ id: "balance", label: "Balance", value: "Unlimited" }]);
});
