CREATE TABLE IF NOT EXISTS auth_codes(email TEXT NOT NULL, code_hash TEXT NOT NULL, expires_at INTEGER NOT NULL, tries INTEGER DEFAULT 0, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS auth_codes_email ON auth_codes(email, created_at);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS users_nick ON users(lower(nickname));
INSERT OR IGNORE INTO feature_flags(key,enabled,config_json,updated_at) VALUES('login_email',1,'{"codes_per_hour":5}',0),('login_google',0,'{}',0);
