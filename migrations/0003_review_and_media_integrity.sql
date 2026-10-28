CREATE TABLE content_media_refs (
 owner_key TEXT PRIMARY KEY, media_id TEXT NOT NULL REFERENCES media(id)
);
INSERT INTO content_media_refs(owner_key,media_id)
 SELECT 'site',json_extract(value,'$.heroMediaId') FROM settings
 WHERE key='site' AND json_extract(value,'$.heroMediaId') IS NOT NULL;
INSERT INTO content_media_refs(owner_key,media_id)
 SELECT id,json_extract(value,'$.heroMediaId') FROM content_versions
 WHERE json_extract(value,'$.heroMediaId') IS NOT NULL;
ALTER TABLE payment_issues ADD COLUMN refunded INTEGER NOT NULL DEFAULT 0;
CREATE TRIGGER confirm_only_available_session BEFORE UPDATE OF status ON registrations
WHEN NEW.status='confirmed' AND OLD.status<>'confirmed'
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM sessions s JOIN workshops w ON w.id=s.workshop_id WHERE s.id=NEW.session_id AND s.status='published' AND w.status='published' AND s.starts_at>unixepoch()) THEN RAISE(ABORT,'SESSION_UNAVAILABLE') END;
END;
