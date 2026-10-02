import { requireFlag, getFlag } from '../admin/flags.js';
import { providers } from './provider.js';

export async function transcribeChidush(env, chidushId) {
  const db = env.DB;
  const cfg = await requireFlag(db, 'transcription');
  const day = Date.now() - 86400000;
  const used = await db.prepare("SELECT count(*) c FROM audit_log WHERE action='transcribe' AND ts>?").bind(day).first();
  if (used.c >= (cfg.daily_cap_global ?? 200)) return { error: 'global_cap' };
  const a = await db.prepare('SELECT mime,data FROM audio_blobs WHERE chidush_id=?').bind(chidushId).first();
  if (!a) return { error: 'no_audio' };
  const p = providers[cfg.provider || 'cloudflare'];
  if (!p) return { error: 'unknown_provider' };
  const r = await p(env, { audio: a.data, mime: a.mime, lang: cfg.lang });
  await db.prepare('UPDATE chiddushim SET transcript=? WHERE id=?').bind(r.text, chidushId).run();
  await db.prepare("INSERT INTO audit_log(actor,action,detail,ts) VALUES('system','transcribe',?,?)").bind(chidushId, Date.now()).run();
  return { ok: true };
}
