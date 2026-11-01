// Presentation only: use the server's complete, verified comparison aggregates.
// Evidence references can be a subset and must never be used to infer a mean.
export type SavingsComparison = {
  category: string;
  history_month_count: number;
  history_total_minor: number;
  history_average_minor: number;
  delta_minor: number;
  threshold_minor: number;
  trend: "up" | "down" | "flat";
  history_months: string[];
};

export const validSavingsAmount = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 10_000_000_000;

export function savingsAmount(value: unknown) {
  return validSavingsAmount(value) ? formatMinor(value) : "数据不足";
}

function formatMinor(value: number) {
  return `¥${(value / 100).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function savingsComparison(category: string, recent: unknown, comparisons: unknown) {
  const unavailable = { state: "unavailable", label: "数据不足", difference: "数据不足", comparison: null } as const;
  if (!validSavingsAmount(recent) || !Array.isArray(comparisons)) return unavailable;
  const matches = comparisons.filter(item => item?.category === category);
  if (matches.length !== 1) return unavailable;
  const item = matches[0] as SavingsComparison;
  const months = item.history_months;
  if (!Number.isSafeInteger(item.history_month_count) || item.history_month_count <= 0 ||
      !Number.isSafeInteger(item.history_total_minor) || item.history_total_minor < 0 ||
      !Array.isArray(months) || months.length !== item.history_month_count || new Set(months).size !== months.length ||
      months.some(month => typeof month !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) ||
      !Number.isFinite(item.history_average_minor) || item.history_average_minor < 0 ||
      item.history_average_minor !== item.history_total_minor / item.history_month_count ||
      !Number.isFinite(item.delta_minor) || item.delta_minor !== recent - item.history_average_minor ||
      !Number.isFinite(item.threshold_minor) || item.threshold_minor < 0 ||
      !["up", "down", "flat"].includes(item.trend)) return unavailable;
  // Round only for display. Direction is independent of the model's trend threshold.
  const cents = Math.round(Math.abs(item.delta_minor));
  if (cents === 0 && item.delta_minor !== 0) {
    return { state: item.delta_minor > 0 ? "up" : "down", label: item.delta_minor > 0 ? "↑ 增长" : "↓ 下降",
      difference: `${item.delta_minor > 0 ? "+" : "−"}<¥0.01`, comparison: item };
  }
  return { state: item.delta_minor > 0 ? "up" : item.delta_minor < 0 ? "down" : "flat",
    label: item.delta_minor > 0 ? "↑ 增长" : item.delta_minor < 0 ? "↓ 下降" : "持平",
    difference: item.delta_minor > 0 ? `+${formatMinor(cents)}` : item.delta_minor < 0 ? `−${formatMinor(cents)}` : "— ¥0.00",
    comparison: item };
}
