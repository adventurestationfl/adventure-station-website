-- Preserve the publication declarations on existing non-identifying website images.
ALTER TABLE media ADD COLUMN title TEXT NOT NULL DEFAULT '';
ALTER TABLE media ADD COLUMN alt_es TEXT NOT NULL DEFAULT '';
ALTER TABLE media ADD COLUMN caption TEXT NOT NULL DEFAULT '';
ALTER TABLE media ADD COLUMN caption_es TEXT NOT NULL DEFAULT '';
ALTER TABLE media ADD COLUMN rights_kind TEXT NOT NULL DEFAULT 'previously_declared' CHECK(rights_kind IN('previously_declared','owner_created','licensed','client_supplied','ai_generated','pending','restricted'));
ALTER TABLE media ADD COLUMN rights_note TEXT NOT NULL DEFAULT '';
ALTER TABLE media ADD COLUMN publication_allowed INTEGER NOT NULL DEFAULT 1 CHECK(publication_allowed IN(0,1));
ALTER TABLE media ADD COLUMN rights_confirmed_by TEXT;
ALTER TABLE media ADD COLUMN rights_confirmed_at INTEGER;
ALTER TABLE media ADD COLUMN focal_x INTEGER NOT NULL DEFAULT 50 CHECK(focal_x BETWEEN 0 AND 100);
ALTER TABLE media ADD COLUMN focal_y INTEGER NOT NULL DEFAULT 50 CHECK(focal_y BETWEEN 0 AND 100);
ALTER TABLE media ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE media ADD COLUMN deleted_at INTEGER;
ALTER TABLE media ADD COLUMN purge_after INTEGER;
ALTER TABLE media ADD COLUMN purged_at INTEGER;
ALTER TABLE media ADD COLUMN purge_started_at INTEGER;
ALTER TABLE media ADD COLUMN upload_key TEXT;
ALTER TABLE media ADD COLUMN upload_hash TEXT;
CREATE UNIQUE INDEX media_upload_key ON media(upload_key) WHERE upload_key IS NOT NULL;
CREATE INDEX media_trash_due ON media(purge_after) WHERE deleted_at IS NOT NULL AND purged_at IS NULL;

CREATE TABLE promotions (
 id TEXT PRIMARY KEY, name TEXT NOT NULL,
 title TEXT NOT NULL, title_es TEXT NOT NULL DEFAULT '',
 description TEXT NOT NULL DEFAULT '', description_es TEXT NOT NULL DEFAULT '',
 material_terms TEXT NOT NULL DEFAULT '', material_terms_es TEXT NOT NULL DEFAULT '',
 cta TEXT NOT NULL DEFAULT '', cta_es TEXT NOT NULL DEFAULT '', destination TEXT NOT NULL DEFAULT '',
 media_id TEXT REFERENCES media(id), workshop_id TEXT REFERENCES workshops(id), session_id TEXT REFERENCES sessions(id),
 placement TEXT NOT NULL CHECK(placement IN('home_feature','announcement','workshop')),
 starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL CHECK(ends_at>starts_at),
 state TEXT NOT NULL DEFAULT 'draft' CHECK(state IN('draft','published','paused','archived')),
 priority INTEGER NOT NULL DEFAULT 0 CHECK(priority BETWEEN -100 AND 100),
 coupon_id TEXT, revision INTEGER NOT NULL DEFAULT 1,
 created_at INTEGER NOT NULL DEFAULT(unixepoch()), updated_at INTEGER NOT NULL DEFAULT(unixepoch()),
 created_by TEXT NOT NULL, published_by TEXT, published_at INTEGER
);
CREATE INDEX promotions_visibility ON promotions(state,placement,starts_at,ends_at,priority);
CREATE TABLE promotion_versions (
 id TEXT PRIMARY KEY, promotion_id TEXT NOT NULL REFERENCES promotions(id),
 value TEXT NOT NULL CHECK(json_valid(value)), actor TEXT NOT NULL,
 created_at INTEGER NOT NULL DEFAULT(unixepoch())
);
-- Reference checks must remain true if an editor attaches an image concurrently.
CREATE TRIGGER media_trash_references BEFORE UPDATE OF deleted_at ON media
WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL AND NEW.purge_started_at IS NULL
BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM workshops WHERE media_id=NEW.id)
 OR EXISTS(SELECT 1 FROM workshop_gallery WHERE media_id=NEW.id)
 OR EXISTS(SELECT 1 FROM content_media_refs WHERE media_id=NEW.id)
 OR EXISTS(SELECT 1 FROM promotions WHERE media_id=NEW.id)
 OR EXISTS(SELECT 1 FROM promotion_versions WHERE json_extract(value,'$.media_id')=NEW.id)
 THEN RAISE(ABORT,'MEDIA_REFERENCED') END;
END;
CREATE TRIGGER workshop_media_available BEFORE UPDATE OF media_id ON workshops
WHEN NEW.media_id IS NOT NULL AND EXISTS(SELECT 1 FROM media WHERE id=NEW.media_id AND deleted_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'MEDIA_UNAVAILABLE'); END;
CREATE TRIGGER workshop_media_insert_available BEFORE INSERT ON workshops
WHEN NEW.media_id IS NOT NULL AND EXISTS(SELECT 1 FROM media WHERE id=NEW.media_id AND deleted_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'MEDIA_UNAVAILABLE'); END;
CREATE TRIGGER gallery_media_available BEFORE INSERT ON workshop_gallery
WHEN EXISTS(SELECT 1 FROM media WHERE id=NEW.media_id AND deleted_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'MEDIA_UNAVAILABLE'); END;
CREATE TRIGGER content_media_available BEFORE INSERT ON content_media_refs
WHEN EXISTS(SELECT 1 FROM media WHERE id=NEW.media_id AND deleted_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'MEDIA_UNAVAILABLE'); END;
CREATE TRIGGER promotion_media_available BEFORE INSERT ON promotions
WHEN NEW.media_id IS NOT NULL AND EXISTS(SELECT 1 FROM media WHERE id=NEW.media_id AND deleted_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'MEDIA_UNAVAILABLE'); END;
CREATE TRIGGER promotion_media_update_available BEFORE UPDATE OF media_id ON promotions
WHEN NEW.media_id IS NOT NULL AND EXISTS(SELECT 1 FROM media WHERE id=NEW.media_id AND deleted_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'MEDIA_UNAVAILABLE'); END;
