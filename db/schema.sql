-- SQLite/D1-compatible. Product DB only; nothing shared with any other project.
CREATE TABLE users(id TEXT PRIMARY KEY, email TEXT UNIQUE, nickname TEXT NOT NULL, auth_kind TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user', lang TEXT DEFAULT 'he', banned INTEGER DEFAULT 0, created_at INTEGER NOT NULL);
CREATE TABLE feature_flags(key TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 0, config_json TEXT NOT NULL DEFAULT '{}', updated_at INTEGER NOT NULL);
CREATE TABLE catalog_sections(id TEXT PRIMARY KEY, title_he TEXT, title_en TEXT, active INTEGER NOT NULL DEFAULT 0, sort INTEGER DEFAULT 0);
CREATE TABLE catalog_refs(id TEXT PRIMARY KEY, section_id TEXT NOT NULL REFERENCES catalog_sections(id), sefaria_ref TEXT NOT NULL, title_he TEXT, title_en TEXT);
CREATE TABLE chiddushim(id TEXT PRIMARY KEY, author_id TEXT NOT NULL REFERENCES users(id), ref_id TEXT REFERENCES catalog_refs(id), location TEXT NOT NULL, location_auto INTEGER DEFAULT 0, audio_key TEXT, audio_expires_at INTEGER, transcript TEXT, status TEXT NOT NULL DEFAULT 'pending', created_at INTEGER NOT NULL, published_at INTEGER);
CREATE TABLE comments(id TEXT PRIMARY KEY, chidush_id TEXT NOT NULL REFERENCES chiddushim(id), author_id TEXT NOT NULL REFERENCES users(id), body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at INTEGER NOT NULL);
CREATE TABLE reactions(chidush_id TEXT NOT NULL, user_id TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'shkoyach', PRIMARY KEY(chidush_id,user_id,kind));
CREATE TABLE dedications(id TEXT PRIMARY KEY, kind TEXT, period TEXT, contact TEXT, note TEXT, status TEXT DEFAULT 'new', created_at INTEGER NOT NULL); -- no payments handled in system
CREATE TABLE notifications(id TEXT PRIMARY KEY, user_id TEXT, kind TEXT, payload_json TEXT, sent_at INTEGER);
CREATE TABLE audit_log(id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, action TEXT, detail TEXT, ts INTEGER NOT NULL);
INSERT INTO feature_flags(key,enabled,config_json,updated_at) VALUES
('guest_taste',1,'{"max_items":5}',0),('recording',1,'{"max_seconds":180,"max_bytes":1500000,"daily_cap_per_user":10}',0),
('transcription',1,'{"daily_cap_global":200}',0),('auto_approve',0,'{}',0),('comments',1,'{"moderated":true}',0),
('reactions',1,'{}',0),('email_notifications',0,'{"daily_cap":450}',0),('mass_email',0,'{}',0),
('dedications',1,'{}',0),('daily_page',1,'{}',0),('ivr',0,'{}',0),('shabbat_mode',1,'{"mode":"banner","manual_override":null}',0),
('audio_retention',1,'{"days":30}',0),('signups',1,'{}',0);
CREATE TABLE audio_blobs(chidush_id TEXT PRIMARY KEY REFERENCES chiddushim(id), mime TEXT NOT NULL, bytes INTEGER NOT NULL, seconds INTEGER NOT NULL, data BLOB NOT NULL, expires_at INTEGER NOT NULL);
CREATE INDEX audio_expiry ON audio_blobs(expires_at);
