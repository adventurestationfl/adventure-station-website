import type { APIRequestContext } from '@playwright/test';
type Role = 'owner' | 'manager' | 'instructor' | 'godmin';
// This is Wrangler's built-in LOCAL explorer, not an application route or auth bypass.
// Never permit a preview/production origin here. No schema or authorization code is changed.
export async function localStaffRole(request: APIRequestContext, role: Role) {
  const origin = 'http://127.0.0.1:4321';
  const identity = await request.get(origin + '/api/admin/me');
  const me = await identity.json();
  if (me.id !== 'local-owner')
    throw new Error('Role fixtures require the isolated local developer identity.');
  const batch = [
    {
      sql: "INSERT OR IGNORE INTO staff(id,email,subject,name,role) VALUES('ux-nav-grant-owner','ux-nav-owner@example.invalid','ux-nav-owner-sub','Synthetic navigation grant owner','owner')",
      params: [],
    },
    { sql: "DELETE FROM technical_grants WHERE staff_id='local-owner'", params: [] },
    {
      sql: "UPDATE staff SET role=?,active=1 WHERE id='local-owner'",
      params: [role === 'godmin' ? 'instructor' : role],
    },
    ...(role === 'godmin'
      ? [
          {
            sql: "INSERT INTO technical_grants(staff_id,verified_subject,granted_by) SELECT id,subject,'ux-nav-grant-owner' FROM staff WHERE id='local-owner'",
            params: [],
          },
        ]
      : []),
  ];
  const result = await request.post(
    origin + '/cdn-cgi/local/explorer/api/d1/database/local-only/raw',
    { data: { batch }, maxRedirects: 0 },
  );
  if (!result.ok() || !(await result.json()).success)
    throw new Error('Local-only role fixture failed.');
}
