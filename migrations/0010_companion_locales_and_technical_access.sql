-- Additive migration: preserve staff identities, references, booking facts and existing audit.
ALTER TABLE staff ADD COLUMN locale TEXT NOT NULL DEFAULT 'en-US' CHECK(locale IN('en-US','es-MX'));
ALTER TABLE staff ADD COLUMN encouragement TEXT NOT NULL DEFAULT 'shown' CHECK(encouragement IN('shown','minimized','disabled'));
CREATE TABLE technical_grants (
 staff_id TEXT PRIMARY KEY REFERENCES staff(id), role TEXT NOT NULL DEFAULT 'godmin' CHECK(role='godmin'),
 verified_subject TEXT NOT NULL, granted_by TEXT NOT NULL REFERENCES staff(id), created_at INTEGER NOT NULL DEFAULT(unixepoch())
);
CREATE TRIGGER technical_grant_verified BEFORE INSERT ON technical_grants
WHEN NOT EXISTS(SELECT 1 FROM staff WHERE id=NEW.staff_id AND active=1 AND subject=NEW.verified_subject AND role<>'owner')
 OR NOT EXISTS(SELECT 1 FROM staff WHERE id=NEW.granted_by AND active=1 AND role='owner') OR NEW.staff_id=NEW.granted_by
BEGIN SELECT RAISE(ABORT,'VERIFIED_OWNER_GRANT_REQUIRED'); END;
CREATE TRIGGER technical_grant_no_update BEFORE UPDATE ON technical_grants
BEGIN SELECT RAISE(ABORT,'REVOKE_AND_REAUTHORIZE_GRANT'); END;
CREATE TRIGGER technical_owner_separation BEFORE UPDATE OF role ON staff
WHEN NEW.role='owner' AND EXISTS(SELECT 1 FROM technical_grants WHERE staff_id=NEW.id)
BEGIN SELECT RAISE(ABORT,'REVOKE_TECHNICAL_GRANT_FIRST'); END;
CREATE TRIGGER protect_last_owner BEFORE UPDATE OF role,active ON staff
WHEN OLD.role='owner' AND OLD.active=1 AND (NEW.role<>'owner' OR NEW.active<>1)
 AND (SELECT COUNT(*) FROM staff WHERE role='owner' AND active=1)<=1
BEGIN SELECT RAISE(ABORT,'LAST_OWNER_REQUIRED'); END;
CREATE TRIGGER protect_last_owner_delete BEFORE DELETE ON staff
WHEN OLD.role='owner' AND OLD.active=1 AND (SELECT COUNT(*) FROM staff WHERE role='owner' AND active=1)<=1
BEGIN SELECT RAISE(ABORT,'LAST_OWNER_REQUIRED'); END;
CREATE TABLE content_translations (
 entity_type TEXT NOT NULL CHECK(entity_type IN('workshop','site','venue')), entity_id TEXT NOT NULL,
 locale TEXT NOT NULL CHECK(locale='es-MX'), value TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
 source_revision INTEGER NOT NULL, approved INTEGER NOT NULL DEFAULT 0 CHECK(approved IN(0,1)),
 updated_at INTEGER NOT NULL DEFAULT(unixepoch()), actor TEXT NOT NULL, PRIMARY KEY(entity_type,entity_id,locale)
);
CREATE TABLE translation_versions (
 id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, locale TEXT NOT NULL,
 value TEXT NOT NULL, source_revision INTEGER NOT NULL, approved INTEGER NOT NULL, actor TEXT NOT NULL,
 created_at INTEGER NOT NULL DEFAULT(unixepoch())
);
CREATE TABLE spark_preferences (
 staff_id TEXT NOT NULL REFERENCES staff(id), idea_id TEXT NOT NULL, saved INTEGER NOT NULL DEFAULT 0 CHECK(saved IN(0,1)),
 dismissed INTEGER NOT NULL DEFAULT 0 CHECK(dismissed IN(0,1)), updated_at INTEGER NOT NULL DEFAULT(unixepoch()), PRIMARY KEY(staff_id,idea_id)
);
CREATE TABLE spark_days (
 staff_id TEXT NOT NULL REFERENCES staff(id), day TEXT NOT NULL, idea_id TEXT NOT NULL,
 sequence INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(staff_id,day)
);
CREATE TABLE spark_seen (
 staff_id TEXT NOT NULL REFERENCES staff(id), idea_id TEXT NOT NULL, day TEXT NOT NULL, PRIMARY KEY(staff_id,idea_id,day)
);
CREATE TABLE spark_drafts (
 staff_id TEXT NOT NULL REFERENCES staff(id), idea_id TEXT NOT NULL, workshop_id TEXT NOT NULL UNIQUE REFERENCES workshops(id),
 PRIMARY KEY(staff_id,idea_id)
);
ALTER TABLE registrations ADD COLUMN locale TEXT NOT NULL DEFAULT 'en-US' CHECK(locale IN('en-US','es-MX'));
ALTER TABLE registrations ADD COLUMN policy_version TEXT NOT NULL DEFAULT 'legacy-en';
ALTER TABLE notification_outbox ADD COLUMN locale TEXT NOT NULL DEFAULT 'en-US' CHECK(locale IN('en-US','es-MX'));
CREATE TRIGGER notice_locale AFTER INSERT ON notification_outbox
BEGIN UPDATE notification_outbox SET locale=COALESCE((SELECT locale FROM registrations WHERE id=NEW.registration_id),'en-US') WHERE id=NEW.id; END;
CREATE TRIGGER registration_language_immutable BEFORE UPDATE OF locale,policy_version ON registrations
WHEN NEW.locale<>OLD.locale OR NEW.policy_version<>OLD.policy_version
BEGIN SELECT RAISE(ABORT,'HISTORICAL_REGISTRATION_LANGUAGE'); END;
ALTER TABLE audit ADD COLUMN actor_role TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE audit ADD COLUMN source TEXT NOT NULL DEFAULT 'dashboard' CHECK(source IN('dashboard','mcp','system','scheduled'));
ALTER TABLE audit ADD COLUMN outcome TEXT NOT NULL DEFAULT 'success' CHECK(outcome IN('success','denied','failed'));
ALTER TABLE audit ADD COLUMN correlation_id TEXT NOT NULL DEFAULT '';
ALTER TABLE audit ADD COLUMN client_id TEXT NOT NULL DEFAULT '';
ALTER TABLE audit ADD COLUMN tool_name TEXT NOT NULL DEFAULT '';
CREATE INDEX audit_filter ON audit(action,created_at,id);
CREATE INDEX audit_actor ON audit(actor,created_at,id);
CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT,'AUDIT_APPEND_ONLY'); END;
CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT,'AUDIT_APPEND_ONLY'); END;
CREATE TABLE mcp_clients (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, redirect_uri TEXT NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)),
 created_by TEXT NOT NULL REFERENCES staff(id), created_at INTEGER NOT NULL DEFAULT(unixepoch())
);
CREATE TABLE mcp_grants (
 id TEXT PRIMARY KEY, staff_id TEXT NOT NULL REFERENCES staff(id), subject TEXT NOT NULL, client_id TEXT NOT NULL REFERENCES mcp_clients(id),
 scopes TEXT NOT NULL, resource TEXT NOT NULL, expires_at INTEGER NOT NULL, revoked_at INTEGER,
 created_at INTEGER NOT NULL DEFAULT(unixepoch())
);
CREATE TABLE mcp_codes (
 hash TEXT PRIMARY KEY, grant_id TEXT NOT NULL REFERENCES mcp_grants(id), challenge TEXT NOT NULL,
 expires_at INTEGER NOT NULL, used_at INTEGER
);
CREATE TABLE mcp_tokens (
 hash TEXT PRIMARY KEY, grant_id TEXT NOT NULL REFERENCES mcp_grants(id), expires_at INTEGER NOT NULL
);
CREATE TABLE mcp_requests (
 grant_id TEXT NOT NULL REFERENCES mcp_grants(id), request_id TEXT NOT NULL, request_hash TEXT NOT NULL,
 result TEXT NOT NULL, created_at INTEGER NOT NULL DEFAULT(unixepoch()), PRIMARY KEY(grant_id,request_id)
);
CREATE TABLE mcp_consents (
 hash TEXT PRIMARY KEY,staff_id TEXT NOT NULL REFERENCES staff(id),request_data TEXT NOT NULL,expires_at INTEGER NOT NULL,used_at INTEGER
);
CREATE TABLE mcp_proposals (
 id TEXT PRIMARY KEY,grant_id TEXT NOT NULL REFERENCES mcp_grants(id),tool_name TEXT NOT NULL,command TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN('pending','applying','applied','failed','rejected')),
 result TEXT NOT NULL DEFAULT '{}',expires_at INTEGER NOT NULL,created_at INTEGER NOT NULL DEFAULT(unixepoch())
);
CREATE TRIGGER reopen_spanish_policies AFTER UPDATE OF value ON settings
WHEN NEW.key='site' AND (
 json_extract(NEW.value,'$.policiesApproved')=0 OR
 json_extract(NEW.value,'$.refundPolicy') IS NOT json_extract(OLD.value,'$.refundPolicy') OR
 json_extract(NEW.value,'$.supervisionPolicy') IS NOT json_extract(OLD.value,'$.supervisionPolicy') OR
 json_extract(NEW.value,'$.pickupPolicy') IS NOT json_extract(OLD.value,'$.pickupPolicy') OR
 json_extract(NEW.value,'$.privacyPolicy') IS NOT json_extract(OLD.value,'$.privacyPolicy') OR
 json_extract(NEW.value,'$.timezone') IS NOT json_extract(OLD.value,'$.timezone') OR
 json_extract(NEW.value,'$.locality') IS NOT json_extract(OLD.value,'$.locality'))
BEGIN
 INSERT INTO translation_versions(id,entity_type,entity_id,locale,value,source_revision,approved,actor)
 SELECT lower(hex(randomblob(16))),entity_type,entity_id,locale,value,source_revision,approved,'system' FROM content_translations WHERE entity_type='site' AND entity_id='site' AND approved=1;
 UPDATE content_translations SET approved=0,revision=revision+1,updated_at=unixepoch() WHERE entity_type='site' AND entity_id='site' AND approved=1;
END;
ALTER TABLE venues ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
