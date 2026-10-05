// Server-side feature control. Every feature checks here; the client never decides.
export async function getFlag(db, key) {
  const r = await db.prepare('SELECT enabled, config_json FROM feature_flags WHERE key=?').bind(key).first();
  if (!r) return { enabled: false, config: {} };
  return { enabled: !!r.enabled, config: JSON.parse(r.config_json) };
}
export async function requireFlag(db, key) {
  const f = await getFlag(db, key);
  if (!f.enabled) throw new Response(JSON.stringify({ error: 'feature_disabled', key }), { status: 403, headers: { 'content-type': 'application/json' } });
  return f.config;
}
export async function setFlag(db, actor, key, enabled, config) {
  const now = Date.now();
  await db.prepare('INSERT INTO feature_flags(key,enabled,config_json,updated_at) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET enabled=excluded.enabled, config_json=excluded.config_json, updated_at=excluded.updated_at')
    .bind(key, enabled ? 1 : 0, JSON.stringify(config ?? {}), now).run();
  await db.prepare('INSERT INTO audit_log(actor,action,detail,ts) VALUES(?,?,?,?)').bind(actor, 'set_flag', key, now).run();
}
