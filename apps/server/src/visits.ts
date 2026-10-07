export const VISIT_GAP_MS = 30 * 60_000;
export const LIVE_WINDOW_MS = 45_000;
export const utcDay = (at: number) => new Date(at).toISOString().slice(0, 10);

export interface VisitStats {
  since: number | null;
  total: number;
  today: number;
  active: number;
  daily: { day: string; visits: number }[];
}

export function visitDays(days: Record<string, number>, now: number) {
  return Array.from({ length: 14 }, (_, i) => {
    const day = utcDay(now - (13 - i) * 86_400_000);
    return { day, visits: days[day] ?? 0 };
  });
}
