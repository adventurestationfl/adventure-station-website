-- Additive, opt-in coupon rules. No offers, prices, policies or tax decisions are seeded.
CREATE TABLE coupons (
 id TEXT PRIMARY KEY, name TEXT NOT NULL,
 code TEXT NOT NULL COLLATE NOCASE UNIQUE,
 automatic INTEGER NOT NULL DEFAULT 0 CHECK(automatic IN(0,1)),
 kind TEXT NOT NULL CHECK(kind IN('percent','fixed')),
 amount INTEGER NOT NULL CHECK(amount>0),
 terms TEXT NOT NULL DEFAULT '', terms_es TEXT NOT NULL DEFAULT '',
 starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL CHECK(ends_at>starts_at),
 workshop_id TEXT REFERENCES workshops(id), session_id TEXT REFERENCES sessions(id),
 max_uses INTEGER CHECK(max_uses IS NULL OR max_uses>0),
 per_email_limit INTEGER CHECK(per_email_limit IS NULL OR per_email_limit>0),
 state TEXT NOT NULL DEFAULT 'draft' CHECK(state IN('draft','active','paused','archived')),
 revision INTEGER NOT NULL DEFAULT 1,
 created_at INTEGER NOT NULL DEFAULT(unixepoch()), updated_at INTEGER NOT NULL DEFAULT(unixepoch()),
 created_by TEXT NOT NULL,
 CHECK(kind<>'percent' OR amount<=10000)
);
CREATE INDEX coupons_active ON coupons(state,automatic,starts_at,ends_at);
CREATE TABLE coupon_versions (
 id TEXT PRIMARY KEY, coupon_id TEXT NOT NULL REFERENCES coupons(id), value TEXT NOT NULL CHECK(json_valid(value)),
 actor TEXT NOT NULL, created_at INTEGER NOT NULL DEFAULT(unixepoch())
);
ALTER TABLE registrations ADD COLUMN coupon_id TEXT REFERENCES coupons(id);
ALTER TABLE registrations ADD COLUMN pricing_snapshot TEXT CHECK(pricing_snapshot IS NULL OR json_valid(pricing_snapshot));
ALTER TABLE participants ADD COLUMN charged_cents INTEGER CHECK(charged_cents IS NULL OR charged_cents>=0);
ALTER TABLE participants ADD COLUMN price_position INTEGER CHECK(price_position IS NULL OR price_position>=0);
CREATE UNIQUE INDEX participant_price_position ON participants(registration_id,price_position) WHERE price_position IS NOT NULL;
CREATE TABLE coupon_redemptions (
 registration_id TEXT PRIMARY KEY REFERENCES registrations(id), coupon_id TEXT NOT NULL REFERENCES coupons(id),
 guardian_hash TEXT,
 terms_revision INTEGER NOT NULL,
 state TEXT NOT NULL CHECK(state IN('held','redeemed','released')),
 held_until INTEGER NOT NULL,
 created_at INTEGER NOT NULL DEFAULT(unixepoch()), redeemed_at INTEGER, released_at INTEGER
);
CREATE INDEX coupon_usage ON coupon_redemptions(coupon_id,state,held_until);
CREATE INDEX coupon_email_usage ON coupon_redemptions(coupon_id,guardian_hash,state);
CREATE TRIGGER coupon_automatic_insert BEFORE INSERT ON coupons
WHEN NEW.state='active' AND NEW.automatic=1 AND (SELECT COUNT(*) FROM coupons WHERE state='active' AND automatic=1)>=50
BEGIN SELECT RAISE(ABORT,'COUPON_LIMIT'); END;
CREATE TRIGGER coupon_automatic_update BEFORE UPDATE OF state,automatic ON coupons
WHEN NEW.state='active' AND NEW.automatic=1 AND (SELECT COUNT(*) FROM coupons WHERE state='active' AND automatic=1 AND id<>NEW.id)>=50
BEGIN SELECT RAISE(ABORT,'COUPON_LIMIT'); END;
CREATE TRIGGER coupon_reservation BEFORE INSERT ON coupon_redemptions
BEGIN
 SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM coupons c JOIN registrations r ON r.id=NEW.registration_id
  JOIN sessions s ON s.id=r.session_id
  WHERE c.id=NEW.coupon_id AND c.state='active' AND c.revision=NEW.terms_revision
   AND c.starts_at<=unixepoch() AND c.ends_at>unixepoch()
   AND (c.workshop_id IS NULL OR c.workshop_id=s.workshop_id)
   AND (c.session_id IS NULL OR c.session_id=s.id)
   AND r.coupon_id=c.id AND r.status='pending' AND NEW.state='held' AND NEW.held_until=r.hold_until AND NEW.held_until>unixepoch()
   AND NEW.guardian_hash IS NOT NULL
   AND (SELECT SUM(charged_cents) FROM participants WHERE registration_id=r.id)=r.total
   AND (c.max_uses IS NULL OR c.max_uses>(SELECT COUNT(*) FROM coupon_redemptions u WHERE u.coupon_id=c.id AND (u.state='redeemed' OR (u.state='held' AND u.held_until>unixepoch()))))
   AND (c.per_email_limit IS NULL OR c.per_email_limit>(SELECT COUNT(*) FROM coupon_redemptions u WHERE u.coupon_id=c.id AND u.guardian_hash=NEW.guardian_hash AND (u.state='redeemed' OR (u.state='held' AND u.held_until>unixepoch()))))
 ) THEN RAISE(ABORT,'COUPON_UNAVAILABLE') END;
END;
-- Explicit owner review may reacquire a released/expired usage, but never exceed
-- current usage limits. Existing, still-valid holds already reserve their slot.
CREATE TRIGGER coupon_reacquire BEFORE UPDATE OF state ON coupon_redemptions
WHEN NEW.state IN('held','redeemed') AND (OLD.state='released' OR (OLD.state='held' AND OLD.held_until<=unixepoch()))
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM coupons c WHERE c.id=NEW.coupon_id
  AND (c.max_uses IS NULL OR c.max_uses>(SELECT COUNT(*) FROM coupon_redemptions u WHERE u.coupon_id=c.id AND u.registration_id<>NEW.registration_id AND (u.state='redeemed' OR (u.state='held' AND u.held_until>unixepoch()))))
  AND (c.per_email_limit IS NULL OR (NEW.guardian_hash IS NOT NULL AND c.per_email_limit>(SELECT COUNT(*) FROM coupon_redemptions u WHERE u.coupon_id=c.id AND u.registration_id<>NEW.registration_id AND u.guardian_hash=NEW.guardian_hash AND (u.state='redeemed' OR (u.state='held' AND u.held_until>unixepoch())))))
 ) THEN RAISE(ABORT,'COUPON_UNAVAILABLE') END;
END;
CREATE TRIGGER coupon_confirm_guard BEFORE UPDATE OF status ON registrations
WHEN NEW.status='confirmed' AND OLD.status<>'confirmed' AND NEW.coupon_id IS NOT NULL
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM coupon_redemptions u WHERE u.registration_id=NEW.id AND (u.state='redeemed' OR (u.state='held' AND u.held_until>unixepoch()))) THEN RAISE(ABORT,'COUPON_UNAVAILABLE') END;
END;
CREATE TRIGGER coupon_confirm AFTER UPDATE OF status ON registrations
WHEN NEW.status='confirmed' AND NEW.coupon_id IS NOT NULL
BEGIN
 UPDATE coupon_redemptions SET state='redeemed',redeemed_at=COALESCE(redeemed_at,unixepoch()) WHERE registration_id=NEW.id AND state='held';
END;
CREATE TRIGGER coupon_release AFTER UPDATE OF status ON registrations
WHEN NEW.status IN('expired','cancelled','refunded')
BEGIN
 UPDATE coupon_redemptions SET state='released',released_at=COALESCE(released_at,unixepoch()) WHERE registration_id=NEW.id AND state='held';
END;
-- Historical redeemed usage is never recycled by a refund.
CREATE TRIGGER coupon_redeemed_immutable BEFORE UPDATE OF state ON coupon_redemptions
WHEN OLD.state='redeemed' AND NEW.state<>'redeemed'
BEGIN SELECT RAISE(ABORT,'COUPON_HISTORY'); END;
CREATE TRIGGER coupon_personal_removal AFTER UPDATE OF anonymized_at ON registrations
WHEN OLD.anonymized_at IS NULL AND NEW.anonymized_at IS NOT NULL
BEGIN UPDATE coupon_redemptions SET guardian_hash=NULL WHERE registration_id=NEW.id; END;
CREATE TRIGGER pricing_snapshot_immutable BEFORE UPDATE OF coupon_id,pricing_snapshot ON registrations
WHEN NEW.coupon_id IS NOT OLD.coupon_id OR NEW.pricing_snapshot IS NOT OLD.pricing_snapshot
BEGIN SELECT RAISE(ABORT,'HISTORICAL_PRICE'); END;
CREATE TRIGGER participant_price_immutable BEFORE UPDATE OF charged_cents,price_position ON participants
WHEN NEW.charged_cents IS NOT OLD.charged_cents OR NEW.price_position IS NOT OLD.price_position
BEGIN SELECT RAISE(ABORT,'HISTORICAL_PRICE'); END;
-- A changed coupon limit cannot invalidate already-promised holds/redemptions.
CREATE TRIGGER coupon_limit_guard BEFORE UPDATE OF max_uses,per_email_limit ON coupons
BEGIN
 SELECT CASE WHEN NEW.max_uses IS NOT NULL AND NEW.max_uses<(SELECT COUNT(*) FROM coupon_redemptions u WHERE u.coupon_id=NEW.id AND (u.state='redeemed' OR (u.state='held' AND u.held_until>unixepoch()))) THEN RAISE(ABORT,'COUPON_LIMIT') END;
 SELECT CASE WHEN NEW.per_email_limit IS NOT NULL AND EXISTS(SELECT 1 FROM coupon_redemptions u WHERE u.coupon_id=NEW.id AND u.guardian_hash IS NOT NULL AND (u.state='redeemed' OR (u.state='held' AND u.held_until>unixepoch())) GROUP BY u.guardian_hash HAVING COUNT(*)>NEW.per_email_limit) THEN RAISE(ABORT,'COUPON_LIMIT') END;
END;
