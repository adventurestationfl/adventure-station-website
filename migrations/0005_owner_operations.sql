-- Owner decisions are separate from public content. External evidence has no owner-write API.
INSERT INTO settings(key,value) VALUES('owner_setup','{"legalName":"","mailingContact":"","supervision":"undecided","safetyNotes":"","licensingOutcome":"unreviewed","licensingNotes":"","licensingReference":"","privacyNotes":"","editorialNotes":"","confirmed":{},"minimized":false}');
CREATE TABLE integration_verifications (
 kind TEXT PRIMARY KEY CHECK(kind IN('payment','email','access','recovery','acceptance','regulatory')),
 fingerprint TEXT NOT NULL, evidence TEXT NOT NULL, verified_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL, revoked_at INTEGER
);
ALTER TABLE venues ADD COLUMN capacity INTEGER CHECK(capacity BETWEEN 1 AND 100);
ALTER TABLE venues ADD COLUMN accessibility TEXT NOT NULL DEFAULT '';
ALTER TABLE venues ADD COLUMN permission_confirmed INTEGER NOT NULL DEFAULT 0 CHECK(permission_confirmed IN(0,1));
ALTER TABLE registrations ADD COLUMN cancelled_seats INTEGER NOT NULL DEFAULT 0 CHECK(cancelled_seats>=0 AND cancelled_seats<=seats);
ALTER TABLE participants ADD COLUMN cancelled_at INTEGER;
ALTER TABLE registrations ADD COLUMN instructions_snapshot TEXT NOT NULL DEFAULT '';
ALTER TABLE registrations ADD COLUMN contact_snapshot TEXT NOT NULL DEFAULT '';
CREATE TABLE notification_outbox (
 id TEXT PRIMARY KEY, event_key TEXT UNIQUE NOT NULL, registration_id TEXT NOT NULL REFERENCES registrations(id),
 kind TEXT NOT NULL, subject TEXT NOT NULL, message TEXT NOT NULL, recipient TEXT,
 state TEXT NOT NULL DEFAULT 'queued' CHECK(state IN('queued','sending','accepted','delivered','bounced','failed','review','suppressed')),
 attempts INTEGER NOT NULL DEFAULT 0, first_attempt_at INTEGER, next_attempt_at INTEGER NOT NULL DEFAULT(unixepoch()),
 lease_until INTEGER NOT NULL DEFAULT 0, provider_id TEXT UNIQUE, provider_checked_at INTEGER NOT NULL DEFAULT 0,
 transport_hash TEXT, last_error TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL DEFAULT(unixepoch()), updated_at INTEGER NOT NULL DEFAULT(unixepoch())
);
CREATE INDEX notification_due ON notification_outbox(state,next_attempt_at);
CREATE TABLE email_suppressions (recipient_hash TEXT PRIMARY KEY, created_at INTEGER NOT NULL DEFAULT(unixepoch()));
CREATE TABLE refund_requests (
 id TEXT PRIMARY KEY, registration_id TEXT NOT NULL REFERENCES registrations(id), payment_id TEXT NOT NULL,
 amount INTEGER NOT NULL CHECK(amount>0), baseline_refunded INTEGER NOT NULL, provider_id TEXT UNIQUE,
 state TEXT NOT NULL DEFAULT 'requested' CHECK(state IN('requested','processing','completed','failed','review')),
 created_at INTEGER NOT NULL DEFAULT(unixepoch()), updated_at INTEGER NOT NULL DEFAULT(unixepoch())
);
CREATE UNIQUE INDEX refund_one_pending ON refund_requests(payment_id) WHERE state IN('requested','processing','review');
CREATE TABLE privacy_tombstones (registration_id TEXT PRIMARY KEY REFERENCES registrations(id), anonymized_at INTEGER NOT NULL DEFAULT(unixepoch()));
DROP TRIGGER capacity_on_insert;
DROP TRIGGER capacity_on_update;
DROP TRIGGER capacity_on_session_edit;
CREATE TRIGGER capacity_on_insert BEFORE INSERT ON registrations
WHEN NEW.status IN('pending','confirmed')
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM sessions s JOIN workshops w ON w.id=s.workshop_id WHERE s.id=NEW.session_id AND s.status='published' AND w.status='published' AND s.starts_at>unixepoch()) THEN RAISE(ABORT,'SESSION_UNAVAILABLE') END;
 SELECT CASE WHEN NEW.seats-NEW.cancelled_seats+COALESCE((SELECT SUM(seats-cancelled_seats) FROM registrations WHERE session_id=NEW.session_id AND(status='confirmed' OR(status='pending' AND hold_until>unixepoch()))),0)>(SELECT capacity FROM sessions WHERE id=NEW.session_id) THEN RAISE(ABORT,'CAPACITY_EXCEEDED') END;
END;
CREATE TRIGGER capacity_on_update BEFORE UPDATE OF status,seats,cancelled_seats,session_id,hold_until ON registrations
WHEN NEW.status='confirmed' OR(NEW.status='pending' AND NEW.hold_until>unixepoch())
BEGIN
 SELECT CASE WHEN NEW.seats-NEW.cancelled_seats+COALESCE((SELECT SUM(seats-cancelled_seats) FROM registrations WHERE session_id=NEW.session_id AND id<>NEW.id AND(status='confirmed' OR(status='pending' AND hold_until>unixepoch()))),0)>(SELECT capacity FROM sessions WHERE id=NEW.session_id) THEN RAISE(ABORT,'CAPACITY_EXCEEDED') END;
END;
CREATE TRIGGER capacity_on_session_edit BEFORE UPDATE OF capacity ON sessions
BEGIN
 SELECT CASE WHEN NEW.capacity<COALESCE((SELECT SUM(seats-cancelled_seats) FROM registrations WHERE session_id=NEW.id AND(status='confirmed' OR(status='pending' AND hold_until>unixepoch()))),0) THEN RAISE(ABORT,'CAPACITY_BELOW_BOOKINGS') END;
END;
CREATE TRIGGER participant_cancelled AFTER UPDATE OF cancelled_at ON participants
WHEN OLD.cancelled_at IS NULL AND NEW.cancelled_at IS NOT NULL
BEGIN
 UPDATE registrations SET cancelled_seats=cancelled_seats+1,needs_attention=1,status=CASE WHEN cancelled_seats+1=seats THEN 'cancelled' ELSE status END WHERE id=NEW.registration_id;
END;
CREATE TRIGGER cancellation_no_reversal BEFORE UPDATE OF cancelled_at ON participants
WHEN OLD.cancelled_at IS NOT NULL AND NEW.cancelled_at IS NOT OLD.cancelled_at
BEGIN SELECT RAISE(ABORT,'CANCELLATION_ALREADY_RECORDED'); END;
CREATE TRIGGER cancellation_count_guard BEFORE UPDATE OF cancelled_seats ON registrations
WHEN NEW.cancelled_seats<>(SELECT COUNT(*) FROM participants WHERE registration_id=NEW.id AND cancelled_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'CANCELLATION_COUNT_MISMATCH'); END;
CREATE TRIGGER notice_booking_confirmed AFTER UPDATE OF status ON registrations
WHEN NEW.status='confirmed' AND OLD.status<>'confirmed'
BEGIN
 INSERT OR IGNORE INTO notification_outbox(id,event_key,registration_id,kind,subject,message,recipient)
 VALUES(lower(hex(randomblob(16))),'confirmed:'||NEW.id,NEW.id,'confirmation','Your Adventure Station booking',json_object('workshop',NEW.workshop_name,'starts',NEW.starts_at,'ends',NEW.ends_at,'timezone',NEW.timezone,'venue',NEW.venue_name,'address',NEW.venue_address,'places',NEW.seats-NEW.cancelled_seats,'reference',NEW.id,'instructions',NEW.instructions_snapshot,'contact',NEW.contact_snapshot),NEW.guardian_email);
END;
CREATE TRIGGER notice_cancelled AFTER UPDATE OF status ON registrations
WHEN NEW.status='cancelled' AND OLD.status<>'cancelled'
BEGIN
 INSERT OR IGNORE INTO notification_outbox(id,event_key,registration_id,kind,subject,message,recipient)
 VALUES(lower(hex(randomblob(16))),'cancelled:'||NEW.id,NEW.id,'cancellation','Adventure Station cancellation update',json_object('workshop',NEW.workshop_name,'starts',NEW.starts_at,'timezone',NEW.timezone,'venue',NEW.venue_name,'reference',NEW.id,'contact',NEW.contact_snapshot),NEW.guardian_email);
END;
CREATE TRIGGER notice_refund_requested AFTER INSERT ON refund_requests
BEGIN
 INSERT OR IGNORE INTO notification_outbox(id,event_key,registration_id,kind,subject,message,recipient)
 SELECT lower(hex(randomblob(16))),'refund-requested:'||NEW.id,r.id,'refund_requested','Adventure Station refund request',json_object('workshop',r.workshop_name,'reference',r.id,'amount',NEW.amount,'contact',r.contact_snapshot),r.guardian_email FROM registrations r WHERE r.id=NEW.registration_id;
END;
CREATE TRIGGER notice_refund_processing AFTER UPDATE OF state ON refund_requests
WHEN NEW.state='processing' AND OLD.state<>'processing'
BEGIN
 INSERT OR IGNORE INTO notification_outbox(id,event_key,registration_id,kind,subject,message,recipient)
 SELECT lower(hex(randomblob(16))),'refund-processing:'||NEW.id,r.id,'refund_processing','Adventure Station refund processing',json_object('workshop',r.workshop_name,'reference',r.id,'amount',NEW.amount,'contact',r.contact_snapshot),r.guardian_email FROM registrations r WHERE r.id=NEW.registration_id;
END;
CREATE TRIGGER notice_refund_verified AFTER UPDATE OF refunded ON payments
WHEN NEW.refunded>OLD.refunded
BEGIN
 INSERT OR IGNORE INTO notification_outbox(id,event_key,registration_id,kind,subject,message,recipient)
 SELECT lower(hex(randomblob(16))),'refund-verified:'||NEW.id||':'||NEW.refunded,r.id,'refund_completed','Adventure Station refund verified',json_object('workshop',r.workshop_name,'reference',r.id,'amount',NEW.refunded-OLD.refunded,'contact',r.contact_snapshot),r.guardian_email FROM registrations r WHERE r.id=NEW.registration_id;
END;
CREATE TRIGGER notice_refund_initial AFTER INSERT ON payments WHEN NEW.refunded>0
BEGIN
 INSERT OR IGNORE INTO notification_outbox(id,event_key,registration_id,kind,subject,message,recipient)
 SELECT lower(hex(randomblob(16))),'refund-verified:'||NEW.id||':'||NEW.refunded,r.id,'refund_completed','Adventure Station refund verified',json_object('workshop',r.workshop_name,'reference',r.id,'amount',NEW.refunded,'contact',r.contact_snapshot),r.guardian_email FROM registrations r WHERE r.id=NEW.registration_id;
END;
