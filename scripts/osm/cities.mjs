/**
 * The area of each city the game maps, as [west, south, east, north] in degrees.
 *
 * `wide` covers every district the game uses: coastline, water, parks and
 * main roads come from here. `core` is the busy centre: every street and
 * building outline comes from here.
 */
export const CITIES = {
  lagos: { wide: [3.3, 6.4, 3.6, 6.65], core: [3.38, 6.42, 3.45, 6.47] },
  nairobi: { wide: [36.68, -1.37, 36.9, -1.24], core: [36.8, -1.3, 36.83, -1.27] },
  london: { wide: [-0.2, 51.48, 0.0, 51.56], core: [-0.13, 51.5, -0.07, 51.52] },
  accra: { wide: [-0.25, 5.52, -0.1, 5.66], core: [-0.21, 5.54, -0.17, 5.58] },
  freetown: { wide: [-13.3, 8.42, -13.18, 8.5], core: [-13.25, 8.47, -13.21, 8.5] },
  kigali: { wide: [30.02, -1.99, 30.14, -1.92], core: [30.05, -1.96, 30.08, -1.94] },
  johannesburg: { wide: [27.85, -26.28, 28.25, -26.05], core: [28.03, -26.21, 28.06, -26.19] },
  cairo: { wide: [31.2, 29.95, 31.5, 30.11], core: [31.22, 30.04, 31.25, 30.07] },
  dubai: { wide: [55.13, 25.06, 55.36, 25.28], core: [55.26, 25.18, 55.29, 25.21] },
  'san-francisco': { wide: [-122.52, 37.7, -122.35, 37.84], core: [-122.42, 37.77, -122.39, 37.8] },
};
