/**
 * A player's state is hundreds of kilobytes. The agents read it in pieces:
 * one section at a time, with long lists, long text and deep nesting cut
 * down, so each look costs a few thousand tokens at most.
 */

export interface TrimOptions {
  /** Items kept from each list (the rest are counted). */
  maxItems: number;
  /** Characters kept from each string. */
  maxString: number;
  /** Levels of nesting kept (deeper values are summarised). */
  maxDepth: number;
}

export const DEFAULT_TRIM: TrimOptions = { maxItems: 8, maxString: 240, maxDepth: 5 };

export function trim(value: unknown, opts: TrimOptions = DEFAULT_TRIM, depth = 0): unknown {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'string' && value.length > opts.maxString)
      return `${value.slice(0, opts.maxString)}…`;
    return value;
  }
  if (Array.isArray(value)) {
    if (depth >= opts.maxDepth) return `[${value.length} items]`;
    const kept = value.slice(0, opts.maxItems).map((v) => trim(v, opts, depth + 1));
    if (value.length > opts.maxItems) kept.push(`…${value.length - opts.maxItems} more`);
    return kept;
  }
  const entries = Object.entries(value);
  if (depth >= opts.maxDepth) return `{${entries.length} fields}`;
  return Object.fromEntries(entries.map(([k, v]) => [k, trim(v, opts, depth + 1)]));
}

/**
 * One section of the view as JSON, no longer than `budget` characters: trimmed
 * harder (fewer items, shorter strings, shallower) until it fits.
 */
export function section(view: Record<string, unknown>, name: string, budget = 12_000): string {
  if (!(name in view)) return JSON.stringify({ error: `No section "${name}".` });
  const value = view[name];
  let opts = { ...DEFAULT_TRIM };
  for (;;) {
    const json = JSON.stringify(trim(value, opts));
    if (json.length <= budget || (opts.maxItems <= 1 && opts.maxDepth <= 1))
      return json.length <= budget ? json : `${json.slice(0, budget)}…(cut)`;
    opts = {
      maxItems: Math.max(1, Math.floor(opts.maxItems / 2)),
      maxString: Math.max(60, Math.floor(opts.maxString / 2)),
      maxDepth: Math.max(1, opts.maxDepth - 1),
    };
  }
}

/** The sections of a view and their sizes, so an agent knows what it can look at. */
export function sectionIndex(view: Record<string, unknown>): string {
  return Object.entries(view)
    .filter(([, v]) => v !== null && v !== undefined && JSON.stringify(v).length > 4)
    .map(([k, v]) => `${k} (${Math.round(JSON.stringify(v).length / 1000)}k)`)
    .join(', ');
}
