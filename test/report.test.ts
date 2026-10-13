import assert from "node:assert/strict";
import test from "node:test";
import { snapshotToReport } from "../server/report.ts";
import type { QuotaSnapshot } from "@astrosheep/pi-quota/query";

const empty: QuotaSnapshot = { balances: [], limits: [], spending: [], fetchedAt: 1_700_000_000_000 };

test("limits retain source identity even with matching durations, and unknown stays unknown", () => {
  const report = snapshotToReport({ ...empty, limits: [
    { id: "primary", label: "5h", remainingPercent: 72, resetAt: 1_800_000_000_000, durationSeconds: 18000 },
    { id: "other", label: "5h", remainingPercent: null, resetAt: null, durationSeconds: 18000 },
    { id: "scoped", label: "5h", remainingPercent: 15, resetAt: null, durationSeconds: 18000, scope: "GPT-5.5-Codex" },
  ] });
  assert.equal(report.status, "available");
  if (report.status !== "available") return;
  const [first, second, scoped] = report.windows;
  assert.deepEqual(report.windows.map(w => w.id), ["primary", "other", "scoped"]);
  assert.equal(first.usedPct, 28);
  assert.equal(first.remainingPct, 72);
  assert.equal(first.resetsAt, new Date(1_800_000_000_000).toISOString());
  assert.equal(first.summary, true);
  assert.equal(second.usedPct, null);
  assert.equal(second.remainingPct, null);
  assert.equal(scoped.label, "GPT-5.5-Codex · 5h");
  assert.equal(scoped.summary, undefined);
  assert.equal(scoped.tone, "warning");
});

test("multiple wallets, limits, and expenses preserve categories and labels", () => {
  const report = snapshotToReport({ ...empty,
    balances: [
      { id: "main", label: "Wallet", currency: "USD", remaining: 12.5 },
      { id: "yuan", label: "Yuan wallet", currency: "CNY", remaining: -2 },
    ],
    limits: [
      { id: "main", label: "Quota", remainingPercent: 2, resetAt: null, amounts: { unit: "USD", limit: 50, used: 49, remaining: 1 } },
      { id: "yuan", label: "Yuan quota", remainingPercent: 60, resetAt: null, amounts: { unit: "CNY", limit: 100, used: 40, remaining: 60 } },
      { id: "token", label: "Token quota", remainingPercent: null, resetAt: null, amounts: { unit: "tokens", limit: null, used: 40, remaining: 60 } },
      { id: "uncapped", label: "Uncapped", remainingPercent: null, resetAt: null, unlimited: true },
    ],
    spending: [
      { id: "main", label: "Today", currency: "CNY", amount: 3.21, period: "today" },
      { id: "all", label: "Lifetime", currency: "CNY", amount: 100, period: "lifetime" },
    ],
  });
  if (report.status !== "available") assert.fail("not available");
  assert.deepEqual(report.balances, [
    { id: "balance:main", label: "Wallet", remaining: 12.5, unit: "usd", tone: "ok" },
    { id: "limit:main", label: "Quota", used: 49, remaining: 1, limit: 50, unit: "usd", tone: "danger" },
    { id: "limit:token", label: "Token quota", used: 40, remaining: 60, limit: null, unit: "tokens", tone: "default" },
  ]);
  const details = Object.fromEntries((report.details ?? []).map(d => [d.id, d.value]));
  assert.equal(details["balance:yuan"], "-2 CNY");
  assert.equal(details["limit:yuan"], "60 CNY of 100 CNY");
  assert.equal(details["limit:uncapped"], "Unlimited");
  assert.equal(details["spend:main"], "3.21 CNY");
  assert.equal(details["spend:all"], "100 CNY");
});

test("spending-only reports and missing monetary caps do not fabricate zero", () => {
  const report = snapshotToReport({ ...empty, spending: [
    { id: "today", label: "Today", currency: "USD", amount: 1, period: "today" },
  ] });
  assert.equal(report.status, "available");
  if (report.status !== "available") return;
  assert.deepEqual(report.windows, []);
  assert.equal(report.balances, undefined);
  assert.equal(report.details?.[0].value, "1 USD");
  const unknownCap = snapshotToReport({ ...empty, limits: [
    { id: "x", label: "Quota", remainingPercent: null, resetAt: null, amounts: { unit: "CNY", limit: null, used: 2, remaining: 8 } },
  ] });
  if (unknownCap.status !== "available") assert.fail("not available");
  assert.equal(unknownCap.details?.[0].value, "8 CNY");
});
