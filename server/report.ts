import {
  balanceToneFromRemaining,
  toneFromUsedPct,
  windowFromReportedDuration,
  type UsageBalance,
  type UsageDetail,
  type UsageReport,
  type UsageWindow,
} from "@getpaseo/plugin/server/usage";
import type { QuotaSnapshot, UsageLimit } from "@astrosheep/pi-quota/query";

function usageWindow(limit: UsageLimit): UsageWindow {
  const usedPct = limit.remainingPercent === null ? null : 100 - limit.remainingPercent;
  const window = windowFromReportedDuration({
    durationSeconds: limit.durationSeconds ?? null,
    scope: limit.scope ? { id: limit.scope, label: limit.scope } : undefined,
    unknown: { id: limit.id, label: limit.label, shortLabel: limit.label },
    utilizationPct: usedPct,
    resetsAt: limit.resetAt === null ? null : new Date(limit.resetAt).toISOString(),
    summary: limit.scope === undefined,
    tone: toneFromUsedPct(usedPct),
  });
  // Duration names are presentation, not identity: two limits can both be 5h.
  return { ...window, id: limit.id,
    label: limit.scope ? `${limit.scope} · ${limit.label}` : limit.label,
    shortLabel: limit.label,
  };
}

function formatAmount(unit: string, amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(2)} ${unit}`;
}

function meterUnit(unit: string): UsageBalance["unit"] | undefined {
  if (unit === "USD") return "usd";
  if (unit === "credits" || unit === "requests" || unit === "tokens") return unit;
  return undefined;
}

/** Preserve semantic categories; use host meters only for units they support. */
export function snapshotToReport(snapshot: QuotaSnapshot): UsageReport {
  const windows: UsageWindow[] = [];
  const balances: UsageBalance[] = [];
  const details: UsageDetail[] = [];

  for (const balance of snapshot.balances) {
    const id = `balance:${balance.id}`;
    const tone = balanceToneFromRemaining(balance.remaining);
    if (balance.currency === "USD") {
      balances.push({ id, label: balance.label, remaining: balance.remaining, unit: "usd", tone });
    } else {
      details.push({ id, label: balance.label, value: formatAmount(balance.currency, balance.remaining), tone });
    }
  }
  for (const limit of snapshot.limits) {
    const id = `limit:${limit.id}`;
    const label = limit.scope ? `${limit.scope} · ${limit.label}` : limit.label;
    if (limit.unlimited) {
      details.push({ id, label, value: "Unlimited" });
    } else if (limit.durationSeconds !== undefined || limit.amounts === undefined) {
      windows.push(usageWindow(limit));
    } else {
      const amounts = limit.amounts;
      const unit = meterUnit(amounts.unit);
      if (unit) {
        balances.push({
          id, label, used: amounts.used, remaining: amounts.remaining, limit: amounts.limit, unit,
          tone: toneFromUsedPct(limit.remainingPercent === null ? null : 100 - limit.remainingPercent),
          ...(limit.resetAt === null ? {} : { resetsAt: new Date(limit.resetAt).toISOString() }),
        });
      } else {
        details.push({ id, label, value: amounts.limit === null
          ? formatAmount(amounts.unit, amounts.remaining)
          : `${formatAmount(amounts.unit, amounts.remaining)} of ${formatAmount(amounts.unit, amounts.limit)}` });
      }
    }
  }
  for (const spend of snapshot.spending) {
    const period = spend.period === "today" ? "Today" : "Lifetime";
    const label = spend.label.toLowerCase() === period.toLowerCase() ? spend.label : `${spend.label} · ${period}`;
    details.push({ id: `spend:${spend.id}`, label, value: formatAmount(spend.currency, spend.amount) });
  }

  return {
    status: "available", windows,
    ...(balances.length > 0 ? { balances } : {}),
    ...(details.length > 0 ? { details } : {}),
  };
}
