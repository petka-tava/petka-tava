const json = o => new Response(JSON.stringify(o), { headers: { 'content-type': 'application/json' } });
export async function sections(db) {
  const { results } = await db.prepare('SELECT id,title_he,title_en FROM catalog_sections WHERE active=1 ORDER BY sort').all();
  return json(results);
}
export async function books(db, section, q) {
  const like = '%' + (q || '').replace(/[%_]/g, '') + '%';
  const { results } = await db.prepare('SELECT r.id,r.title_he,r.title_en FROM catalog_refs r JOIN catalog_sections s ON s.id=r.section_id WHERE s.active=1 AND r.section_id=? AND (r.title_he LIKE ? OR r.title_en LIKE ?) ORDER BY r.rowid LIMIT 200').bind(section, like, like).all();
  return json(results);
}
// Whole-catalog search with real keyset pagination: pass the returned next_cursor back as cursor. Quotes and gershayim are ignored when matching (רשי finds רש"י).
const plain = s => String(s || '').replace(/["'״׳`’‘]/g, '').replace(/[%_]/g, '').trim().slice(0, 60);
export async function search(db, q, section, limit, cursor) {
  const n = Math.min(Math.max(Number(limit) || 30, 1), 100), c = Math.max(Number(cursor) || 0, 0), p = plain(q);
  const like = '%' + p + '%';
  const col = x => `replace(replace(replace(replace(${x},'"',''),'״',''),'''',''),'׳','')`;
  const where = `s.active=1 AND (? = '' OR r.section_id=?) AND (? = '' OR ${col('r.title_he')} LIKE ? OR r.title_en LIKE ?)`;
  const bind = [section || '', section || '', p, like, like];
  const { results } = await db.prepare(`SELECT r.rowid AS cur,r.id,r.title_he,r.title_en,r.section_id AS section FROM catalog_refs r JOIN catalog_sections s ON s.id=r.section_id WHERE ${where} AND r.rowid>? ORDER BY r.rowid LIMIT ?`).bind(...bind, c, n + 1).all();
  const more = results.length > n, items = results.slice(0, n);
  const total = c === 0 ? (await db.prepare(`SELECT count(*) AS t FROM catalog_refs r JOIN catalog_sections s ON s.id=r.section_id WHERE ${where}`).bind(...bind).first()).t : undefined;
  return json({ items: items.map(({ cur, ...r }) => r), next_cursor: more ? items[items.length - 1].cur : null, total });
}
