// Shabbat and yom tov lock. Times are computed locally (no external service) for the Tel Aviv horizon.
// Lock window for each holy day D: from 20 minutes before sunset on the day before, until tzeit (sun 8.5 degrees below the horizon) at the end of D.
// Holy days: every Saturday plus the Israeli yom tov days (Rosh Hashana x2, Yom Kippur, Sukkot 15, Shemini Atzeret 22, Pesach 15 and 21, Shavuot 6).
const LAT = 32.0853, LON = 34.7818, TZ = 'Asia/Jerusalem', BEFORE_SUNSET_MIN = 20;
const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
const YT = new Set(['Tishri-1', 'Tishri-2', 'Tishri-10', 'Tishri-15', 'Tishri-22', 'Nisan-15', 'Nisan-21', 'Sivan-6']);

// y, m (1-12), d: civil date. Returns UTC ms of the evening event at the given zenith (degrees).
export function eveningEvent(y, m, d, zenith) {
  const noonMs = Date.UTC(y, m - 1, d, 12);
  const jd = noonMs / 86400000 + 2440587.5, T = (jd - 2451545) / 36525;
  const L0 = (280.46646 + T * (36000.76983 + T * 0.0003032)) % 360;
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const C = Math.sin(rad(M)) * (1.914602 - T * (0.004817 + 0.000014 * T)) + Math.sin(rad(2 * M)) * (0.019993 - 0.000101 * T) + Math.sin(rad(3 * M)) * 0.000289;
  const omega = 125.04 - 1934.136 * T, lam = L0 + C - 0.00569 - 0.00478 * Math.sin(rad(omega));
  const eps = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60 + 0.00256 * Math.cos(rad(omega));
  const decl = deg(Math.asin(Math.sin(rad(eps)) * Math.sin(rad(lam))));
  const yv = Math.tan(rad(eps / 2)) ** 2;
  const eqt = 4 * deg(yv * Math.sin(2 * rad(L0)) - 2 * e * Math.sin(rad(M)) + 4 * e * yv * Math.sin(rad(M)) * Math.cos(2 * rad(L0)) - 0.5 * yv * yv * Math.sin(4 * rad(L0)) - 1.25 * e * e * Math.sin(2 * rad(M)));
  const ha = deg(Math.acos(Math.cos(rad(zenith)) / (Math.cos(rad(LAT)) * Math.cos(rad(decl))) - Math.tan(rad(LAT)) * Math.tan(rad(decl))));
  const minutesUtc = 720 - 4 * LON - eqt + 4 * ha;
  return Date.UTC(y, m - 1, d) + Math.round(minutesUtc * 60000);
}
const civil = ms => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(ms).map(x => [x.type, x.value])); return [Number(p.year), Number(p.month), Number(p.day)]; };
const shift = ([y, m, d], n) => { const t = new Date(Date.UTC(y, m - 1, d + n)); return [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()]; };
export function isHolyDay([y, m, d]) {
  const t = new Date(Date.UTC(y, m - 1, d, 12));
  if (t.getUTCDay() === 6) return true;
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-u-ca-hebrew', { timeZone: 'UTC', day: 'numeric', month: 'long' }).formatToParts(t).map(x => [x.type, x.value]));
  return YT.has(p.month + '-' + p.day);
}
export const windowOf = c => ({ start: eveningEvent(...shift(c, -1), 90.833) - BEFORE_SUNSET_MIN * 60000, end: eveningEvent(...c, 98.5) });
// Is the moment inside a Shabbat/yom tov window? Returns { locked, until }.
export function holyNow(ms) {
  const today = civil(ms);
  for (const c of [today, shift(today, 1)]) {
    if (!isHolyDay(c)) continue;
    const w = windowOf(c);
    if (ms >= w.start && ms <= w.end) {
      let end = w.end, n = shift(c, 1);
      for (let i = 0; i < 4 && isHolyDay(n); i++) { end = windowOf(n).end; n = shift(n, 1); }
      return { locked: true, until: end };
    }
  }
  return { locked: false };
}
// Applies the console setting: switch off = no lock; manual_override true = locked now, false = open now, otherwise automatic.
export async function shabbatStatus(db, ms = Date.now()) {
  const r = await db.prepare("SELECT enabled, config_json FROM feature_flags WHERE key='shabbat_mode'").first();
  if (!r || !r.enabled) return { locked: false };
  const o = JSON.parse(r.config_json || '{}').manual_override;
  if (o === true) return { locked: true, manual: true };
  if (o === false) return { locked: false };
  return holyNow(ms);
}
