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
