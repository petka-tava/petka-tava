# פתקא טבא - petka-tava (by OrelAI)
Standalone project. No shared code, config, secrets or infra with any other project.
Layout: web/ (PWA), services/ (recording, transcription, catalog, users, feed, notifications, admin), db/schema.sql.
Rule: every feature is gated by services/admin/flags.js.
