import type { Staff } from './auth';

export type NavigationItem = { section: string; label: string; href: string; icon: string };
export type NavigationGroup = { name: string; items: NavigationItem[] };
const item = (section: string, label: string, icon = section, hash = ''): NavigationItem => ({
  section,
  label,
  icon,
  href: `/admin/${section}${hash}`,
});

// Presentation follows existing permissions; the server remains the authority for every action.
export function staffNavigation(role: Staff['role']): NavigationGroup[] {
  if (role === 'instructor')
    return [{ name: 'Daily work', items: [item('sessions', 'My class dates')] }];
  return [
    {
      name: 'Daily work',
      items: [
        item('dashboard', 'Overview'),
        item('workshops', 'Workshops'),
        item('sessions', 'Class dates'),
        item('registrations', 'Registrations'),
        item('notifications', 'Messages'),
      ],
    },
    {
      name: 'Creative studio',
      items: [
        item('creative', 'Creative Spark'),
        item('content', 'Website content'),
        item('media', 'Images'),
      ],
    },
    {
      name: 'Business',
      items: [
        item('venues', 'Venues'),
        ...(role === 'owner' ? [item('setup', 'Setup'), item('privacy', 'Privacy review')] : []),
        ...(['owner', 'godmin'].includes(role)
          ? [item('activity', 'Activity History'), item('team', 'Team access')]
          : []),
      ],
    },
    ...(role === 'godmin'
      ? [
          {
            name: 'Technical settings',
            items: [
              item('connections', 'AI Connections'),
              item('setup', 'Integration status', 'setup', '#integrations'),
            ],
          },
        ]
      : []),
  ];
}
export const navigationIcons: Record<string, string> = {
  dashboard: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  workshops: 'm14 3 7 7-9 9-7 2 2-7z M5 16l3 3 M12 5l7 7',
  sessions: 'M4 5h16v16H4z M8 2v6 M16 2v6 M4 10h16',
  registrations: 'M4 4h16v17H4z M8 8h8 M8 12h8 M8 16h5',
  notifications: 'M3 5h18v14H3z m0 0 9 7 9-7',
  content: 'M5 3h10l4 4v14H5z M14 3v5h5 M8 12h8 M8 16h6',
  media: 'M3 3h18v18H3z m0 14 6-6 4 4 3-3 5 5 M15 7h2',
  venues: 'M12 22S4 14 4 9a8 8 0 0 1 16 0c0 5-8 13-8 13z M9 9a3 3 0 1 0 6 0 3 3 0 1 0-6 0',
  setup: 'M4 3h16v18H4z m4 9 3 3 5-6',
  privacy: 'm12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6z m-4 10 3 3 5-6',
  team: 'M16 21v-3a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v3 M9 3a4 4 0 1 0 0 8 4 4 0 1 0 0-8 M17 4a4 4 0 0 1 0 7 M22 21v-3a4 4 0 0 0-3-4',
  creative: 'M12 3v4 M3 12h4 M17 12h4 M12 17v4 M7 7l3 3 M17 7l-3 3 M7 17l3-3 M17 17l-3-3',
  activity: 'M4 3h16v18H4z M8 7h8 M8 12h8 M8 17h5',
  settings: 'M4 6h16 M4 12h16 M4 18h16 M8 3v6 M16 9v6 M10 15v6',
  connections: 'M8 8H6a4 4 0 0 0 0 8h3 M16 8h2a4 4 0 0 1 0 8h-3 M8 12h8',
};
