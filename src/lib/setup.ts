import { z } from 'zod';
import { audit, settings } from './data';
import { HttpError, sha256, now } from './http';
import { paymentConfigured } from './square';
import type { Staff } from './auth';
const note = z.string().trim().max(2500);
export const setupSchema = z.object({
  legalName: z.string().trim().max(160),
  mailingContact: z.string().trim().max(500),
  supervision: z.enum(['undecided', 'parent_present', 'drop_off']),
  safetyNotes: note,
  licensingOutcome: z.enum([
    'unreviewed',
    'review_pending',
    'license_required',
    'owner_reports_authorized',
    'owner_reports_not_required',
  ]),
  licensingNotes: note,
  licensingReference: z
    .string()
    .trim()
    .max(500)
    .refine((v) => !v || /^https:\/\//.test(v), 'Use an https reference.'),
  privacyNotes: note,
  editorialNotes: note,
  minimized: z.boolean(),
  confirm: z
    .array(z.enum(['business', 'supervision', 'licensing', 'privacy', 'editorial']))
    .default([]),
});
type Decisions = z.infer<typeof setupSchema> & {
  confirmed: Record<string, { fingerprint: string; at: number; actor: string }>;
};
export async function setupDecisions(db: D1Database) {
  const row = await db
    .prepare("SELECT value,revision FROM settings WHERE key='owner_setup'")
    .first<{ value: string; revision: number }>();
  if (!row) throw new Error('Missing owner setup migration');
  return { decisions: JSON.parse(row.value) as Decisions, revision: row.revision };
}
export async function integrationFingerprint(env: Cloudflare.Env, kind: string) {
  const s = await settings(env.DB);
  const { decisions: d } = await setupDecisions(env.DB);
  const configuration: Record<string, unknown> = {
    payment: [
      env.ENVIRONMENT,
      env.PUBLIC_ORIGIN,
      env.SQUARE_ENVIRONMENT,
      env.SQUARE_LOCATION_ID,
      env.SQUARE_WEBHOOK_URL,
      env.SQUARE_ACCESS_TOKEN,
      env.SQUARE_WEBHOOK_SIGNATURE_KEY,
      env.ABUSE_SALT,
    ],
    email: [
      env.ENVIRONMENT,
      env.PUBLIC_ORIGIN,
      env.EMAIL_MODE,
      env.EMAIL_FROM,
      env.EMAIL_TEST_RECIPIENT,
      env.RESEND_API_KEY,
    ],
    access: [env.ENVIRONMENT, env.PUBLIC_ORIGIN, env.ACCESS_TEAM_DOMAIN, env.ACCESS_AUD],
    regulatory: [
      d.supervision,
      d.safetyNotes,
      d.licensingOutcome,
      d.licensingNotes,
      d.licensingReference,
      s.locality,
    ],
    recovery: [env.ENVIRONMENT, env.PUBLIC_ORIGIN, 'schema-0009'],
    acceptance: [env.ENVIRONMENT, env.PUBLIC_ORIGIN, s, d],
  };
  return sha256(JSON.stringify(configuration[kind] ?? null));
}
async function decisionPrints(env: Cloudflare.Env, d: Decisions | z.infer<typeof setupSchema>) {
  const s = await settings(env.DB);
  return Object.fromEntries(
    await Promise.all(
      Object.entries({
        business: [d.legalName, d.mailingContact, s.email, s.phone, s.locality, s.timezone],
        supervision: [d.supervision, d.safetyNotes],
        licensing: [d.supervision, d.licensingOutcome, d.licensingNotes, d.licensingReference],
        privacy: [
          d.supervision,
          d.privacyNotes,
          s.retentionDays,
          s.privacyPolicy,
          'no-identifiable-child-photos',
        ],
        editorial: [s.headline, s.intro, s.about, s.faqs, s.heroMediaId, d.editorialNotes],
      }).map(async ([k, v]) => [k, await sha256(JSON.stringify(v))]),
    ),
  );
}
export async function saveSetup(env: Cloudflare.Env, staff: Staff, input: unknown) {
  const raw = input as { revision?: number },
    value = setupSchema.parse(input),
    { decisions: old, revision } = await setupDecisions(env.DB);
  if (raw.revision !== revision)
    throw new HttpError(409, 'Setup has changed. Reload before saving.');
  const prints = await decisionPrints(env, value),
    confirmed = { ...old.confirmed };
  for (const k of value.confirm)
    confirmed[k] = { fingerprint: prints[k]!, at: now(), actor: staff.id };
  const { confirm, ...fields } = value;
  const changed = old.supervision !== value.supervision;
  const versionId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE settings SET value=CASE WHEN revision=? THEN ? ELSE NULL END,revision=revision+1 WHERE key='owner_setup'",
    ).bind(revision, JSON.stringify({ ...fields, confirmed })),
    ...(changed
      ? [
          env.DB.prepare(
            "INSERT INTO content_versions(id,value,actor) SELECT ?,value,? FROM settings WHERE key='site'",
          ).bind(versionId, staff.id),
          env.DB.prepare(
            "INSERT INTO content_media_refs(owner_key,media_id) SELECT ?,json_extract(value,'$.heroMediaId') FROM settings WHERE key='site' AND json_extract(value,'$.heroMediaId') IS NOT NULL",
          ).bind(versionId),
          env.DB.prepare(
            "UPDATE settings SET value=json_set(value,'$.policiesApproved',json('false')),revision=revision+1 WHERE key='site'",
          ),
        ]
      : []),
    audit(env.DB, staff.id, 'setup.saved', 'owner_setup'),
  ]);
}
export async function ownerSetup(env: Cloudflare.Env) {
  const { decisions: d, revision } = await setupDecisions(env.DB),
    s = await settings(env.DB),
    prints = await decisionPrints(env, d);
  const confirmed = (k: string) => d.confirmed[k]?.fingerprint === prints[k];
  const evidence = (
    await env.DB.prepare('SELECT * FROM integration_verifications').all<{
      kind: string;
      fingerprint: string;
      evidence: string;
      verified_at: number;
      expires_at: number;
      revoked_at: number | null;
    }>()
  ).results;
  const verified: Record<string, boolean> = {},
    external = [];
  for (const kind of ['payment', 'email', 'access', 'regulatory', 'recovery', 'acceptance']) {
    const row = evidence.find((r) => r.kind === kind),
      fingerprint = await integrationFingerprint(env, kind);
    verified[kind] =
      !!row &&
      !row.revoked_at &&
      row.expires_at > now() &&
      row.fingerprint === fingerprint &&
      !!row.evidence;
    external.push({
      kind,
      verified: verified[kind],
      evidence: verified[kind] ? row?.evidence : undefined,
      configurationFingerprint: fingerprint,
      at: verified[kind] ? row?.verified_at : undefined,
    });
  }
  const v = (
    await env.DB.prepare('SELECT * FROM venues WHERE archived=0').all<{
      verified: number;
      capacity: number | null;
      address: string;
      accessibility: string;
      permission_confirmed: number;
    }>()
  ).results;
  const venueReady =
    v.length > 0 &&
    v.some(
      (v) => v.verified && v.address && v.capacity && v.accessibility && v.permission_confirmed,
    );
  const tasks = [
    {
      id: 'business',
      title: 'Confirm your business details',
      help: 'Add your legal name and a suitable business mailing contact. Confirm the public email, phone and Freeport timezone.',
      href: '/admin/setup#business',
      complete:
        !!d.legalName &&
        !!d.mailingContact &&
        !!s.phone &&
        !!s.email &&
        !!s.locality &&
        !!s.timezone &&
        confirmed('business'),
    },
    {
      id: 'venues',
      title: 'Confirm your workshop locations',
      help: 'Check each location’s address, capacity, accessibility and permission to hold classes.',
      href: '/admin/venues',
      complete: venueReady,
    },
    {
      id: 'supervision',
      title: 'Choose how children are supervised',
      help: 'Will a parent stay throughout? Drop-off needs additional safety, policy and regulatory review.',
      href: '/admin/setup#supervision',
      complete: d.supervision !== 'undecided' && !!d.safetyNotes && confirmed('supervision'),
    },
    {
      id: 'licensing',
      title: 'Record your operating review',
      help: 'Record the determination and supporting notes. Your record is owner-reported; it is not independent legal certification.',
      href: '/admin/setup#licensing',
      complete:
        ['owner_reports_authorized', 'owner_reports_not_required'].includes(d.licensingOutcome) &&
        !!d.licensingNotes &&
        confirmed('licensing'),
    },
    {
      id: 'policies',
      title: 'Adopt your family policies',
      help: 'Review refunds, supervision, arrival/departure and privacy. Drafts remain private until approved.',
      href: '/admin/content',
      complete: s.policiesApproved,
    },
    {
      id: 'privacy',
      title: 'Plan privacy and retention',
      help: 'Confirm necessary data, review/removal requests, retention and optional marketing. Identifiable child photos are deferred.',
      href: '/admin/setup#privacy',
      complete: !!d.privacyNotes && confirmed('privacy'),
    },
    {
      id: 'editorial',
      title: 'Make the website yours',
      help: 'Review your homepage, artwork, About, FAQ and contact details. You can keep editing during setup.',
      href: '/admin/content',
      complete: !!d.editorialNotes && confirmed('editorial'),
    },
  ];
  const integrations = [
    { id: 'payment', title: 'Verify test payments', configured: paymentConfigured(env) },
    {
      id: 'email',
      title: 'Verify customer notifications',
      configured: env.EMAIL_MODE === 'resend_test' && !!env.RESEND_API_KEY && !!env.EMAIL_FROM,
    },
    {
      id: 'access',
      title: 'Verify staff sign-in',
      configured: !!env.ACCESS_AUD && !!env.ACCESS_TEAM_DOMAIN,
    },
    { id: 'recovery', title: 'Rehearse backup recovery', configured: false },
    { id: 'acceptance', title: 'Complete owner acceptance', configured: false },
  ].map((i) => ({
    ...i,
    complete: !!verified[i.id],
    status: verified[i.id]
      ? 'Verified'
      : i.configured
        ? 'Awaiting external verification'
        : 'Developer setup needed',
    help: 'A developer must record real environment-specific evidence. An owner checkbox cannot verify this.',
    href: '/admin/setup#integrations',
  }));
  const essential = tasks.filter((t) => t.id !== 'editorial').every((t) => t.complete);
  const started: Record<string, boolean> = {
    business: !!d.legalName || !!d.mailingContact,
    venues: v.length > 0,
    supervision: d.supervision !== 'undecided' || !!d.safetyNotes,
    licensing: d.licensingOutcome !== 'unreviewed' || !!d.licensingNotes,
    privacy: !!d.privacyNotes,
    editorial: !!d.editorialNotes,
    policies: !!s.refundPolicy,
  };
  return {
    decisions: d,
    revision,
    tasks: tasks.map((t) => ({
      ...t,
      status: t.complete
        ? 'Completed'
        : d.confirmed[t.id]
          ? 'Needs your attention'
          : t.id === 'licensing' && d.licensingOutcome === 'review_pending'
            ? 'Awaiting external review'
            : started[t.id]
              ? 'In progress'
              : 'Not started',
    })),
    integrations,
    external,
    completed: tasks.filter((t) => t.complete).length,
    total: tasks.length,
    readiness: {
      editorial: true,
      workshop: 'Each workshop and date is checked separately.',
      registration:
        essential &&
        !!verified.payment &&
        !!verified.access &&
        (d.supervision !== 'drop_off' || !!verified.regulatory),
      production: false,
    },
    registrationAllowed:
      essential &&
      !!verified.payment &&
      !!verified.access &&
      (d.supervision !== 'drop_off' || !!verified.regulatory),
    minimized: d.minimized,
  };
}
