-- Additive: no workshop price, class date, staff identity, saved idea or policy is changed.
ALTER TABLE workshops ADD COLUMN activity_tags TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(activity_tags) AND json_type(activity_tags)='array');
CREATE TABLE spark_catalog (
 id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL UNIQUE, family TEXT NOT NULL,
 content TEXT NOT NULL CHECK(json_valid(content)), tags TEXT NOT NULL CHECK(json_valid(tags)),
 months TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(months)),
 origin TEXT NOT NULL CHECK(origin IN('research-informed','ai','adaptation','owner')),
 sources TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(sources)),
 parent_id TEXT, actor TEXT NOT NULL, created_at INTEGER NOT NULL DEFAULT(unixepoch())
);
CREATE INDEX spark_catalog_date ON spark_catalog(created_at DESC);
-- Immutable versions preserve saved/edited ideas through future refreshes.
CREATE TRIGGER spark_catalog_no_update BEFORE UPDATE ON spark_catalog BEGIN SELECT RAISE(ABORT,'SPARK_VERSION_IMMUTABLE'); END;
CREATE TABLE spark_runs (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN('discovery','generation')),
 status TEXT NOT NULL CHECK(status IN('running','completed','failed','blocked')),
 attempts INTEGER NOT NULL DEFAULT 1, lease_until INTEGER NOT NULL,
 started_at INTEGER NOT NULL DEFAULT(unixepoch()), completed_at INTEGER,
 provider TEXT NOT NULL DEFAULT 'none', model TEXT NOT NULL DEFAULT '',
 month TEXT NOT NULL, reserved_microusd INTEGER NOT NULL DEFAULT 0 CHECK(reserved_microusd>=0),
 cap_microusd INTEGER NOT NULL DEFAULT 0 CHECK(cap_microusd>=0),
 summary TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(summary)), error_code TEXT NOT NULL DEFAULT ''
);
CREATE INDEX spark_runs_month ON spark_runs(month,kind);
CREATE TRIGGER spark_budget_cap BEFORE INSERT ON spark_runs
WHEN NEW.reserved_microusd>0 AND NEW.reserved_microusd+COALESCE((SELECT SUM(reserved_microusd) FROM spark_runs WHERE month=NEW.month),0)>NEW.cap_microusd
BEGIN SELECT RAISE(ABORT,'SPARK_BUDGET_EXHAUSTED'); END;
CREATE TABLE spark_profiles (
 staff_id TEXT PRIMARY KEY REFERENCES staff(id),
 value TEXT NOT NULL CHECK(json_valid(value)), updated_at INTEGER NOT NULL DEFAULT(unixepoch())
);
