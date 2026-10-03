export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const clamp01 = (value: number): number => clamp(value, 0, 1);

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const logistic = (x: number): number => 1 / (1 + Math.exp(-x));

/** Round to a fixed number of decimal places (for display-stable stars, ratios). */
export const roundTo = (value: number, places: number): number => {
  const f = 10 ** places;
  return Math.round(value * f) / f;
};

export const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0);
