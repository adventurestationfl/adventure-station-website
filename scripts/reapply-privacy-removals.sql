-- Run against the restored, isolated database only, after importing the separately retained
-- latest privacy_tombstones register and BEFORE enabling staff access, checkout or notifications.
UPDATE registrations SET guardian_name=NULL,guardian_email=NULL,guardian_phone=NULL,marketing_consent=0,photo_consent=0,
 anonymized_at=(SELECT anonymized_at FROM privacy_tombstones t WHERE t.registration_id=registrations.id)
 WHERE id IN(SELECT registration_id FROM privacy_tombstones);
UPDATE participants SET first_name=NULL,age=NULL WHERE registration_id IN(SELECT registration_id FROM privacy_tombstones);
UPDATE notification_outbox SET recipient=NULL,message='{}',state=CASE WHEN state IN('queued','sending','review') THEN 'suppressed' ELSE state END,last_error=''
 WHERE registration_id IN(SELECT registration_id FROM privacy_tombstones);
