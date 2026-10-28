PRAGMA foreign_keys = ON;
CREATE TABLE venues (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, address TEXT NOT NULL DEFAULT '',
 instructions TEXT NOT NULL DEFAULT '', verified INTEGER NOT NULL DEFAULT 0 CHECK(verified IN(0,1)), archived INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE media (
 id TEXT PRIMARY KEY, filename TEXT NOT NULL, mime TEXT NOT NULL CHECK(mime IN('image/jpeg','image/png','image/webp')),
 alt TEXT NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL, bytes INTEGER NOT NULL,
 created_at INTEGER NOT NULL DEFAULT(unixepoch())
);
CREATE TABLE workshops (
 id TEXT PRIMARY KEY, slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '',
 description TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT 'Arts & crafts',
 age_min INTEGER NOT NULL DEFAULT 4 CHECK(age_min BETWEEN 1 AND 17), age_max INTEGER NOT NULL DEFAULT 10 CHECK(age_max>=age_min AND age_max<=17),
 duration INTEGER NOT NULL DEFAULT 60 CHECK(duration BETWEEN 15 AND 480),
 price INTEGER NOT NULL DEFAULT 2500 CHECK(price BETWEEN 100 AND 100000), capacity INTEGER NOT NULL DEFAULT 12 CHECK(capacity BETWEEN 1 AND 100),
 venue_id TEXT REFERENCES venues(id), media_id TEXT REFERENCES media(id), materials TEXT NOT NULL DEFAULT '', instructions TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN('draft','published','archived')),
 revision INTEGER NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL DEFAULT(unixepoch())
);
CREATE TABLE workshop_gallery (workshop_id TEXT NOT NULL REFERENCES workshops(id), media_id TEXT NOT NULL REFERENCES media(id), PRIMARY KEY(workshop_id,media_id));
CREATE TABLE staff (
 id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL COLLATE NOCASE, subject TEXT UNIQUE,
 name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN('owner','manager','instructor')), active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1))
);
CREATE TABLE sessions (
 id TEXT PRIMARY KEY, workshop_id TEXT NOT NULL REFERENCES workshops(id),
 starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL CHECK(ends_at>starts_at), timezone TEXT NOT NULL,
 venue_id TEXT NOT NULL REFERENCES venues(id), capacity INTEGER NOT NULL CHECK(capacity BETWEEN 1 AND 100),
 price INTEGER NOT NULL CHECK(price BETWEEN 100 AND 100000), instructor_id TEXT REFERENCES staff(id),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN('draft','published','closed','cancelled','archived')),
 revision INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL DEFAULT(unixepoch())
);
CREATE INDEX sessions_upcoming ON sessions(status,starts_at);
CREATE INDEX sessions_workshop ON sessions(workshop_id,starts_at);
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1);
INSERT INTO settings(key,value) VALUES('site','{"headline":"A little mess. A lot of imagination.","intro":"Hands-on arts and crafts for curious kids. Make something special, explore something new, and let creativity lead the way.","about":"Adventure Station brings children together to explore their imagination through seasonal arts and crafts.","email":"adventurestationfl@gmail.com","phone":"","timezone":"","locality":"","policiesApproved":false,"refundPolicy":"","supervisionPolicy":"","pickupPolicy":"","privacyPolicy":"","faqs":[{"question":"What ages are the workshops for?","answer":"Check each workshop for its recommended age range."},{"question":"How do I register?","answer":"Choose a workshop and an available date. A parent or guardian completes the registration and secure checkout."}],"accent":"coral","promotion":"Make room for a little creativity.","heroMediaId":null,"retentionDays":180}');
CREATE TABLE content_versions (id TEXT PRIMARY KEY, value TEXT NOT NULL, created_at INTEGER NOT NULL DEFAULT(unixepoch()), actor TEXT NOT NULL);
CREATE TABLE registrations (
 id TEXT PRIMARY KEY, intent_key TEXT UNIQUE NOT NULL, request_hash TEXT NOT NULL, receipt_hash TEXT NOT NULL,
 session_id TEXT NOT NULL REFERENCES sessions(id), seats INTEGER NOT NULL CHECK(seats BETWEEN 1 AND 12),
 guardian_name TEXT, guardian_email TEXT, guardian_phone TEXT,
 marketing_consent INTEGER NOT NULL DEFAULT 0, photo_consent INTEGER NOT NULL DEFAULT 0,
 status TEXT NOT NULL CHECK(status IN('pending','expired','confirmed','payment_review','cancelled','refunded')),
 hold_until INTEGER NOT NULL, created_at INTEGER NOT NULL DEFAULT(unixepoch()),
 total INTEGER NOT NULL CHECK(total>0), currency TEXT NOT NULL DEFAULT 'USD' CHECK(currency='USD'),
 workshop_name TEXT NOT NULL, starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL, timezone TEXT NOT NULL,
 venue_name TEXT NOT NULL, venue_address TEXT NOT NULL,
 policy_snapshot TEXT NOT NULL, age_min INTEGER NOT NULL, age_max INTEGER NOT NULL,
 square_order_id TEXT UNIQUE, square_link_id TEXT UNIQUE, checkout_url TEXT,
 needs_attention INTEGER NOT NULL DEFAULT 0, anonymized_at INTEGER
);
CREATE INDEX registrations_capacity ON registrations(session_id,status,hold_until);
CREATE INDEX registrations_created ON registrations(created_at);
CREATE TABLE participants (
 id TEXT PRIMARY KEY, registration_id TEXT NOT NULL REFERENCES registrations(id), first_name TEXT, age INTEGER,
 attended INTEGER NOT NULL DEFAULT 0 CHECK(attended IN(0,1))
);
CREATE INDEX participants_registration ON participants(registration_id);
CREATE TABLE payments (
 id TEXT PRIMARY KEY, registration_id TEXT NOT NULL REFERENCES registrations(id), amount INTEGER NOT NULL CHECK(amount>0),
 currency TEXT NOT NULL CHECK(currency='USD'), refunded INTEGER NOT NULL DEFAULT 0 CHECK(refunded>=0 AND refunded<=amount),
 completed_at INTEGER NOT NULL, verified_at INTEGER NOT NULL DEFAULT(unixepoch())
);
CREATE INDEX payments_registration ON payments(registration_id);
CREATE TABLE webhook_events (id TEXT PRIMARY KEY, processed_at INTEGER NOT NULL DEFAULT(unixepoch()));
CREATE TABLE audit (
 id TEXT PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL, entity_id TEXT NOT NULL, created_at INTEGER NOT NULL DEFAULT(unixepoch())
);
CREATE INDEX audit_date ON audit(created_at);
CREATE TABLE rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);

-- Every capacity allocation is checked by SQLite within the write transaction.
-- Expired holds stop counting; late payments must reacquire space or enter review.
CREATE TRIGGER capacity_on_insert BEFORE INSERT ON registrations
WHEN NEW.status IN('pending','confirmed')
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM sessions s JOIN workshops w ON w.id=s.workshop_id
   WHERE s.id=NEW.session_id AND s.status='published' AND w.status='published' AND s.starts_at>unixepoch())
   THEN RAISE(ABORT,'SESSION_UNAVAILABLE') END;
 SELECT CASE WHEN NEW.seats + COALESCE((SELECT SUM(seats) FROM registrations WHERE session_id=NEW.session_id
   AND(status='confirmed' OR(status='pending' AND hold_until>unixepoch()))),0) > (SELECT capacity FROM sessions WHERE id=NEW.session_id)
   THEN RAISE(ABORT,'CAPACITY_EXCEEDED') END;
END;
CREATE TRIGGER capacity_on_update BEFORE UPDATE OF status,seats,session_id,hold_until ON registrations
WHEN NEW.status='confirmed' OR(NEW.status='pending' AND NEW.hold_until>unixepoch())
BEGIN
 SELECT CASE WHEN NEW.seats + COALESCE((SELECT SUM(seats) FROM registrations WHERE session_id=NEW.session_id AND id<>NEW.id
   AND(status='confirmed' OR(status='pending' AND hold_until>unixepoch()))),0) > (SELECT capacity FROM sessions WHERE id=NEW.session_id)
   THEN RAISE(ABORT,'CAPACITY_EXCEEDED') END;
END;
CREATE TRIGGER capacity_on_session_edit BEFORE UPDATE OF capacity ON sessions
BEGIN
 SELECT CASE WHEN NEW.capacity < COALESCE((SELECT SUM(seats) FROM registrations WHERE session_id=NEW.id
   AND(status='confirmed' OR(status='pending' AND hold_until>unixepoch()))),0)
   THEN RAISE(ABORT,'CAPACITY_BELOW_BOOKINGS') END;
END;
CREATE TRIGGER immutable_registration_facts BEFORE UPDATE OF total,currency,workshop_name,starts_at,ends_at,timezone,venue_name,venue_address,policy_snapshot,seats,session_id,age_min,age_max ON registrations
BEGIN SELECT RAISE(ABORT,'HISTORICAL_FACTS_IMMUTABLE'); END;
CREATE TRIGGER protect_booked_session BEFORE UPDATE OF starts_at,ends_at,timezone,venue_id,price,workshop_id ON sessions
WHEN EXISTS(SELECT 1 FROM registrations WHERE session_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'BOOKED_SESSION_DETAILS_LOCKED'); END;
