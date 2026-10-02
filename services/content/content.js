// User content: chiddushim (recording + transcript), comments, reactions, moderation. Every feature is gated by server flags.
import { requireFlag, getFlag } from '../admin/flags.js';
import { uploadAudio } from '../recording/recording.js';
import { resolveLocation } from '../library/library.js';
import { transcribeChidush } from '../transcription/transcribe.js';
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } });
const own = async (db, user, id) => db.prepare('SELECT * FROM chiddushim WHERE id=? AND author_id=?').bind(id, user.id).first();

export async function create(env, user, body) {
  await requireFlag(env.DB, 'recording');
  if (!String(body.location || '').trim() && body.daf == null && !body.ref_id) return json({ error: 'location_required' }, 400); // location is mandatory (spec)
  const L = await resolveLocation(env.DB, body);
  if (L.error) return json({ error: L.error }, 400);
  let ref = null;
  if (L.ref_id) { ref = await env.DB.prepare('SELECT r.id FROM catalog_refs r JOIN catalog_sections s ON s.id=r.section_id WHERE r.id=? AND s.active=1').bind(L.ref_id).first(); if (!ref) return json({ error: 'bad_ref' }, 400); }
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO chiddushim(id,author_id,ref_id,location,location_auto,daf,amud,source,status,created_at) VALUES(?,?,?,?,?,?,?,?,'draft',?)").bind(id, user.id, ref?.id ?? null, L.location, body.location_auto ? 1 : 0, L.daf, L.amud, L.source, Date.now()).run();
  return json({ ok: true, id });
}
export async function upload(env, ctx, user, id, req) {
  const c = await own(env.DB, user, id);
  if (!c) return json({ error: 'not_found' }, 404);
  if (c.status !== 'draft') return json({ error: 'not_draft' }, 409);
  const r = await uploadAudio(env.DB, user, id, req);
  if (r.status !== 200) return r;
  const t = (async () => { try { await transcribeChidush(env, id); } catch (e) { await env.DB.prepare("INSERT INTO audit_log(actor,action,detail,ts) VALUES('system','transcribe_failed',?,?)").bind(id, Date.now()).run(); } })();
  ctx?.waitUntil ? ctx.waitUntil(t) : await t;
  return json({ ok: true, transcribing: true });
}
export async function get(env, user, id) {
  const c = await own(env.DB, user, id);
  if (!c) return json({ error: 'not_found' }, 404);
  const a = await env.DB.prepare('SELECT seconds,expires_at FROM audio_blobs WHERE chidush_id=?').bind(id).first();
  return json({ id: c.id, status: c.status, ref_id: c.ref_id, daf: c.daf, amud: c.amud, source: c.source, location: c.location, transcript: c.transcript, transcript_ready: c.transcript != null, has_audio: !!a, audio_seconds: a?.seconds ?? null, audio_expires_at: a && a.expires_at < 9e15 ? a.expires_at : null, created_at: c.created_at });
}
export async function mine(env, user) {
  const { results } = await env.DB.prepare('SELECT id,status,ref_id,daf,amud,source,location,substr(transcript,1,120) AS preview,created_at,published_at FROM chiddushim WHERE author_id=? ORDER BY created_at DESC LIMIT 100').bind(user.id).all();
  return json({ items: results });
}
export async function setTranscript(env, user, id, body) {
  const c = await own(env.DB, user, id);
  if (!c) return json({ error: 'not_found' }, 404);
  const t = String(body.transcript ?? '').trim();
  if (!t || t.length > 8000) return json({ error: 'invalid' }, 400);
  await env.DB.prepare('UPDATE chiddushim SET transcript=? WHERE id=?').bind(t, id).run();
  return json({ ok: true });
}
export async function submit(env, user, id, ctx, origin, notify) {
  const c = await own(env.DB, user, id);
  if (!c) return json({ error: 'not_found' }, 404);
  if (c.status !== 'draft') return json({ error: 'not_draft' }, 409);
  if (!c.transcript) return json({ error: 'transcript_required' }, 400);
  const auto = await getFlag(env.DB, 'auto_approve');
  const st = auto.enabled ? 'published' : 'pending';
  await env.DB.prepare('UPDATE chiddushim SET status=?, published_at=? WHERE id=?').bind(st, st === 'published' ? Date.now() : null, id).run();
  if (st === 'pending' && notify) { const p = notify(env, origin, 'chidush', id, user.nickname, c.transcript); ctx?.waitUntil ? ctx.waitUntil(p) : await p; }
  return json({ ok: true, status: st });
}
export async function remove(env, user, id) {
  const c = await own(env.DB, user, id);
  if (!c) return json({ error: 'not_found' }, 404);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM audio_blobs WHERE chidush_id=?').bind(id), env.DB.prepare('DELETE FROM reactions WHERE chidush_id=?').bind(id),
    env.DB.prepare('DELETE FROM comments WHERE chidush_id=?').bind(id), env.DB.prepare('DELETE FROM chiddushim WHERE id=?').bind(id)]);
  return json({ ok: true });
}
export async function listComments(env, id) {
  const { results } = await env.DB.prepare("SELECT c.id,u.nickname,c.body,c.created_at FROM comments c JOIN users u ON u.id=c.author_id JOIN chiddushim d ON d.id=c.chidush_id WHERE c.chidush_id=? AND c.status='published' AND d.status='published' ORDER BY c.created_at LIMIT 200").bind(id).all();
  return json({ items: results });
}
export async function addComment(env, user, id, body, ctx, origin, notify) {
  const cfg = await requireFlag(env.DB, 'comments');
  const d = await env.DB.prepare("SELECT 1 FROM chiddushim WHERE id=? AND status='published'").bind(id).first();
  if (!d) return json({ error: 'not_found' }, 404);
  const text = String(body.body || '').trim();
  if (text.length < 1 || text.length > 1000) return json({ error: 'invalid' }, 400);
  const n = await env.DB.prepare('SELECT count(*) c FROM comments WHERE author_id=? AND created_at>?').bind(user.id, Date.now() - 3600000).first();
  if (n.c >= (cfg.per_hour ?? 10)) return json({ error: 'rate_limited' }, 429);
  const st = cfg.moderated === false ? 'published' : 'pending';
  const cid = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO comments(id,chidush_id,author_id,body,status,created_at) VALUES(?,?,?,?,?,?)').bind(cid, id, user.id, text, st, Date.now()).run();
  if (st === 'pending' && notify) { const p = notify(env, origin, 'comment', cid, user.nickname, text); ctx?.waitUntil ? ctx.waitUntil(p) : await p; }
  return json({ ok: true, status: st });
}
export async function react(env, user, id) {
  await requireFlag(env.DB, 'reactions');
  const d = await env.DB.prepare("SELECT 1 FROM chiddushim WHERE id=? AND status='published'").bind(id).first();
  if (!d) return json({ error: 'not_found' }, 404);
  const ex = await env.DB.prepare("SELECT 1 FROM reactions WHERE chidush_id=? AND user_id=? AND kind='shkoyach'").bind(id, user.id).first();
  if (ex) await env.DB.prepare("DELETE FROM reactions WHERE chidush_id=? AND user_id=? AND kind='shkoyach'").bind(id, user.id).run();
  else await env.DB.prepare("INSERT INTO reactions(chidush_id,user_id,kind) VALUES(?,?,'shkoyach')").bind(id, user.id).run();
  const n = await env.DB.prepare("SELECT count(*) c FROM reactions WHERE chidush_id=? AND kind='shkoyach'").bind(id).first();
  return json({ ok: true, mine: !ex, count: n.c });
}
// Account self-service
export async function logout(env, req) {
  const m = (req.headers.get('authorization') || '').match(/^Bearer (.+)$/);
  if (m) { const h = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(m[1])))].map(b => b.toString(16).padStart(2, '0')).join(''); await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(h).run(); }
  return json({ ok: true });
}
// Admin moderation (routes are hidden behind 404 for non-admins in the worker)
export async function adminQueue(env) {
  const a = await env.DB.prepare("SELECT c.id,u.nickname,c.location,c.transcript,c.created_at FROM chiddushim c JOIN users u ON u.id=c.author_id WHERE c.status='pending' ORDER BY c.created_at LIMIT 100").all();
  const b = await env.DB.prepare("SELECT m.id,m.chidush_id,u.nickname,m.body,m.created_at FROM comments m JOIN users u ON u.id=m.author_id WHERE m.status='pending' ORDER BY m.created_at LIMIT 100").all();
  return json({ chiddushim: a.results, comments: b.results });
}
export async function adminModerate(env, body) {
  const ok = body.action === 'approve' ? 'published' : body.action === 'reject' ? 'rejected' : null;
  if (!ok || !['chidush', 'comment'].includes(body.kind)) return json({ error: 'invalid' }, 400);
  if (body.kind === 'chidush') await env.DB.prepare('UPDATE chiddushim SET status=?, published_at=? WHERE id=? AND status=?').bind(ok, ok === 'published' ? Date.now() : null, body.id, 'pending').run();
  else await env.DB.prepare('UPDATE comments SET status=? WHERE id=? AND status=?').bind(ok, body.id, 'pending').run();
  await env.DB.prepare("INSERT INTO audit_log(actor,action,detail,ts) VALUES('admin','moderate',?,?)").bind(body.kind + ':' + body.id + ':' + ok, Date.now()).run();
  return json({ ok: true });
}
