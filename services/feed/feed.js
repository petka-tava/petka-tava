import { getFlag } from '../admin/flags.js';
const json = o => new Response(JSON.stringify(o), { headers: { 'content-type': 'application/json' } });
// Guests get a "taste": at most guest_taste.max_items items (admin flag). Only published content is ever returned.
export async function feed(db, user, limit) {
  let n = Math.min(Number(limit) || 20, 50);
  let guest = false;
  if (!user) { const g = await getFlag(db, 'guest_taste'); if (!g.enabled) return json({ items: [], guest: true }); n = Math.min(n, g.config.max_items ?? 5); guest = true; }
  const { results } = await db.prepare("SELECT c.id,u.nickname,c.location,c.transcript,c.published_at,r.title_he,r.title_en FROM chiddushim c JOIN users u ON u.id=c.author_id LEFT JOIN catalog_refs r ON r.id=c.ref_id WHERE c.status='published' ORDER BY c.published_at DESC LIMIT ?").bind(n).all();
  return json({ items: results, guest });
}
