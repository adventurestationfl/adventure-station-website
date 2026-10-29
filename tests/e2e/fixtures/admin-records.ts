import type { Page } from '@playwright/test';
// Presentation-only synthetic fixtures. No real identity, transaction or provider is used.
export const longWorkshop =
  'Paper gardens, painted patterns and imaginative miniature worlds — synthetic workshop for creative families';
export const longEmail =
  'synthetic.guardian.with.a.very.long.contact.address.for.layout.review@example.invalid';
export const uxSessions = Array.from({ length: 4 }, (_, i) => ({
  id: 'ux-session-' + i,
  workshop_id: 'e2e-workshop',
  workshop_name: longWorkshop + (i ? ' · ' + (i + 1) : ''),
  starts_at: 4097098800 + i * 86400,
  ends_at: 4097104200 + i * 86400,
  timezone: 'America/Chicago',
  venue_id: 'e2e-venue',
  venue_name: 'Synthetic creative studio — accessible entrance beside the community garden',
  capacity: 12,
  occupied: 8,
  price: 2750,
  status: i === 2 ? 'closed' : 'published',
  instructor_id: null,
  revision: 1,
}));
export const uxRegistrations = Array.from({ length: 3 }, (_, i) => ({
  id: 'ux-registration-' + i,
  workshop_name: longWorkshop,
  guardian_name: 'Synthetic family ' + (i + 1) + ' — extended guardian name',
  guardian_email: longEmail,
  guardian_phone: '5550000000',
  starts_at: 4097098800,
  ends_at: i ? 4097104200 : 1,
  timezone: 'America/Chicago',
  seats: 3,
  cancelled_seats: 1,
  total: 8250,
  paid: 8250,
  refunded: 2750,
  status: i === 1 ? 'confirmed' : 'payment_review',
  needs_attention: 1,
  anonymized_at: null,
  payment_issues: i ? [] : [{ amount: 2750, currency: 'USD', refunded: 0 }],
}));
export const uxTeam = [
  {
    id: 'ux-owner',
    name: 'Synthetic business owner with an extended display name',
    email: 'synthetic.owner.with.long.business.contact@example.invalid',
    role: 'owner',
    base_role: 'owner',
    active: 1,
    identity_bound: 1,
  },
  {
    id: 'ux-instructor',
    name: 'Synthetic bilingual workshop instructor',
    email: 'synthetic.instructor.with.long.name@example.invalid',
    role: 'instructor',
    base_role: 'instructor',
    active: 1,
    identity_bound: 1,
  },
  {
    id: 'ux-tech',
    name: 'Synthetic technical support manager',
    email: 'synthetic.technical.support@example.invalid',
    role: 'godmin',
    base_role: 'instructor',
    active: 1,
    identity_bound: 1,
  },
];
export const uxRoster = Array.from({ length: 5 }, (_, i) => ({
  id: 'ux-child-' + i,
  first_name: 'Synthetic participant ' + (i + 1),
  age: 6 + (i % 3),
  attended: 0,
  guardian_name: 'Synthetic accompanying adult ' + (i + 1),
  guardian_email: longEmail,
  guardian_phone: '5550000000',
}));
export async function mockRecords(
  page: Page,
  options: { empty?: boolean; instructor?: boolean; spanishContent?: boolean } = {},
) {
  const checked = new Map<string, boolean>(),
    writes: Array<{ id: string; attended: boolean }> = [];
  await page.route('**/api/admin/**', async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname.slice('/api/admin/'.length);
    if (request.method() === 'GET') {
      const data =
        path === 'sessions'
          ? uxSessions
          : path === 'registrations'
            ? uxRegistrations
            : path === 'team'
              ? uxTeam
              : /^sessions\/ux-session-\d\/roster$/.test(path)
                ? uxRoster.map((r) => {
                    const { guardian_name, guardian_email, guardian_phone, ...minimal } = r;
                    return {
                      ...(options.instructor ? minimal : r),
                      attended: Number(checked.get(r.id) ?? false),
                    };
                  })
                : undefined;
      if (data !== undefined) {
        const translated = options.spanishContent
          ? data.map((row: any) => ({
              ...row,
              ...('workshop_name' in row
                ? {
                    workshop_name:
                      'Jardines de papel, patrones de pintura y pequeños mundos imaginarios — taller ficticio para familias con mucha creatividad',
                  }
                : {}),
              ...('venue_name' in row
                ? {
                    venue_name:
                      'Estudio comunitario ficticio — entrada accesible junto al jardín de la comunidad',
                  }
                : {}),
            }))
          : data;
        return route.fulfill({ json: options.empty ? [] : translated });
      }
    }
    const match = /^participants\/(ux-child-\d)\/attendance$/.exec(path);
    if (match && request.method() === 'POST') {
      const body = request.postDataJSON();
      checked.set(match[1]!, body.attended);
      writes.push({ id: match[1]!, attended: body.attended });
      return route.fulfill({ json: { saved: true } });
    }
    return route.continue();
  });
  return { writes };
}
