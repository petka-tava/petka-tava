// Content-only library: books and dapim exist only when they hold published chiddushim. Nothing is pre-created.
import { getFlag } from '../admin/flags.js';
import { MASECHTOT, SOURCES, parseLocation, validate, label, display } from '../talmud/talmud.js';
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } });
const TALMUD = new Set(MASECHTOT.map(m => m.id));
export const isTalmudId = id => TALMUD.has(id);

// Typed shorthand -> structured location candidates (also used to pre-fill the record form).
export async function parse(url) { return json(parseLocation(url.searchParams.get('q') || '')); }

// Repository search across all sections for the record picker. Talmud masechtot come first.
export async function search(db, q) {
  const like = '%' + String(q || '').replace(/[%_]/g, '').slice(0, 60) + '%';
  if (like.length < 4) return json([]);
  const { results } = await db.prepare("SELECT r.id,r.title_he,r.title_en,r.section_id AS section FROM catalog_refs r JOIN catalog_sections s ON s.id=r.section_id WHERE s.active=1 AND (r.title_he LIKE ? OR r.title_en LIKE ?) ORDER BY CASE WHEN r.section_id='Talmud' AND r.id NOT LIKE '% on %' THEN 0 ELSE 1 END, length(r.title_he) LIMIT 20").bind(like, like).all();
  return json(results.map(r => ({ ...r, talmud_daf: TALMUD.has(r.id) })));
}

// Sections that contain published content, with counts.
export async function sections(db) {
  const { results } = await db.prepare("SELECT s.id,s.title_he,s.title_en,count(DISTINCT c.ref_id) AS books,count(*) AS chiddushim FROM chiddushim c JOIN catalog_refs r ON r.id=c.ref_id JOIN catalog_sections s ON s.id=r.section_id WHERE c.status='published' AND s.active=1 GROUP BY s.id ORDER BY s.sort").all();
  return json(results);
}
// Books that contain published content inside one section.
export async function books(db, section) {
  const { results } = await db.prepare("SELECT r.id,r.title_he,r.title_en,count(*) AS chiddushim FROM chiddushim c JOIN catalog_refs r ON r.id=c.ref_id WHERE c.status='published' AND r.section_id=? GROUP BY r.id ORDER BY max(c.published_at) DESC").bind(section).all();
  return json(results);
}
const itemSql = "SELECT c.id,u.nickname,c.location,c.transcript,c.published_at,c.daf,c.amud,c.source,(SELECT count(*) FROM reactions x WHERE x.chidush_id=c.id AND x.kind='shkoyach') AS shkoyach FROM chiddushim c JOIN users u ON u.id=c.author_id";
async function cap(db, user) { if (user) return 50; const g = await getFlag(db, 'guest_taste'); return g.enabled ? Math.min(g.config.max_items ?? 5, 50) : 0; }
const fix = i => ({ ...i, source_label: i.source ? SOURCES[i.source] || null : null });
// One book. Talmud books list their dapim/amudim that have content; other books list their chiddushim directly.
export async function book(db, user, id) {
  const r = await db.prepare('SELECT r.id,r.title_he,r.title_en,r.section_id AS section FROM catalog_refs r WHERE r.id=?').bind(id).first();
  if (!r) return json({ error: 'not_found' }, 404);
  const n = await db.prepare("SELECT count(*) AS c FROM chiddushim WHERE ref_id=? AND status='published'").bind(id).first();
  if (!n.c) return json({ error: 'not_found' }, 404);
  const out = { id: r.id, title_he: r.title_he, title_en: r.title_en, section: r.section, chiddushim: n.c, talmud: TALMUD.has(id) };
  if (out.talmud) {
    const { results } = await db.prepare("SELECT daf,amud,count(*) AS chiddushim FROM chiddushim WHERE ref_id=? AND status='published' AND daf IS NOT NULL GROUP BY daf,amud ORDER BY daf,amud").bind(id).all();
    out.dapim = results.map(x => ({ ...x, label: label(id, x.daf, x.amud) }));
    const nd = await db.prepare("SELECT count(*) AS c FROM chiddushim WHERE ref_id=? AND status='published' AND daf IS NULL").bind(id).first();
    out.without_daf = nd.c;
  }
  if (!out.talmud || out.without_daf) {
    const lim = await cap(db, user); out.guest = !user;
    const { results } = await db.prepare(itemSql + " WHERE c.ref_id=? AND c.status='published'" + (out.talmud ? ' AND c.daf IS NULL' : '') + ' ORDER BY c.published_at DESC LIMIT ?').bind(id, lim).all();
    out.items = results.map(fix);
  }
  return json(out);
}
// One daf/amud page. 404 when it holds no published chiddushim (pages are never empty).
export async function daf(db, user, id, d, a) {
  const dd = Number(d);
  if (!TALMUD.has(id) || validate(id, dd, a)) return json({ error: 'not_found' }, 404);
  const n = await db.prepare("SELECT count(*) AS c FROM chiddushim WHERE ref_id=? AND daf=? AND amud=? AND status='published'").bind(id, dd, a).first();
  if (!n.c) return json({ error: 'not_found' }, 404);
  const lim = await cap(db, user);
  const { results } = await db.prepare(itemSql + " WHERE c.ref_id=? AND c.daf=? AND c.amud=? AND c.status='published' ORDER BY c.published_at DESC LIMIT ?").bind(id, dd, a, lim).all();
  const m = MASECHTOT.find(x => x.id === id);
  return json({ book: { id, title_he: m.he }, daf: dd, amud: a, label: label(id, dd, a), display: display(id, dd, a), chiddushim: n.c, guest: !user, items: results.map(fix) });
}
// Resolve the structured location for a new chiddush from the request body. Returns { ref_id, daf, amud, source, location } or { error }.
export async function resolveLocation(db, body) {
  const text = String(body.location || '').trim().slice(0, 120);
  let ref_id = body.ref_id || null, daf = null, amud = null, source = null, location = text;
  if (body.daf != null || body.amud != null) {
    if (!TALMUD.has(ref_id)) return { error: 'bad_ref' };
    daf = Number(body.daf); amud = body.amud;
    if (validate(ref_id, daf, amud)) return { error: 'bad_location' };
    location = display(ref_id, daf, amud);
  } else if (TALMUD.has(ref_id) && text) {
    const m = MASECHTOT.find(x => x.id === ref_id); const p = parseLocation(m.he + ' ' + text); const r = p.results.length === 1 && !p.results[0].error ? p.results[0] : null;
    if (r && r.id === ref_id) { daf = r.daf; amud = r.amud; location = display(ref_id, daf, amud); }
  } else if (!ref_id && text) {
    const p = parseLocation(text); const ok = p.results.filter(r => !r.error);
    if (ok.length === 1 && p.results.length === 1) { ({ id: ref_id, daf, amud } = ok[0]); location = display(ref_id, daf, amud); }
  }
  if (daf !== null) { source = body.source == null ? 'gemara' : String(body.source); if (!SOURCES[source]) return { error: 'bad_source' }; }
  if (!location && ref_id) { const b = await db.prepare('SELECT title_he FROM catalog_refs WHERE id=?').bind(ref_id).first(); location = b?.title_he || ''; }
  if (!location) return { error: 'location_required' };
  return { ref_id, daf, amud, source, location };
}
