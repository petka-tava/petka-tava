import { requireFlag, getFlag } from '../admin/flags.js';
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } });

// Public: limits shown to users in the recording UI (always read from admin-controlled flags).
export async function recordingLimits(db) {
  const f = await getFlag(db, 'recording');
  const r = await getFlag(db, 'audio_retention');
  return json({ enabled: f.enabled, max_seconds: f.config.max_seconds ?? 180, retention_days: r.config.days ?? 30 });
}

// Upload: server enforces length/size caps and the per-user daily cap. Client display is informational only.
export async function uploadAudio(db, user, chidushId, req) {
  const cfg = await requireFlag(db, 'recording');
  const seconds = Number(req.headers.get('x-audio-seconds') || 0);
  const mime = req.headers.get('content-type') || 'audio/webm';
  if (!/^audio\/(webm|ogg|mp4|mpeg)/.test(mime)) return json({ error: 'bad_type' }, 415);
  if (!(seconds > 0) || seconds > (cfg.max_seconds ?? 180)) return json({ error: 'too_long', max_seconds: cfg.max_seconds ?? 180 }, 413);
  const buf = await req.arrayBuffer();
  if (buf.byteLength > (cfg.max_bytes ?? 1500000)) return json({ error: 'too_large', max_bytes: cfg.max_bytes ?? 1500000 }, 413);
  const dayAgo = Date.now() - 86400000;
  const n = await db.prepare('SELECT count(*) c FROM chiddushim WHERE author_id=? AND created_at>?').bind(user.id, dayAgo).first();
  if (n.c > (cfg.daily_cap_per_user ?? 10)) return json({ error: 'daily_cap' }, 429);
  const ret = await getFlag(db, 'audio_retention');
  const exp = ret.enabled ? Date.now() + (ret.config.days ?? 30) * 86400000 : 9e15;
  await db.prepare('INSERT OR REPLACE INTO audio_blobs(chidush_id,mime,bytes,seconds,data,expires_at) VALUES(?,?,?,?,?,?)').bind(chidushId, mime, buf.byteLength, seconds, buf, exp).run();
  return json({ ok: true });
}

// Scheduled (cron trigger): delete expired audio, keep transcript.
export async function purgeExpired(db) {
  await db.prepare('DELETE FROM audio_blobs WHERE expires_at < ?').bind(Date.now()).run();
}
