// Manual registration, contact form and admin user tools. Schema is created lazily (idempotent) so no extra D1 token is needed.
import { requireFlag } from '../admin/flags.js';
import { sendMail } from '../notifications/gmail.js';
import { emailStart } from './auth.js';
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } });
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const sha = async s => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let ready = false;
export async function ensureSchema(db) {
  if (ready) return;
  await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS pending_regs(email TEXT PRIMARY KEY, nickname TEXT NOT NULL, phone_hash TEXT, created_at INTEGER NOT NULL)'),
    db.prepare('CREATE TABLE IF NOT EXISTS user_private(user_id TEXT PRIMARY KEY, phone_hash TEXT)'),
    db.prepare('CREATE TABLE IF NOT EXISTS rate_hits(kind TEXT NOT NULL, key_hash TEXT NOT NULL, ts INTEGER NOT NULL)'),
    db.prepare("INSERT OR IGNORE INTO feature_flags(key,enabled,config_json,updated_at) VALUES('contact_form',1,'{\"per_hour\":3}',0),('signup_manual',1,'{}',0)"),
  ]);
  ready = true;
}
export const phoneHash = async (env, raw) => {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.length < 9 || d.length > 15) return null;
  return sha('phone:' + (env.PHONE_SALT || env.GMAIL_CLIENT_SECRET) + ':' + d.slice(-9));
};
const validNick = n => typeof n === 'string' && n.trim().length >= 2 && n.trim().length <= 24 && !/[<>@\/\\]/.test(n);
const validEmail = e => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) && e.length <= 120;

export async function register(env, body) {
  await ensureSchema(env.DB);
  await requireFlag(env.DB, 'signups');
  await requireFlag(env.DB, 'signup_manual');
  const email = String(body.email || '').trim().toLowerCase();
  const name = body.display_name ?? body.nickname;
  if (!validEmail(email)) return json({ error: 'invalid', field: 'email' }, 400);
  if (!validNick(name)) return json({ error: 'invalid', field: 'display_name' }, 400);
  if (body.consent !== true) return json({ error: 'invalid', field: 'consent' }, 400);
  let ph = null;
  if (body.phone) { ph = await phoneHash(env, body.phone); if (!ph) return json({ error: 'invalid', field: 'phone' }, 400); }
  if (await env.DB.prepare('SELECT 1 FROM users WHERE email=?').bind(email).first()) return json({ error: 'exists' }, 409);
  if (await env.DB.prepare('SELECT 1 FROM users WHERE lower(nickname)=lower(?)').bind(name.trim()).first()) return json({ error: 'nickname_taken' }, 409);
  await env.DB.prepare('INSERT INTO pending_regs(email,nickname,phone_hash,created_at) VALUES(?,?,?,?) ON CONFLICT(email) DO UPDATE SET nickname=excluded.nickname, phone_hash=excluded.phone_hash, created_at=excluded.created_at').bind(email, name.trim(), ph, Date.now()).run();
  const r = await emailStart(env, { email });
  if (r.status !== 200) return r;
  return json({ ok: true, pending: true });
}

// Called by emailVerify when a new account is created: returns the pending nickname (if any) and stores the phone hash.
export async function takePending(env, email) {
  await ensureSchema(env.DB);
  const p = await env.DB.prepare('SELECT nickname,phone_hash FROM pending_regs WHERE email=?').bind(email).first();
  if (p) await env.DB.prepare('DELETE FROM pending_regs WHERE email=?').bind(email).run();
  return p;
}
export async function savePhone(env, userId, hash) {
  if (hash) await env.DB.prepare('INSERT OR REPLACE INTO user_private(user_id,phone_hash) VALUES(?,?)').bind(userId, hash).run();
}

export async function contact(env, req, body) {
  await ensureSchema(env.DB);
  const cfg = await requireFlag(env.DB, 'contact_form');
  if (body.website) return json({ ok: true }); // honeypot: pretend success
  const email = String(body.email || '').trim();
  const msg = String(body.message || '').trim();
  const name = String(body.name || '').trim().slice(0, 80);
  if (!validEmail(email) || msg.length < 5 || msg.length > 2000) return json({ error: 'invalid' }, 400);
  const ip = await sha('ip:' + (req.headers.get('cf-connecting-ip') || 'x'));
  const since = Date.now() - 3600000;
  const n = await env.DB.prepare("SELECT count(*) c FROM rate_hits WHERE kind='contact' AND key_hash=? AND ts>?").bind(ip, since).first();
  if (n.c >= (cfg.per_hour ?? 3)) return json({ error: 'rate_limited' }, 429);
  await env.DB.prepare("INSERT INTO rate_hits(kind,key_hash,ts) VALUES('contact',?,?)").bind(ip, Date.now()).run();
  await env.DB.prepare("DELETE FROM rate_hits WHERE ts<?").bind(Date.now() - 86400000).run();
  const r = await sendMail(env, { to: 'petkatava@gmail.com', subject: 'פנייה מהאתר: ' + (name || email), html: `<div dir="rtl"><b>שם:</b> ${esc(name)}<br><b>דוא״ל:</b> ${esc(email)}<br><br>${esc(msg).replace(/\n/g, '<br>')}</div>` });
  if (r.error) return json({ error: 'mail_unavailable' }, 503);
  return json({ ok: true });
}

export async function adminListUsers(env, url) {
  const q = (url.searchParams.get('q') || '').toLowerCase();
  const lim = Math.min(Number(url.searchParams.get('limit')) || 50, 200);
  const { results } = await env.DB.prepare("SELECT id,nickname AS display_name,email,auth_kind,role,banned,created_at FROM users WHERE lower(nickname) LIKE ? OR lower(email) LIKE ? ORDER BY created_at DESC LIMIT ?").bind('%' + q + '%', '%' + q + '%', lim).all();
  return json(results);
}
export async function adminDeleteUser(env, id) {
  const u = await env.DB.prepare('SELECT id,role FROM users WHERE id=?').bind(id).first();
  if (!u) return json({ error: 'not_found' }, 404);
  if (u.role === 'admin') return json({ error: 'cannot_delete_admin' }, 403);
  const c = await env.DB.prepare('SELECT count(*) n FROM chiddushim WHERE author_id=?').bind(id).first();
  const cm = await env.DB.prepare('SELECT count(*) n FROM comments WHERE author_id=?').bind(id).first();
  const rc = await env.DB.prepare('SELECT count(*) n FROM reactions WHERE user_id=?').bind(id).first();
  const own = 'SELECT id FROM chiddushim WHERE author_id=?1';
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM audio_blobs WHERE chidush_id IN (${own})`).bind(id),
    env.DB.prepare(`DELETE FROM reactions WHERE chidush_id IN (${own})`).bind(id),
    env.DB.prepare(`DELETE FROM comments WHERE chidush_id IN (${own})`).bind(id),
    env.DB.prepare('DELETE FROM reactions WHERE user_id=?').bind(id),
    env.DB.prepare('DELETE FROM comments WHERE author_id=?').bind(id),
    env.DB.prepare('DELETE FROM chiddushim WHERE author_id=?').bind(id),
    env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(id),
    env.DB.prepare('DELETE FROM notifications WHERE user_id=?').bind(id),
    env.DB.prepare('DELETE FROM user_private WHERE user_id=?').bind(id),
    env.DB.prepare('DELETE FROM users WHERE id=?').bind(id),
    env.DB.prepare("INSERT INTO audit_log(actor,action,detail,ts) VALUES('admin','delete_user',?,?)").bind(id, Date.now()),
  ]);
  return json({ ok: true, deleted: { chiddushim: c.n, comments: cm.n, reactions: rc.n } });
}
