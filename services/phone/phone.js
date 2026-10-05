// Phone line (voicemail) intake. Privacy: the caller number is hashed (salted) in memory, matched against saved user hashes,
// and never stored. Unmatched callers are dropped (nothing is kept). Each matched recording becomes a draft in that account.
import { requireFlag } from '../admin/flags.js';
import { uploadAudio } from '../recording/recording.js';
import { transcribeChidush } from '../transcription/transcribe.js';
import { phoneHash, ensureSchema } from '../users/extra.js';
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } });
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const ctEq = (a, b) => { a = String(a || ''); b = String(b || ''); let d = a.length ^ b.length; for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0); return d === 0; };

// Rough MP3 length from the first frame's bitrate (CBR assumption; ID3 tag skipped). Returns 0 if unreadable.
export function mp3Seconds(buf) {
  const u = new Uint8Array(buf); let i = 0;
  if (u[0] === 0x49 && u[1] === 0x44 && u[2] === 0x33) i = 10 + ((u[6] & 127) << 21 | (u[7] & 127) << 14 | (u[8] & 127) << 7 | (u[9] & 127));
  for (; i + 4 < Math.min(u.length, 65536 + i); i++) {
    if (u[i] === 0xff && (u[i + 1] & 0xe0) === 0xe0) {
      const ver = (u[i + 1] >> 3) & 3, layer = (u[i + 1] >> 1) & 3, br = u[i + 2] >> 4;
      if (ver === 1 || layer !== 1 || br === 0 || br === 15) continue;
      const t1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320], t2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
      const kbps = (ver === 3 ? t1 : t2)[br];
      return Math.max(1, Math.round((u.length - i) * 8 / (kbps * 1000)));
    }
  }
  return 0;
}

// Called by the product mailbox script. Auth: shared secret header. Body: raw MP3. Headers: x-caller (raw number, used once), x-audio-seconds, x-mail-id (dedupe).
export async function ingest(env, ctx, req) {
  if (!env.PHONE_INGEST_SECRET || !ctEq(req.headers.get('x-ingest-secret'), env.PHONE_INGEST_SECRET)) return json({ error: 'not_found' }, 404);
  await ensureSchema(env.DB);
  const ivr = await env.DB.prepare("SELECT enabled FROM feature_flags WHERE key='ivr'").first();
  if (!ivr || !ivr.enabled) return json({ ok: true, dropped: 'line_off' }); // caller may trash the mail: nothing kept
  const mid = req.headers.get('x-mail-id') || '';
  const mh = hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('mail:' + mid)));
  if (mid && await env.DB.prepare('SELECT 1 FROM phone_seen WHERE mail_hash=?').bind(mh).first()) return json({ ok: true, duplicate: true });
  const ph = await phoneHash(env, req.headers.get('x-caller'));
  if (!ph) return json({ ok: true, dropped: 'no_number' });
  const u = await env.DB.prepare('SELECT u.id FROM user_private p JOIN users u ON u.id=p.user_id WHERE p.phone_hash=? AND u.banned=0').bind(ph).first();
  if (mid) await env.DB.prepare('INSERT OR IGNORE INTO phone_seen(mail_hash,ts) VALUES(?,?)').bind(mh, Date.now()).run();
  if (!u) return json({ ok: true, dropped: 'unknown_caller' });
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO chiddushim(id,author_id,ref_id,location,location_auto,daf,amud,source,status,created_at) VALUES(?,?,NULL,'',0,NULL,NULL,NULL,'draft',?)").bind(id, u.id, Date.now()).run();
  await env.DB.prepare('INSERT INTO phone_drafts(chidush_id) VALUES(?)').bind(id).run();
  const buf = await req.arrayBuffer();
  const hdr = { 'content-type': 'audio/mpeg', 'x-audio-seconds': String(mp3Seconds(buf) || Number(req.headers.get('x-audio-seconds')) || 0) };
  const up = await uploadAudio(env.DB, { id: u.id }, id, new Request('http://x/', { method: 'PUT', headers: hdr, body: buf }));
  if (up.status !== 200) { await env.DB.prepare('DELETE FROM chiddushim WHERE id=?').bind(id).run(); const e = await up.json().catch(() => ({})); return json({ ok: true, dropped: e.error || 'rejected' }); }
  const t = (async () => { try { await transcribeChidush(env, id); } catch (e) { await env.DB.prepare("INSERT INTO audit_log(actor,action,detail,ts) VALUES('system','transcribe_failed',?,?)").bind(id, Date.now()).run(); } })();
  ctx?.waitUntil ? ctx.waitUntil(t) : await t;
  return json({ ok: true, imported: true });
}

// Profile: add / replace / remove the phone used by the phone line. Stored only as a salted hash.
export async function setPhone(env, user, body) {
  await ensureSchema(env.DB);
  const ph = await phoneHash(env, body.phone);
  if (!ph) return json({ error: 'invalid', field: 'phone' }, 400);
  const other = await env.DB.prepare('SELECT user_id FROM user_private WHERE phone_hash=? AND user_id<>?').bind(ph, user.id).first();
  if (other) return json({ error: 'phone_in_use' }, 409);
  await env.DB.prepare('INSERT OR REPLACE INTO user_private(user_id,phone_hash) VALUES(?,?)').bind(user.id, ph).run();
  return json({ ok: true, has_phone: true });
}
export async function clearPhone(env, user) {
  await ensureSchema(env.DB);
  await env.DB.prepare('DELETE FROM user_private WHERE user_id=?').bind(user.id).run();
  return json({ ok: true, has_phone: false });
}
export async function phoneState(env, user) {
  await ensureSchema(env.DB);
  const p = await env.DB.prepare('SELECT 1 x FROM user_private WHERE user_id=? AND phone_hash IS NOT NULL').bind(user.id).first();
  const f = await env.DB.prepare("SELECT enabled FROM feature_flags WHERE key='ivr'").first();
  return { has_phone: !!p, phone_line_enabled: !!(f && f.enabled) };
}
