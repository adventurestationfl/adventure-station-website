-- CI-only disposable fixtures. No payments or real customer information.
INSERT INTO venues(id,name,address,verified,capacity,accessibility,permission_confirmed) VALUES('e2e-venue','E2E test venue only','Not a real address',1,12,'Test accessibility only',1);
INSERT INTO workshops(id,slug,name,summary,description,status) VALUES('e2e-workshop','e2e-booking-fixture','E2E booking fixture — not a real workshop','Test fixture only','Test fixture only','published');
INSERT INTO sessions(id,workshop_id,starts_at,ends_at,timezone,venue_id,capacity,price,status) VALUES('e2e-session','e2e-workshop',4097098800,4097102400,'America/Chicago','e2e-venue',12,2500,'published');
INSERT INTO registrations(id,intent_key,request_hash,receipt_hash,session_id,seats,guardian_name,guardian_email,guardian_phone,status,hold_until,total,workshop_name,starts_at,ends_at,timezone,venue_name,venue_address,policy_snapshot,age_min,age_max)
 SELECT 'e2e-'||column1,'e2e-intent-'||column1,'test-only','test-only','e2e-session',3,'E2E guardian '||column1,'test@example.invalid','5550000000','pending',unixepoch()+1800,7500,'E2E booking fixture — not a real workshop',4097098800,4097102400,'America/Chicago','E2E test venue only','Not a real address','{}',4,10 FROM (VALUES('desktop'),('mobile'));
INSERT INTO participants(id,registration_id,first_name,age) SELECT 'e2e-child-'||a.column1||'-'||b.column1,'e2e-'||a.column1,'Test child '||b.column1,6 FROM (VALUES('desktop'),('mobile')) a CROSS JOIN (VALUES('A'),('B'),('C')) b;
UPDATE sessions SET status='draft' WHERE id='e2e-session';
