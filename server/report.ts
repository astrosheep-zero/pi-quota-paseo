import {
  balanceToneFromRemaining,
  toneFromUsedPct,
  usedPctOf,
  windowFromReportedDuration,
  type UsageBalance,
  type UsageDetail,
  type UsageReport,
  type UsageWindow,
} from "@getpaseo/plugin/server/usage";
import type { QuotaAllowance, QuotaSnapshot, QuotaWindow } from "@astrosheep/pi-quota/query";

/** Fold a quota scope or fallback id down to a stable, collision-safe window id part. */
function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || "window";
}

function usageWindow(window: QuotaWindow): UsageWindow {
  const usedPct =
    window.remainingPercent === null
      ? null
      : Math.min(100, Math.max(0, 100 - window.remainingPercent));
  return windowFromReportedDuration({
    durationSeconds: window.durationSeconds,
    scope: window.scope ? { id: slugify(window.scope), label: window.scope } : undefined,
    unknown: { id: slugify(window.id), label: window.label, shortLabel: window.label },
    utilizationPct: usedPct,
    resetsAt: window.resetAt === null ? null : new Date(window.resetAt).toISOString(),
    // Unscoped windows are the account's headline limits; scoped ones stay opt-in.
    summary: window.scope === undefined,
    tone: toneFromUsedPct(usedPct),
  });
}

function formatAmount(currency: string, amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(2)} ${currency}`;
}

function allowanceBalance(allowance: QuotaAllowance): UsageBalance {
  const usedPct = usedPctOf(allowance.used, allowance.limit);
  return {
    id: "allowance",
    label: "Quota",
    used: allowance.used,
    remaining: allowance.remaining,
    limit: allowance.limit,
    unit: "usd",
    tone: toneFromUsedPct(usedPct),
  };
}

/**
 * pi-quota snapshots carry ISO currencies; Paseo balances only meter
 * usd/credits/requests/tokens. Non-USD amounts stay fully visible as details
 * instead of being silently converted or dropped.
 */
export function snapshotToReport(snapshot: QuotaSnapshot): UsageReport {
  const windows = snapshot.windows.map(usageWindow);
  const balances: UsageBalance[] = [];
  const details: UsageDetail[] = [];

  const { balance, allowance, spend } = snapshot;
  if (balance !== undefined) {
    if (balance.unlimited === true) {
      details.push({ id: "balance", label: "Balance", value: "Unlimited" });
    } else if (balance.currency === "USD") {
      balances.push({
        id: "balance",
        label: "Balance",
        remaining: balance.remaining,
        unit: "usd",
        tone: balanceToneFromRemaining(balance.remaining),
      });
    } else {
      details.push({
        id: "balance",
        label: "Balance",
        value: formatAmount(balance.currency, balance.remaining),
        tone: balanceToneFromRemaining(balance.remaining),
      });
    }
  }
  if (allowance !== undefined) {
    if (allowance.currency === "USD") {
      balances.push(allowanceBalance(allowance));
    } else {
      details.push({
        id: "allowance",
        label: "Quota",
        value: `${formatAmount(allowance.currency, allowance.remaining)} of ${formatAmount(allowance.currency, allowance.limit)}`,
      });
    }
  }
  if (spend !== undefined) {
    if (spend.today !== undefined)
      details.push({ id: "spend_today", label: "Spent today", value: formatAmount(spend.currency, spend.today) });
    if (spend.lifetime !== undefined)
      details.push({ id: "spend_lifetime", label: "Spent lifetime", value: formatAmount(spend.currency, spend.lifetime) });
  }

  return {
    status: "available",
    windows,
    ...(balances.length > 0 ? { balances } : {}),
    ...(details.length > 0 ? { details } : {}),
  };
}
