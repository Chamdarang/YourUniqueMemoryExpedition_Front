/** Map-only colors. Day colors distinguish series; status colors communicate route state. */
export const MAP_COLORS = {
  route: '#2563EB',
  current: '#F97316',
  saved: '#10B981',
  savedBorder: '#059669',
  searchResult: '#EF4444',
  searchResultBorder: '#B91C1C',
  selectedBorder: '#1D4ED8',
  warning: '#F59E0B',
  error: '#EF4444',
  routeFallback: '#64748B',
} as const;

const PLAN_DAY_COLORS = [MAP_COLORS.route, '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'] as const;

export function getPlanDayColor(dayOrder: number) {
  return PLAN_DAY_COLORS[(dayOrder - 1) % PLAN_DAY_COLORS.length];
}
