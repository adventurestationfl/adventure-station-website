import { z } from 'zod';
import { activityTopics } from './activity-topics';
export const id = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/);
const text = (max: number) => z.string().trim().max(max);
export const workshopSchema = z
  .object({
    name: text(120).min(2),
    slug: text(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    summary: text(240),
    description: text(8000),
    category: text(80),
    activity_tags: z.preprocess(
      (value) => {
        if (typeof value === 'string') {
          try {
            return JSON.parse(value);
          } catch {
            return value;
          }
        }
        return value;
      },
      z
        .array(z.enum(activityTopics.map((t) => t.id) as [string, ...string[]]))
        .max(7)
        .default([]),
    ),
    age_min: z.number().int().min(1).max(17),
    age_max: z.number().int().min(1).max(17),
    duration: z.number().int().min(15).max(480),
    price: z.number().int().min(100).max(100000),
    capacity: z.number().int().min(1).max(100),
    venue_id: id.nullable(),
    media_id: id.nullable(),
    materials: text(1500),
    instructions: text(1500),
    status: z.enum(['draft', 'published', 'archived']),
    revision: z.number().int().positive().optional(),
    gallery_ids: z.array(id).max(12).default([]),
  })
  .refine((v) => v.age_max >= v.age_min, {
    message: 'Maximum age must be at least the minimum age.',
  });
export const sessionSchema = z
  .object({
    workshop_id: id,
    starts_at: z.number().int(),
    ends_at: z.number().int(),
    timezone: text(80),
    venue_id: id,
    capacity: z.number().int().min(1).max(100),
    price: z.number().int().min(100).max(100000),
    instructor_id: id.nullable(),
    status: z.enum(['draft', 'published', 'closed', 'cancelled', 'archived']),
    revision: z.number().int().positive().optional(),
  })
  .refine((v) => v.ends_at > v.starts_at && v.ends_at - v.starts_at <= 28800, {
    message: 'Choose an end time after the start (up to eight hours).',
  });
export const venueSchema = z.object({
  name: text(120).min(2),
  address: text(500),
  instructions: text(1500),
  verified: z.boolean(),
  archived: z.boolean().default(false),
  capacity: z.number().int().min(1).max(100).nullable().default(null),
  accessibility: text(1500).default(''),
  permission_confirmed: z.boolean().default(false),
});
export const siteSchema = z
  .object({
    headline: text(140).min(2),
    intro: text(800),
    about: text(5000),
    email: z.email().max(254),
    phone: text(40),
    timezone: text(80),
    locality: text(120),
    policiesApproved: z.boolean(),
    refundPolicy: text(6000),
    supervisionPolicy: text(6000),
    pickupPolicy: text(6000),
    privacyPolicy: text(10000),
    faqs: z.array(z.object({ question: text(180).min(2), answer: text(2000).min(2) })).max(30),
    accent: z.enum(['coral', 'blue', 'green']),
    promotion: text(180),
    heroMediaId: id.nullable(),
    retentionDays: z.number().int().min(30).max(730),
  })
  .superRefine((v, ctx) => {
    if (
      v.policiesApproved &&
      [v.refundPolicy, v.supervisionPolicy, v.pickupPolicy, v.privacyPolicy].some((value) =>
        value.includes('[OWNER:'),
      )
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Complete every [OWNER: ...] item in the policy drafts before approving them.',
      });
    }
    if (v.timezone) {
      try {
        new Intl.DateTimeFormat('en', { timeZone: v.timezone });
      } catch {
        ctx.addIssue({ code: 'custom', message: 'Choose a valid IANA timezone.' });
      }
    }
    if (
      v.policiesApproved &&
      (!v.timezone ||
        !v.locality ||
        !v.refundPolicy ||
        !v.supervisionPolicy ||
        !v.pickupPolicy ||
        !v.privacyPolicy)
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Complete the locality, timezone and all four policies before approval.',
      });
  });
export const registrationSchema = z.object({
  coupon_code: z.string().trim().max(32).default(''),
  expected_total: z.number().int().positive().optional(),
  locale: z.enum(['en-US', 'es-MX']).default('en-US'),
  policy_version: text(150).optional(),
  session_id: id,
  guardian_name: text(100).min(2),
  guardian_email: z.email().max(254),
  guardian_phone: text(40).min(7),
  participants: z
    .array(z.object({ first_name: text(60).min(1), age: z.number().int().min(1).max(17) }))
    .min(1)
    .max(12),
  guardian_attestation: z.literal(true),
  policy_agreement: z.literal(true),
  marketing_consent: z.boolean().default(false),
  photo_consent: z.literal(false).default(false),
});
export type SiteSettings = z.infer<typeof siteSchema>;
export type Workshop = Omit<z.infer<typeof workshopSchema>, 'activity_tags'> & {
  id: string;
  activity_tags: string | string[];
};
export type Session = z.infer<typeof sessionSchema> & {
  id: string;
  workshop_name: string;
  venue_name: string;
  occupied: number;
};
