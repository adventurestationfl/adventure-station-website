-- No reminders, recipients, campaigns or sender settings are enabled by this migration.
CREATE TABLE session_communications (
 session_id TEXT PRIMARY KEY REFERENCES sessions(id),
 notice_en TEXT NOT NULL DEFAULT '', notice_es TEXT NOT NULL DEFAULT '',
 reminder_en TEXT NOT NULL DEFAULT '', reminder_es TEXT NOT NULL DEFAULT '',
 reminder_hours INTEGER CHECK(reminder_hours IS NULL OR reminder_hours IN(24,48)),
 revision INTEGER NOT NULL DEFAULT 1, updated_by TEXT NOT NULL,
 updated_at INTEGER NOT NULL DEFAULT(unixepoch())
);
CREATE INDEX registrations_reminder_due ON registrations(status,starts_at);
-- Marketing opt-out never suppresses essential booking notices. No addresses or
-- plaintext tokens are stored in these two tables.
CREATE TABLE marketing_suppressions (
 email_hash TEXT PRIMARY KEY, stopped_at INTEGER NOT NULL DEFAULT(unixepoch())
);
CREATE TABLE marketing_unsubscribe_tokens (
 token_hash TEXT PRIMARY KEY, email_hash TEXT NOT NULL,
 created_at INTEGER NOT NULL DEFAULT(unixepoch()), expires_at INTEGER NOT NULL
);
CREATE INDEX marketing_unsubscribe_expiry ON marketing_unsubscribe_tokens(expires_at);
