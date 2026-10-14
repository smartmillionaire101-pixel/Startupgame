/** NOAA solar position approximation, using UTC to avoid DST discontinuities.
 * https://gml.noaa.gov/grad/solcalc/solareqns.PDF
 */
import { CITY_GEO } from './coordinates';
const rad = Math.PI / 180;
export function solarPosition(lat: number, lon: number, now: number) {
  const d = new Date(now),
    year = d.getUTCFullYear();
  const day = (now - Date.UTC(year, 0, 1)) / 86400000;
  const days = (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86400000;
  const g = ((2 * Math.PI) / days) * (day - 0.5);
  const eq =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(g) -
      0.032077 * Math.sin(g) -
      0.014615 * Math.cos(2 * g) -
      0.040849 * Math.sin(2 * g));
  const decl =
    0.006918 -
    0.399912 * Math.cos(g) +
    0.070257 * Math.sin(g) -
    0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) -
    0.002697 * Math.cos(3 * g) +
    0.00148 * Math.sin(3 * g);
  const minutes = d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60;
  const ha = (((((minutes + eq + 4 * lon) % 1440) + 1440) % 1440) / 4 - 180) * rad;
  const phi = lat * rad;
  const altitude = Math.asin(
    Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(ha),
  );
  const azimuth =
    Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi)) +
    Math.PI;
  const cosH =
    Math.cos(90.833 * rad) / (Math.cos(phi) * Math.cos(decl)) - Math.tan(phi) * Math.tan(decl);
  const halfDay = (Math.acos(Math.max(-1, Math.min(1, cosH))) / rad) * 4;
  const midnight = Date.UTC(year, d.getUTCMonth(), d.getUTCDate());
  return {
    altitude,
    azimuth,
    night: altitude < -6 * rad,
    dusk: altitude >= -6 * rad && altitude < 6 * rad,
    sunrise: midnight + (720 - 4 * lon - eq - halfDay) * 60000,
    sunset: midnight + (720 - 4 * lon - eq + halfDay) * 60000,
  };
}
export function citySun(city: string, now = Date.now()) {
  const g = CITY_GEO[city] ?? CITY_GEO.lagos!;
  return solarPosition(g.lat, g.lon, now);
}
