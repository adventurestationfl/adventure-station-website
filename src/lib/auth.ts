import { createRemoteJWKSet, jwtVerify } from 'jose';
import { HttpError, localOnly } from './http';
import { audit } from './data';
export type Staff = {
  id: string;
  email: string;
  subject: string | null;
  name: string;
  role: 'owner' | 'manager' | 'instructor' | 'godmin';
  locale?: 'en-US' | 'es-MX';
  encouragement?: 'shown' | 'minimized' | 'disabled';
};
export async function authenticate(request: Request, env: Cloudflare.Env): Promise<Staff> {
  if (localOnly(request, env) && env.DEV_AUTH === 'true') {
    const staff = await env.DB.prepare(
      "SELECT s.*,CASE WHEN EXISTS(SELECT 1 FROM technical_grants g WHERE g.staff_id=s.id AND g.verified_subject=s.subject) THEN 'godmin' ELSE s.role END AS role FROM staff s WHERE s.id='local-owner' AND s.active=1",
    ).first<Staff>();
    if (staff) return staff;
  }
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD)
    throw new HttpError(503, 'Staff sign-in is not configured yet.');
  if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_TEAM_DOMAIN))
    throw new HttpError(503, 'Staff sign-in needs configuration.');
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) throw new HttpError(401, 'Please sign in through the staff portal.');
  let payload;
  try {
    ({ payload } = await jwtVerify(
      token,
      createRemoteJWKSet(new URL(`https://${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`)),
      {
        issuer: `https://${env.ACCESS_TEAM_DOMAIN}`,
        audience: env.ACCESS_AUD,
        algorithms: ['RS256'],
        requiredClaims: ['exp', 'iat', 'sub', 'email'],
      },
    ));
  } catch {
    throw new HttpError(401, 'Your sign-in has expired. Please sign in again.');
  }
  // Bind an invited email only after verifying the signed Access identity. No trust in email headers or client roles.
  const bound = await env.DB.prepare(
    'UPDATE staff SET subject=? WHERE email=? COLLATE NOCASE AND subject IS NULL AND active=1 RETURNING id',
  )
    .bind(payload.sub, payload.email)
    .first<{ id: string }>();
  if (bound)
    await audit(env.DB, bound.id, 'team.identity.verified', bound.id, { source: 'system' }).run();
  const staff = await env.DB.prepare(
    "SELECT s.*,CASE WHEN EXISTS(SELECT 1 FROM technical_grants g WHERE g.staff_id=s.id AND g.verified_subject=s.subject) THEN 'godmin' ELSE s.role END AS role FROM staff s WHERE s.subject=? AND s.email=? COLLATE NOCASE AND s.active=1",
  )
    .bind(payload.sub, payload.email)
    .first<Staff>();
  if (!staff) throw new HttpError(403, 'Your account has not been given staff access.');
  return staff;
}
export function authorize(staff: Staff, roles: Staff['role'][]) {
  if (!roles.includes(staff.role))
    throw new HttpError(403, 'Your role does not allow this action.');
}
export const permissions = {
  operations: ['owner', 'manager', 'godmin'],
  technical: ['owner', 'godmin'],
  businessApproval: ['owner'],
  financial: ['owner'],
  privacyDecision: ['owner'],
} as const;
export function requirePermission(staff: Staff, permission: keyof typeof permissions) {
  authorize(staff, [...permissions[permission]]);
}
