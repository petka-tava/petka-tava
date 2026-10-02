// Talmud Bavli locations: the 37 masechtot with a last daf/amud (from Sefaria's index lengths), plus a deterministic parser for typed shorthand.
// Ids equal the catalog ids (catalog_refs.id) of the Talmud section.
export const MASECHTOT = [
  ['Berakhot','ברכות',64,'a'],
  ['Shabbat','שבת',157,'b'],
  ['Eruvin','עירובין',105,'a'],
  ['Pesachim','פסחים',121,'b'],
  ['Yoma','יומא',88,'a'],
  ['Sukkah','סוכה',56,'b'],
  ['Beitzah','ביצה',40,'b'],
  ['Rosh Hashanah','ראש השנה',35,'a'],
  ['Taanit','תענית',31,'a'],
  ['Megillah','מגילה',32,'a'],
  ['Moed Katan','מועד קטן',29,'a'],
  ['Chagigah','חגיגה',27,'a'],
  ['Yevamot','יבמות',122,'b'],
  ['Ketubot','כתובות',112,'b'],
  ['Nedarim','נדרים',91,'b'],
  ['Nazir','נזיר',66,'b'],
  ['Sotah','סוטה',49,'b'],
  ['Gittin','גיטין',90,'b'],
  ['Kiddushin','קידושין',82,'b'],
  ['Bava Kamma','בבא קמא',119,'b'],
  ['Bava Metzia','בבא מציעא',119,'a'],
  ['Bava Batra','בבא בתרא',176,'b'],
  ['Sanhedrin','סנהדרין',113,'b'],
  ['Makkot','מכות',24,'b'],
  ['Shevuot','שבועות',49,'b'],
  ['Avodah Zarah','עבודה זרה',76,'b'],
  ['Horayot','הוריות',14,'a'],
  ['Zevachim','זבחים',120,'b'],
  ['Menachot','מנחות',110,'a'],
  ['Chullin','חולין',142,'a'],
  ['Bekhorot','בכורות',61,'a'],
  ['Arachin','ערכין',34,'a'],
  ['Temurah','תמורה',34,'a'],
  ['Keritot','כריתות',28,'b'],
  ['Meilah','מעילה',22,'a'],
  ['Tamid','תמיד',33,'b'],
  ['Niddah','נדה',73,'a']
].map(([id, he, last, lastAmud]) => ({ id, he, last, lastAmud, first: id === 'Tamid' ? 25 : 2 }));
const BY_ID = Object.fromEntries(MASECHTOT.map(m => [m.id, m]));
export const SOURCES = { gemara: 'גמרא', rashi: 'רש״י', tosafot: 'תוספות', rishonim: 'ראשונים', acharonim: 'אחרונים', other: 'אחר' };
const strip = s => String(s).normalize('NFKD').replace(/[\u0591-\u05C7]/g, '');
const norm = s => strip(s).replace(/[״”“]/g, '"').replace(/[׳’‘`]/g, "'").replace(/\s+/g, ' ').trim();
const squash = s => norm(s).replace(/["'.\s-]/g, '').toLowerCase();
const ALIAS = { 'בק': 'Bava Kamma', 'בם': 'Bava Metzia', 'בב': 'Bava Batra', 'עז': 'Avodah Zarah', 'רה': 'Rosh Hashanah', 'מוק': 'Moed Katan', 'מק': 'Moed Katan', 'ברכות': 'Berakhot', 'מקוצר': 'Moed Katan', 'סנה': 'Sanhedrin', 'ערובין': 'Eruvin', 'קדושין': 'Kiddushin', 'נידה': 'Niddah', 'חולין': 'Chullin', 'בכורות': 'Bekhorot' };
const HE_KEYS = MASECHTOT.map(m => [squash(m.he), m.id]);
const EN_KEYS = MASECHTOT.map(m => [squash(m.id), m.id]);
const FINAL = { ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' };
const VAL = { א: 1, ב: 2, ג: 3, ד: 4, ה: 5, ו: 6, ז: 7, ח: 8, ט: 9, י: 10, כ: 20, ל: 30, מ: 40, נ: 50, ס: 60, ע: 70, פ: 80, צ: 90, ק: 100, ר: 200, ש: 300, ת: 400 };
// Hebrew-letter number ("קי" = 110, "ס״ד" = 64). Returns null when the text is not a plausible numeral.
export function gematria(raw) {
  const t = norm(raw).replace(/["']/g, '').replace(/[ךםןףץ]/g, c => FINAL[c]);
  if (!/^[א-ת]{1,4}$/.test(t)) return null;
  let n = 0, prev = 1e9;
  for (const ch of t) { const v = VAL[ch]; if (v > prev && !(prev === 1e9)) return null; n += v; prev = v; }
  if (n === 15 || n === 16) return n;
  return n >= 1 && n <= 499 ? n : null;
}
const AMUD_WORDS = new Set(['עמוד', 'עמ', 'ע']);
const SKIP = new Set(['מסכת', 'מס', 'מסי', 'דף', 'דפ', 'ד', 'page', 'daf']);
function matchMasechet(text) {
  const q = squash(text); if (!q) return { ids: [] };
  if (ALIAS[q]) return { ids: [ALIAS[q]], exact: true };
  const exact = [...HE_KEYS, ...EN_KEYS].filter(([k]) => k === q).map(([, id]) => id);
  if (exact.length) return { ids: [...new Set(exact)], exact: true };
  if (q.length < 2) return { ids: [] };
  const pre = [...HE_KEYS, ...EN_KEYS].filter(([k]) => k.startsWith(q)).map(([, id]) => id);
  return { ids: [...new Set(pre)] };
}
export function validate(id, daf, amud) {
  const m = BY_ID[id]; if (!m) return 'bad_masechet';
  if (!Number.isInteger(daf) || daf < m.first || daf > m.last) return 'bad_daf';
  if (amud !== 'a' && amud !== 'b') return 'bad_amud';
  if (daf === m.last && m.lastAmud === 'a' && amud === 'b') return 'bad_amud';
  return null;
}
export const label = (id, daf, amud) => { const m = BY_ID[id]; return m ? `${m.he} ${hebrewNum(daf)} ע״${amud === 'a' ? 'א' : 'ב'}` : ''; };
export const display = (id, daf, amud) => { const m = BY_ID[id]; return m ? `מסכת ${m.he} דף ${hebrewNum(daf)} עמוד ${amud === 'a' ? 'א' : 'ב'}` : ''; };
export function hebrewNum(n) {
  const L = [[400, 'ת'], [300, 'ש'], [200, 'ר'], [100, 'ק'], [90, 'צ'], [80, 'פ'], [70, 'ע'], [60, 'ס'], [50, 'נ'], [40, 'מ'], [30, 'ל'], [20, 'כ'], [10, 'י'], [9, 'ט'], [8, 'ח'], [7, 'ז'], [6, 'ו'], [5, 'ה'], [4, 'ד'], [3, 'ג'], [2, 'ב'], [1, 'א']];
  let t = ''; let x = n;
  if (x === 15) return 'ט״ו'; if (x === 16) return 'ט״ז';
  for (const [v, c] of L) while (x >= v) { if (x === 15 || x === 16) { t += x === 15 ? 'טו' : 'טז'; x = 0; break; } t += c; x -= v; }
  return t.length === 1 ? t + '׳' : t.slice(0, -1) + '״' + t.slice(-1);
}
// Parse typed shorthand. Returns { results: [{id, he, daf, amud, label, display, error?}], missing? }.
// A result is complete when it has id, daf and amud and no error. Ambiguous masechet prefixes return several results.
export function parseLocation(input) {
  const s = norm(input || '');
  if (!s) return { results: [] };
  let amud = null, daf = null; const rest = [];
  // Sefaria style "Menachot 2b" and traditional "ב:" / "ב." suffixes
  let text = s.replace(/(\d+)\s*([abAB])\b/g, (_, d, a) => ` ${d} ע"${a.toLowerCase() === 'a' ? 'א' : 'ב'} `);
  text = text.replace(/([א-ת]{1,3}'?|\d+)([:.])(?=\s|$)/g, (_, d, p) => ` ${d.replace(/'$/, '')} ע"${p === ':' ? 'ב' : 'א'} `);
  const toks = text.split(' ').filter(Boolean);
  // 1) find the masechet: a two-word exact name, else the best single token (exact beats prefix, longer beats shorter)
  let mi = -1, mlen = 1, best = 0, bestLen = 0;
  const eligible = i => !/^\d+$/.test(toks[i]) && !SKIP.has(squash(toks[i])) && !AMUD_WORDS.has(squash(toks[i])) && !(/^ע["']?[אב]$/.test(toks[i]) && !ALIAS[squash(toks[i])]);
  for (let i = 0; i < toks.length; i++) {
    if (i + 1 < toks.length && eligible(i) && eligible(i + 1) && squash(toks[i]).length + squash(toks[i + 1]).length > 4) { const m2 = matchMasechet(toks[i] + ' ' + toks[i + 1]); if (m2.exact && 3 > best) { best = 3; mi = i; mlen = 2; } }
    if (!eligible(i)) continue;
    const m1 = matchMasechet(toks[i]); if (!m1.ids.length) continue;
    const sc = m1.exact ? 2 : 1;
    if (sc > best || (sc === best && squash(toks[i]).length > bestLen)) { best = sc; mi = i; mlen = 1; bestLen = squash(toks[i]).length; }
  }
  const nums = [];
  for (let i = 0; i < toks.length; i++) {
    if (i >= mi && i < mi + mlen && mi >= 0) continue;
    const t = toks[i], q = squash(t);
    if (SKIP.has(q) || SKIP.has(t)) continue;
    if (AMUD_WORDS.has(q) && i + 1 < toks.length && /^[אב]$/.test(squash(toks[i + 1]))) { amud = squash(toks[i + 1]) === 'א' ? 'a' : 'b'; i++; continue; }
    if (AMUD_WORDS.has(q) && i + 1 < toks.length && /^[ab]$/i.test(toks[i + 1])) { amud = toks[i + 1].toLowerCase(); i++; continue; }
    if (/^ע["']?[אב]$/.test(t)) { nums.push({ amudTok: t.endsWith('א') ? 'a' : 'b', i }); continue; }
    if (/^\d+$/.test(t)) { nums.push({ n: Number(t), i }); continue; }
    const g = gematria(t); if (g !== null) { nums.push({ n: g, i }); continue; }
    rest.push(t);
  }
  // amud tokens (ע"א/ע"ב) count as amud only after a daf number; otherwise the letters are the numeral 71/72
  const numericOnly = nums.filter(x => x.n !== undefined);
  for (const x of nums) {
    if (x.amudTok) {
      if (numericOnly.length && numericOnly[0].i < x.i || daf !== null) { amud = x.amudTok; }
      else { const v = x.amudTok === 'a' ? 71 : 72; numericOnly.push({ n: v, i: x.i }); }
    }
  }
  numericOnly.sort((a, b) => a.i - b.i);
  if (numericOnly.length) daf = numericOnly[0].n;
  if (numericOnly.length >= 2 && amud === null && (numericOnly[1].n === 1 || numericOnly[1].n === 2)) amud = numericOnly[1].n === 1 ? 'a' : 'b';
  const mm = mi >= 0 ? matchMasechet(toks.slice(mi, mi + mlen).join(' ')) : { ids: [] };
  if (!mm.ids.length) return { results: [], missing: 'masechet', daf, amud };
  const results = mm.ids.map(id => {
    const m = BY_ID[id]; const r = { id, he: m.he, daf, amud };
    if (daf === null) { r.error = 'missing_daf'; return r; }
    if (amud === null) { r.error = daf >= m.first && daf <= m.last ? 'missing_amud' : 'bad_daf'; return r; }
    const err = validate(id, daf, amud); if (err) r.error = err; else { r.label = label(id, daf, amud); r.display = display(id, daf, amud); }
    return r;
  });
  return { results, daf, amud, exact: !!mm.exact };
}
