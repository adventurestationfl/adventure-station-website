CREATE TABLE privacy_reviews (
 registration_id TEXT PRIMARY KEY REFERENCES registrations(id),
 reason TEXT NOT NULL CHECK(reason IN('unresolved_dispute','legal_obligation','operational_followup')),
 review_after INTEGER NOT NULL, actor TEXT NOT NULL, updated_at INTEGER NOT NULL DEFAULT(unixepoch())
);
