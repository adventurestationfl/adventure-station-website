ALTER TABLE registrations ADD COLUMN last_reconciled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE registrations ADD COLUMN checkout_retired_at INTEGER;
CREATE INDEX registrations_reconciliation ON registrations(last_reconciled);
CREATE TABLE payment_issues (
 id TEXT PRIMARY KEY, registration_id TEXT NOT NULL REFERENCES registrations(id),
 amount INTEGER NOT NULL, currency TEXT NOT NULL, reason TEXT NOT NULL,
 created_at INTEGER NOT NULL DEFAULT(unixepoch()), resolved INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX payment_issues_registration ON payment_issues(registration_id,resolved);
