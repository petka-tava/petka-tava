import { requireFlag, getFlag } from '../admin/flags.js';
import { sendMail } from '../notifications/gmail.js';
import { takePending, peekPending, savePhone } from './extra.js';
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } });
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const sha = async s => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
const validNick = n => typeof n === 'string' && n.trim().length >= 2 && n.trim().length <= 24 && !/[<>@\/\\]/.test(n);

async function newSession(env, userId) {
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  await env.DB.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(await sha(token), userId, Date.now() + 30 * 86400000).run();
  return token;
}

export async function currentUser(env, req) {
  const m = (req.headers.get('authorization') || '').match(/^Bearer (.+)$/);
  if (!m) return null;
  const r = await env.DB.prepare('SELECT u.id,u.nickname,u.role,u.lang,u.banned FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').bind(await sha(m[1]), Date.now()).first();
  return r && !r.banned ? r : null;
}

// Step 1: email a 6-digit code. Same response whether or not the email is known (no enumeration).
export async function emailStart(env, body) {
  await requireFlag(env.DB, 'signups');
  const cfg = await requireFlag(env.DB, 'login_email');
  const email = String(body.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'bad_email' }, 400);
  const hourAgo = Date.now() - 3600000;
  const n = await env.DB.prepare('SELECT count(*) c FROM auth_codes WHERE email=? AND created_at>?').bind(email, hourAgo).first();
  if (n.c >= (cfg.codes_per_hour ?? 5)) return json({ error: 'rate_limited' }, 429);
  const code = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
  await env.DB.prepare('INSERT INTO auth_codes(email,code_hash,expires_at,created_at) VALUES(?,?,?,?)').bind(email, await sha(email + ':' + code), Date.now() + 10 * 60000, Date.now()).run();
  const r = await sendMail(env, { to: email, subject: 'קוד כניסה - פתקא טבא', html: `<div dir="rtl">בס״ד<br>קוד הכניסה שלך: <b>${code}</b><br>תקף ל-10 דקות.</div>` });
  if (r.error) return json({ error: 'mail_unavailable' }, 503);
  return json({ ok: true });
}

// Step 2: verify code. New users must choose a nickname.
export async function emailVerify(env, body) {
  await requireFlag(env.DB, 'login_email');
  const email = String(body.email || '').trim().toLowerCase();
  const row = await env.DB.prepare('SELECT rowid,code_hash,expires_at,tries FROM auth_codes WHERE email=? ORDER BY created_at DESC LIMIT 1').bind(email).first();
  if (!row || row.expires_at < Date.now() || row.tries >= 5) return json({ error: 'invalid_code' }, 400);
  await env.DB.prepare('UPDATE auth_codes SET tries=tries+1 WHERE rowid=?').bind(row.rowid).run();
  if (row.code_hash !== await sha(email + ':' + String(body.code || '').trim())) return json({ error: 'invalid_code' }, 400);
  let u = await env.DB.prepare('SELECT id,banned FROM users WHERE email=?').bind(email).first();
  if (u?.banned) { await env.DB.prepare('DELETE FROM auth_codes WHERE email=?').bind(email).run(); return json({ error: 'banned' }, 403); }
  if (!u) {
    const pend = await peekPending(env, email);
    const nick = pend?.nickname ?? body.nickname;
    // A correct code is kept (and the failed try refunded) until the nickname is valid, so the person is not forced to request a new code.
    if (!validNick(nick)) { await env.DB.prepare('UPDATE auth_codes SET tries=tries-1 WHERE rowid=?').bind(row.rowid).run(); return json({ error: 'nickname_required' }, 400); }
    await env.DB.prepare('DELETE FROM auth_codes WHERE email=?').bind(email).run();
    await takePending(env, email);
    const id = crypto.randomUUID();
    try { await env.DB.prepare("INSERT INTO users(id,email,nickname,auth_kind,created_at) VALUES(?,?,?,?,?)").bind(id, email, nick.trim(), pend ? 'manual' : 'email', Date.now()).run(); }
    catch { return json({ error: 'nickname_taken' }, 409); }
    await savePhone(env, id, pend?.phone_hash);
    u = { id };
  }
  return json({ ok: true, token: await newSession(env, u.id) });
}

// Google sign-in via Google Identity Services id_token (needs GOOGLE_WEB_CLIENT_ID secret and login_google flag on).
export async function googleLogin(env, body) {
  await requireFlag(env.DB, 'login_google');
  const r = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(body.id_token || ''));
  const t = await r.json();
  if (!r.ok || t.aud !== env.GOOGLE_WEB_CLIENT_ID || t.email_verified !== 'true') return json({ error: 'invalid_token' }, 401);
  const email = t.email.toLowerCase();
  let u = await env.DB.prepare('SELECT id,banned FROM users WHERE email=?').bind(email).first();
  if (u?.banned) return json({ error: 'banned' }, 403);
  if (!u) {
    await requireFlag(env.DB, 'signups');
    const chosen = validNick(body.nickname) ? body.nickname.trim() : null;
    const clean = x => String(x || '').replace(/[<>@\/\\]/g, '').trim();
    const base = (chosen || clean(t.name) || clean(t.given_name) || 'משתמש').slice(0, 24);
    const id = crypto.randomUUID();
    let ok = false;
    for (let i = 0; i < 6 && !ok; i++) {
      const nick = i === 0 ? base : base.slice(0, 20) + ' ' + (1 + Math.floor(Math.random() * 999));
      if (chosen && i > 0) return json({ error: 'nickname_taken' }, 409);
      try { await env.DB.prepare("INSERT INTO users(id,email,nickname,auth_kind,created_at) VALUES(?,?,?,'google',?)").bind(id, email, nick, Date.now()).run(); ok = true; } catch {}
    }
    if (!ok) return json({ error: 'nickname_taken' }, 409);
    u = { id };
  }
  return json({ ok: true, token: await newSession(env, u.id) });
}
