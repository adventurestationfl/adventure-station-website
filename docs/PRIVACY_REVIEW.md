# Privacy and owner decisions before launch

This is an implementation and review record, not a finalized legal policy or a determination that a particular statute applies or does not apply.

## Implemented safeguards

- Registration is addressed to parents and guardians, with an explicit guardian attestation. There are no child accounts.
- Collected fields are guardian name, email and contact phone; child first name and age; session; optional separate marketing and photo choices; policy snapshot; payment references. No birth dates, home addresses or medical information are requested.
- Both optional choices default off. Choosing one does not choose the other. Their wording and the actual business practices still require owner review.
- Card data stays on Square's hosted page. Child identifiers are excluded from Square line items and application logs.
- Staff APIs enforce application roles after validating signed Access identity. Instructors receive only assigned rosters, without guardian contact details or financial configuration. Public receipt APIs omit guardian/child details.
- Application request logging is disabled in the checked-in Worker configuration. Audit entries record actor IDs, actions, entity IDs and timestamps, not submitted form bodies or tokens.
- The rate limiter stores salted hashes and removes expired entries. Receipt tokens are hashed at rest and placed in HttpOnly cookies. No advertising, analytics, remote font, social widget or tracking dependencies have been added.
- Uploaded public images are re-encoded at three sizes; the server validates JPEG headers/dimensions and removes EXIF/IPTC/comment metadata. Upload rights must be affirmed. The media library is for public website material, never private child records.
- An owner-only historical anonymization action clears guardian/participant details while retaining payment and attendance facts. The dashboard counts records due for review after the configurable review period. It does not automatically erase records or backups.

## Matters requiring confirmation

1. Actual Florida locality and IANA timezone. Florida has more than one timezone.
2. Confirmed venue, supervision, drop-off/pickup arrangements, refund policy, business identity and contact details.
3. The appropriate privacy notice, retention period, parental review/deletion request process, marketing practice and photo permission scope.
4. Whether the audience, artwork, actual visitors and collection practices bring any part of the service within COPPA, including the amended rule. Parent-submitted information alone is not used as an exemption determination; a guardian checkbox is not represented as legally sufficient verifiable parental consent.
5. Applicability of Florida breach/security/privacy requirements, incident response contacts and reporting procedures.
6. Retention for financial records, audit records, saved content versions and backups; treatment of deletion requests after a restore. Application anonymization cannot by itself erase old backups or processor records.
7. A secure, documented way to verify and fulfill guardian requests, and an incident/recovery rehearsal before real records are accepted.

Relevant primary sources checked October 27, 2026:

- [FTC COPPA FAQs, including the notice of the amended rule](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions)
- [FTC compliance plan](https://www.ftc.gov/business-guidance/resources/childrens-online-privacy-protection-rule-six-step-compliance-plan-your-business)
- [Florida Statutes 501.1735, including its defined scope](https://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0500-0599/0501/Sections/0501.1735.html)

Until these decisions are made, the application's policy text remains explicitly awaiting owner confirmation, and new session publication and registration are blocked. Do not import real records into a preview.
