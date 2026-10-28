import { zonedDateTime, wallClock } from '../lib/time';
const main = document.querySelector<HTMLElement>('#admin-main')!,
  workspace = document.querySelector<HTMLElement>('#workspace')!,
  message = document.querySelector<HTMLElement>('#admin-message')!;
const section = main.dataset.section!,
  role = main.dataset.role!;
const h = (v: unknown) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
const cash = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format((v ?? 0) / 100);
const date = (v: number, tz: string) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(v * 1000);
const status = (v: string) => `<span class="status ${h(v)}">${h(v.replaceAll('_', ' '))}</span>`;
const button = (label: string, action: string, id = '', style = 'light') =>
  `<button type="button" class="btn small ${style}" data-action="${h(action)}" data-id="${h(id)}">${h(label)}</button>`;
function notify(text: string, error = false) {
  message.textContent = text;
  message.className = `notice${error ? ' error' : ''}`;
  message.scrollIntoView({ block: 'nearest' });
}
async function api(path: string, method = 'GET', data?: unknown) {
  const response = await fetch(`/api/admin/${path}`, {
    method,
    headers: data instanceof FormData ? {} : { 'Content-Type': 'application/json' },
    body: data === undefined ? undefined : data instanceof FormData ? data : JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? 'Please try again.');
  return result;
}
const heading = (title: string, subtitle: string, actions = '') =>
  `<header class="admin-heading"><div><h1>${h(title)}</h1><p>${h(subtitle)}</p></div><div class="inline-actions">${actions}</div></header>`;
function field(
  label: string,
  name: string,
  value: unknown = '',
  type = 'text',
  help = '',
  attrs = '',
) {
  return `<div class="field"><label for="${h(name)}">${h(label)}</label>${type === 'textarea' ? `<textarea id="${h(name)}" name="${h(name)}" ${attrs}>${h(value)}</textarea>` : `<input id="${h(name)}" name="${h(name)}" type="${h(type)}" value="${h(value)}" ${attrs}/>`}${help ? `<small>${h(help)}</small>` : ''}</div>`;
}
function select(
  label: string,
  name: string,
  value: unknown,
  options: { id: unknown; name: unknown }[],
  attrs = '',
) {
  return `<div class="field"><label for="${h(name)}">${h(label)}</label><select id="${h(name)}" name="${h(name)}" ${attrs}>${options.map((o) => `<option value="${h(o.id)}" ${String(o.id ?? '') === String(value ?? '') ? 'selected' : ''}>${h(o.name)}</option>`).join('')}</select></div>`;
}
const check = (label: string, name: string, value: boolean, disabled = false) =>
  `<label class="check"><input type="checkbox" name="${h(name)}" ${value ? 'checked' : ''} ${disabled ? 'disabled' : ''}/>${h(label)}</label>`;
const saveBar = (label = 'Save changes') =>
  `<div class="save-bar"><span class="muted">Your changes are saved when you choose “${h(label)}”.</span><button class="btn" type="submit">${h(label)} ↗</button></div>`;
const empty = (title: string, detail: string, action = '') =>
  `<div class="panel empty-admin"><h2>${h(title)}</h2><p>${h(detail)}</p>${action}</div>`;
const formValues = (form: HTMLFormElement) => Object.fromEntries(new FormData(form).entries());
function onSave(form: HTMLFormElement, save: () => Promise<void>) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const b = form.querySelector<HTMLButtonElement>('[type=submit]')!;
    b.disabled = true;
    try {
      await save();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Please try again.', true);
    } finally {
      b.disabled = false;
    }
  });
}
let workshops: any[] = [],
  sessions: any[] = [],
  venues: any[] = [],
  media: any[] = [],
  instructors: any[] = [],
  content: any;
async function lookups() {
  [workshops, sessions, venues, media, instructors, content] = await Promise.all(
    ['workshops', 'sessions', 'venues', 'media', 'instructors', 'content'].map((p) => api(p)),
  );
}
function workshopEditor(original?: any, duplicate = false) {
  const w = original
    ? { ...original }
    : {
        name: '',
        slug: '',
        summary: '',
        description: '',
        category: 'Arts & crafts',
        age_min: 4,
        age_max: 10,
        duration: 60,
        price: 2500,
        capacity: 12,
        venue_id: null,
        media_id: null,
        materials: '',
        instructions: '',
        status: 'draft',
      };
  if (duplicate) {
    w.id = null;
    w.name = `${w.name} (copy)`;
    w.slug = `${w.slug}-copy-${crypto.randomUUID().slice(0, 6)}`;
    w.status = 'draft';
  }
  workspace.innerHTML =
    heading(
      w.id ? 'Edit workshop' : 'Create a workshop',
      'Describe it once. Add as many class dates as you need.',
      button('Back to workshops', 'back'),
    ) +
    `<form id="editor"><div class="form-columns"><div class="panel"><h2>The creative idea</h2>${field('Workshop name', 'name', w.name, 'text', '', 'required maxlength="120"')}${field('Page address', 'slug', w.slug, 'text', 'Use lowercase words separated by hyphens.', 'required pattern="[a-z0-9]+(-[a-z0-9]+)*"')}${field('Short description', 'summary', w.summary, 'textarea', 'A sentence or two for the workshop card.', 'maxlength="240"')}${field('Full description', 'description', w.description, 'textarea', '', 'maxlength="8000"')}${field('Category', 'category', w.category)}${select('Workshop image', 'media_id', w.media_id, [{ id: '', name: 'Original Adventure Station artwork' }, ...media.map((m) => ({ id: m.id, name: m.alt }))])}${media.length ? `<fieldset><legend>Workshop gallery (up to 12 images)</legend>${media.map((m) => check(m.alt, 'gallery_ids', (w.gallery_ids ?? []).includes(m.id)).replace('name="gallery_ids"', `name="gallery_ids" value="${h(m.id)}"`)).join('')}</fieldset>` : ''}${field('Included materials', 'materials', w.materials, 'textarea')}${field('Instructions for families', 'instructions', w.instructions, 'textarea')}</div><div><div class="panel"><h2>Defaults for new dates</h2><p class="muted">Change these here to save time later. Existing class dates and registrations keep their details.</p><div class="form-grid">${field('Youngest age', 'age_min', w.age_min, 'number', '', 'required min="1" max="17"')}${field('Oldest age', 'age_max', w.age_max, 'number', '', 'required min="1" max="17"')}${field('Duration (minutes)', 'duration', w.duration, 'number', '', 'required min="15" max="480"')}${field('Places per class', 'capacity', w.capacity, 'number', '', 'required min="1" max="100"')}</div>${field('Price per child ($)', 'price', w.price / 100, 'number', '', 'required min="1" max="1000" step="0.01"')}${select('Usual venue', 'venue_id', w.venue_id, [{ id: '', name: 'Choose when scheduling' }, ...venues.map((v) => ({ id: v.id, name: v.name }))])}</div><div class="panel"><h2>Visibility</h2>${select(
      'Workshop status',
      'status',
      w.status,
      ['draft', 'published', 'archived'].map((v) => ({
        id: v,
        name: v[0]!.toUpperCase() + v.slice(1),
      })),
    )}<p class="muted">Published workshops appear in the catalog. Dates are published separately.</p>${w.id ? `<a class="text-link" href="/workshops/${h(w.slug)}" target="_blank" rel="noopener">Preview published workshop ↗</a>` : ''}</div></div></div>${saveBar('Save workshop')}</form>`;
  const form = document.querySelector<HTMLFormElement>('#editor')!;
  onSave(form, async () => {
    const d: any = formValues(form);
    for (const k of ['age_min', 'age_max', 'duration', 'capacity']) d[k] = Number(d[k]);
    d.price = Math.round(Number(d.price) * 100);
    d.venue_id = d.venue_id || null;
    d.media_id = d.media_id || null;
    d.revision = w.revision;
    d.gallery_ids = new FormData(form).getAll('gallery_ids');
    await api(`workshops${w.id ? `/${w.id}` : ''}`, 'POST', d);
    notify('Workshop saved.');
    await renderWorkshops();
  });
}
async function renderWorkshops() {
  await lookups();
  workspace.innerHTML =
    heading(
      'Your workshops',
      'The ideas you can come back to, again and again.',
      button('+ Create workshop', 'new-workshop', '', ''),
    ) +
    (workshops.length
      ? `<div class="grid">${workshops.map((w) => `<article class="admin-card"><div class="admin-card-top">${status(w.status)}<h2>${h(w.name)}</h2><span class="muted">Ages ${w.age_min}–${w.age_max} · ${w.duration} minutes</span></div><div class="admin-card-body"><p>${h(w.summary || 'Add a short description to introduce this workshop.')}</p><p>${cash(w.price)} per child · ${w.capacity} places by default</p><div class="inline-actions">${button('Add date ↗', 'add-date', w.id, '')}${button('Edit', 'edit-workshop', w.id)}${button('Duplicate', 'copy-workshop', w.id)}</div></div></article>`).join('')}</div>`
      : empty(
          'Your next great idea starts here.',
          'Create a workshop once, then add new dates whenever you’re ready.',
          button('Create your first workshop', 'new-workshop', '', ''),
        ));
}
function sessionEditor(original?: any, workshopId?: string, duplicate = false) {
  const w = workshops.find((w) => w.id === (workshopId ?? original?.workshop_id)) ?? workshops[0];
  if (!w) {
    notify('Create a workshop before adding a date.', true);
    return;
  }
  const s = original
    ? { ...original }
    : {
        workshop_id: w.id,
        capacity: w.capacity,
        price: w.price,
        venue_id: w.venue_id ?? '',
        instructor_id: null,
        status: 'draft',
        timezone: content.timezone || '',
        starts_at: 0,
        ends_at: 0,
      };
  if (duplicate) {
    s.id = null;
    s.starts_at = 0;
    s.ends_at = 0;
    s.status = 'draft';
  }
  workspace.innerHTML =
    heading(
      s.id ? 'Edit class date' : 'Add a class date',
      'Start with an existing workshop. Adjust only what changes.',
      button('Back to class dates', 'back'),
    ) +
    `<form id="editor"><div class="form-columns"><div class="panel"><h2>When & where</h2>${select(
      'Workshop',
      'workshop_id',
      s.workshop_id,
      workshops.filter((w) => w.status !== 'archived').map((w) => ({ id: w.id, name: w.name })),
    )}${field('Start date & time', 'starts', s.starts_at ? wallClock(s.starts_at, s.timezone) : '', 'datetime-local', 'Times use the business timezone below.', 'required')}${field('End time', 'ends', s.ends_at ? wallClock(s.ends_at, s.timezone).slice(11) : '', 'time', '', 'required')}${!s.id ? field('More dates (optional)', 'extra_dates', '', 'textarea', 'Repeat this time on other dates. Enter one date per line, such as 2026-11-07.') : ''}${select(
      'Business timezone',
      'timezone',
      s.timezone,
      [
        { id: '', name: 'Choose after confirming your Florida city' },
        { id: 'America/New_York', name: 'Eastern Time — America/New_York' },
        { id: 'America/Chicago', name: 'Central Time — America/Chicago' },
      ],
      'required',
    )}${select('Venue', 'venue_id', s.venue_id, [{ id: '', name: 'Choose a venue' }, ...venues.filter((v) => !v.archived || v.id === s.venue_id).map((v) => ({ id: v.id, name: `${v.name}${v.verified ? '' : ' — needs verification'}` }))], 'required')}</div><div><div class="panel"><h2>Places & price</h2>${field('Places in this class', 'capacity', s.capacity, 'number', '', 'required min="1" max="100"')}${field('Price per child ($)', 'price', s.price / 100, 'number', '', 'required min="1" max="1000" step="0.01"')}${select('Instructor (optional)', 'instructor_id', s.instructor_id, [{ id: '', name: 'Not assigned yet' }, ...instructors])}</div><div class="panel"><h2>Ready for families?</h2>${select(
      'Class status',
      'status',
      s.status,
      ['draft', 'published', 'closed', 'cancelled', 'archived'].map((v) => ({
        id: v,
        name: v[0]!.toUpperCase() + v.slice(1),
      })),
    )}<p class="muted">Publishing needs an approved timezone, policies, workshop, and venue. Past dates cannot be booked. Cancelling needs follow-up with registered families; it does not automatically refund payments.</p></div></div></div>${saveBar('Save class date')}</form>`;
  const form = document.querySelector<HTMLFormElement>('#editor')!;
  form.querySelector('[name=workshop_id]')?.addEventListener('change', () => {
    if (s.id) return;
    const selected = workshops.find(
      (w) => w.id === (form.elements.namedItem('workshop_id') as HTMLSelectElement).value,
    );
    for (const [name, value] of [
      ['capacity', selected.capacity],
      ['price', selected.price / 100],
      ['venue_id', selected.venue_id ?? ''],
    ])
      (form.elements.namedItem(String(name)) as HTMLInputElement).value = String(value);
  });
  if (!s.id) {
    const start = form.elements.namedItem('starts') as HTMLInputElement;
    const end = form.elements.namedItem('ends') as HTMLInputElement;
    start.addEventListener('change', () => {
      if (!start.value || end.value) return;
      const selected = workshops.find(
        (w) => w.id === (form.elements.namedItem('workshop_id') as HTMLSelectElement).value,
      );
      const value = new Date(`${start.value}:00Z`).getTime() + (selected?.duration ?? 60) * 60000;
      end.value = new Date(value).toISOString().slice(11, 16);
    });
  }
  onSave(form, async () => {
    const d: any = formValues(form),
      dates = [
        String(d.starts).slice(0, 10),
        ...String(d.extra_dates ?? '')
          .split(/\s+/)
          .filter(Boolean),
      ];
    if (new Set(dates).size !== dates.length) throw new Error('Please remove duplicate dates.');
    if (dates.length > 20) throw new Error('Add up to 20 dates at once.');
    const records = dates.map((day) => ({
      workshop_id: d.workshop_id,
      starts_at: zonedDateTime(`${day}T${String(d.starts).slice(11)}`, d.timezone),
      ends_at: zonedDateTime(`${day}T${d.ends}`, d.timezone),
      timezone: d.timezone,
      venue_id: d.venue_id,
      capacity: Number(d.capacity),
      price: Math.round(Number(d.price) * 100),
      instructor_id: d.instructor_id || null,
      status: d.status,
      revision: s.revision,
    }));
    if (
      ['cancelled', 'archived'].includes(d.status) &&
      !confirm(
        'Save this status? Existing registrations remain in the records. Contact affected families and review their payments.',
      )
    )
      return;
    if (s.id) await api(`sessions/${s.id}`, 'POST', records[0]);
    else await api('sessions/batch', 'POST', { sessions: records });
    notify(`${records.length} class date${records.length === 1 ? '' : 's'} saved.`);
    await renderSessions();
  });
}
async function renderSessions() {
  if (role === 'instructor') {
    sessions = await api('sessions');
  } else await lookups();
  workspace.innerHTML =
    heading(
      role === 'instructor' ? 'Your class dates' : 'Class dates',
      'Everything coming up, with the past safely kept in your records.',
      role !== 'instructor' ? button('+ Add a date', 'new-session', '', '') : '',
    ) +
    (sessions.length
      ? `<div class="panel overflow"><table class="table"><thead><tr><th>Workshop & date</th><th>Status</th><th>Places</th><th>Actions</th></tr></thead><tbody>${sessions.map((s) => `<tr><td><strong>${h(s.workshop_name)}</strong><br/>${h(date(s.starts_at, s.timezone))}<br/><small>${h(s.venue_name)}</small></td><td>${s.starts_at < Date.now() / 1000 && s.status === 'published' ? status('completed') : status(s.status)}</td><td>${s.occupied} / ${s.capacity}<div class="progress"><span style="width:${Math.min(100, (s.occupied / s.capacity) * 100)}%"></span></div></td><td><div class="inline-actions">${button('Attendance', 'roster', s.id)}${role !== 'instructor' ? button('Edit', 'edit-session', s.id) + button('Duplicate', 'copy-session', s.id) : ''}</div></td></tr>`).join('')}</tbody></table></div>`
      : empty(
          'A fresh page in the calendar.',
          'Add a date to an existing workshop. Past dates stay here as history.',
          role !== 'instructor' ? button('Add a class date', 'new-session', '', '') : '',
        ));
}
async function roster(id: string) {
  const rows = await api(`sessions/${id}/roster`);
  workspace.innerHTML =
    heading(
      'Attendance',
      'Confirmed participants for this class date.',
      button('Back to class dates', 'back'),
    ) +
    (rows.length
      ? `<div class="panel overflow"><table class="table"><thead><tr><th>Child</th><th>Age</th>${role !== 'instructor' ? '<th>Guardian contact</th>' : ''}<th>Check-in</th></tr></thead><tbody>${rows.map((p: any) => `<tr><td>${h(p.first_name ?? 'Removed for privacy')}</td><td>${h(p.age ?? '—')}</td>${role !== 'instructor' ? `<td>${h(p.guardian_name)}<br/>${h(p.guardian_email)}<br/>${h(p.guardian_phone)}</td>` : ''}<td><label class="check"><input type="checkbox" data-attendance="${h(p.id)}" ${p.attended ? 'checked' : ''}/>Attended</label></td></tr>`).join('')}</tbody></table></div>`
      : empty(
          'No confirmed participants yet.',
          'Only registrations with verified payments appear on the attendance list.',
        ));
  workspace.querySelectorAll<HTMLInputElement>('[data-attendance]').forEach((box) =>
    box.addEventListener('change', async () => {
      box.disabled = true;
      try {
        await api(`participants/${box.dataset.attendance}/attendance`, 'POST', {
          attended: box.checked,
        });
        notify('Attendance saved.');
      } catch (e) {
        box.checked = !box.checked;
        notify((e as Error).message, true);
      } finally {
        box.disabled = false;
      }
    }),
  );
}
async function renderDashboard() {
  const from = new Date();
  from.setUTCDate(1);
  const to = new Date();
  workspace.innerHTML =
    heading(
      'A little overview.',
      'Your workshops, your families, your next adventure.',
      `<a class="btn small" href="/admin/workshops">Manage workshops ↗</a>`,
    ) +
    `<form id="range" class="toolbar">${field('From', 'from', from.toISOString().slice(0, 10), 'date')}${field('Through', 'to', to.toISOString().slice(0, 10), 'date')}<button class="btn small" type="submit">Update overview</button></form><div id="dashboard-data" class="loading">Loading your records…</div>`;
  const form = document.querySelector<HTMLFormElement>('#range')!;
  const load = async () => {
    const v = formValues(form);
    const d = await api(
      `dashboard?from=${Date.parse(`${v.from}T00:00:00Z`) / 1000}&to=${Date.parse(`${v.to}T00:00:00Z`) / 1000 + 86400}`,
    );
    const confirmed = d.registrations.find((r: any) => r.status === 'confirmed');
    document.querySelector('#dashboard-data')!.innerHTML =
      `<p class="muted">Payment and registration activity in the chosen date range (UTC calendar dates).</p><div class="stats"><div class="stat"><small>GROSS VERIFIED SALES</small><span class="value money">${cash(d.financial.gross)}</span><small>${d.financial.payments} verified payment${d.financial.payments === 1 ? '' : 's'} · Before refunds and fees</small></div><div class="stat"><small>REFUNDS VERIFIED</small><span class="value money">${cash(d.financial.refunds)}</span><small>Refunds on payments made in this period</small></div><div class="stat"><small>CONFIRMED CHILDREN</small><span class="value">${confirmed?.children ?? 0}</span><small>${confirmed?.orders ?? 0} confirmed registrations created in this period</small></div></div><div class="panel"><h2>Your next class dates</h2>${d.upcoming.length ? d.upcoming.map((s: any) => `<div class="session-row"><div><strong>${h(s.name)}</strong><p>${h(date(s.starts_at, s.timezone))}</p></div><span>${s.confirmed} confirmed · ${s.capacity - s.confirmed} remaining before holds</span><a class="text-link" href="/admin/sessions">Open dates ↗</a></div>`).join('') : '<p class="muted">No upcoming class dates. Start with Workshops → Add date.</p>'}</div><div class="panel"><h2>Needs a little attention</h2>${d.attention.length ? `<ul class="attention-list">${d.attention.map((r: any) => `<li>${h(r.workshop_name)} · ${status(r.status)} · <a href="/admin/registrations">Review registration</a></li>`).join('')}</ul>` : '<p class="muted">No registrations flagged for payment follow-up.</p>'}</div><div class="panel"><h2>Workshop popularity</h2>${d.popular.length ? d.popular.map((p: any) => `<p>${h(p.workshop_name)} — ${p.children} confirmed children</p>`).join('') : '<p class="muted">Confirmed registrations will build this picture over time.</p>'}</div>${role === 'owner' ? `<div class="panel"><h2>Privacy review</h2><p>${d.privacy?.count ?? 0} historical registrations are due for a personal-data review. Open Registrations to remove personal details when appropriate.</p></div>` : ''}<div class="panel"><h2>Registration states</h2>${d.registrations.length ? d.registrations.map((r: any) => `<p>${status(r.status)} ${r.orders} registrations · ${r.children} children</p>`).join('') : '<p class="muted">No registrations in this date range.</p>'}</div>`;
  };
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    load().catch((e) => notify(e.message, true));
  });
  await load();
}
async function renderContent() {
  [content, media] = await Promise.all([api('content'), api('media')]);
  const owner = role === 'owner';
  workspace.innerHTML =
    heading(
      'Make it yours.',
      'Edit the words and images. The design takes care of itself.',
      `<a class="btn small light" href="/" target="_blank" rel="noopener">View website ↗</a>`,
    ) +
    `<form id="editor"><div class="form-columns"><div><div class="panel"><h2>Your homepage</h2>${field('Main headline', 'headline', content.headline, 'textarea', '', 'required maxlength="140"')}${field('Welcome text', 'intro', content.intro, 'textarea')}${field('Promotional heading', 'promotion', content.promotion)}${select('Homepage image', 'heroMediaId', content.heroMediaId, [{ id: '', name: 'Original Adventure Station artwork' }, ...media.map((m) => ({ id: m.id, name: m.alt }))])}${select(
      'Accent color',
      'accent',
      content.accent,
      [
        { id: 'coral', name: 'Warm coral' },
        { id: 'blue', name: 'Creative blue' },
        { id: 'green', name: 'Garden green' },
      ],
    )}</div><div class="panel"><h2>Our story</h2>${field('Business description', 'about', content.about, 'textarea')}</div><div class="panel"><h2>Frequently asked questions</h2><div id="faq-fields"></div>${button('+ Add a question', 'add-faq')}</div></div><div><div class="panel"><h2>Say hello</h2>${field('Contact email', 'email', content.email, 'email', '', 'required')}${field('Contact phone (optional)', 'phone', content.phone)}${field('Florida city / locality', 'locality', content.locality, 'text', 'Confirm the actual business location.', owner ? '' : 'disabled')}${select(
      'Business timezone',
      'timezone',
      content.timezone,
      [
        { id: '', name: 'Awaiting location confirmation' },
        { id: 'America/New_York', name: 'Eastern Time' },
        { id: 'America/Chicago', name: 'Central Time' },
      ],
      owner ? '' : 'disabled',
    )}</div><div class="panel"><h2>Workshop & privacy policies</h2>${owner ? button('Load recommended policy drafts', 'load-policy-drafts') : ''}<p class="muted">Recommended drafts use parent-present workshops. Confirm operating arrangements and complete every [OWNER: ...] item before approval. Draft text stays private until approved.</p><p class="muted">Only publish policies the owner has confirmed. These are also saved with each registration.</p>${field('Cancellations & refunds', 'refundPolicy', content.refundPolicy, 'textarea', '', owner ? '' : 'disabled')}${field('Guardian supervision', 'supervisionPolicy', content.supervisionPolicy, 'textarea', '', owner ? '' : 'disabled')}${field('Drop-off & pickup', 'pickupPolicy', content.pickupPolicy, 'textarea', '', owner ? '' : 'disabled')}${field('Privacy & registration information', 'privacyPolicy', content.privacyPolicy, 'textarea', '', owner ? '' : 'disabled')}${check('I confirm these policies, the location and timezone are accurate and approved for families.', 'policiesApproved', content.policiesApproved, !owner)}${field('Privacy review after this many days', 'retentionDays', content.retentionDays, 'number', 'Review historical personal details for removal after this period. Financial facts are retained.', owner ? 'min="30" max="730"' : 'disabled')}</div></div></div>${saveBar('Publish website changes')}</form><div class="panel"><h2>Earlier versions</h2><p>Restore earlier text into the form, review it, then publish to apply it.</p><div id="history-list"></div></div>`;
  const faqs: any[] = content.faqs.map((v: any) => ({ ...v }));
  function renderFaqs() {
    document.querySelector('#faq-fields')!.innerHTML = faqs
      .map(
        (f, i) =>
          `<fieldset><legend>Question ${i + 1}</legend>${field('Question', `faq-q-${i}`, f.question)}${field('Answer', `faq-a-${i}`, f.answer, 'textarea')}${button('Remove question', 'remove-faq', String(i))}</fieldset>`,
      )
      .join('');
  }
  function captureFaqs() {
    faqs.forEach((f, i) => {
      f.question = (document.querySelector(`[name=faq-q-${i}]`) as HTMLInputElement)?.value ?? '';
      f.answer = (document.querySelector(`[name=faq-a-${i}]`) as HTMLInputElement)?.value ?? '';
    });
  }
  renderFaqs();
  workspace.querySelector('[data-action=add-faq]')?.addEventListener('click', () => {
    captureFaqs();
    faqs.push({ question: '', answer: '' });
    renderFaqs();
  });
  document.querySelector('#faq-fields')!.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-action=remove-faq]');
    if (b) {
      captureFaqs();
      faqs.splice(Number(b.dataset.id), 1);
      renderFaqs();
    }
  });
  const form = document.querySelector<HTMLFormElement>('#editor')!;
  onSave(form, async () => {
    captureFaqs();
    const v: any = {
      ...content,
      ...formValues(form),
      faqs,
      heroMediaId: (form.elements.namedItem('heroMediaId') as HTMLSelectElement).value || null,
    };
    if (owner) {
      v.policiesApproved = (
        form.elements.namedItem('policiesApproved') as HTMLInputElement
      ).checked;
      v.retentionDays = Number(v.retentionDays);
    }
    await api('content', 'POST', v);
    notify('Website changes published.');
    await renderContent();
  });
  const history = await api('content/history');
  document.querySelector('#history-list')!.innerHTML = history.length
    ? history
        .map(
          (r: any) =>
            `<p>${h(new Date(r.created_at * 1000).toLocaleString())} ${button('Restore into form', 'restore-content', r.id)}</p>`,
        )
        .join('')
    : '<p class="muted">Your previous version will be kept each time you publish.</p>';
  document.querySelector('#history-list')!.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-action=restore-content]');
    if (!b) return;
    const old = JSON.parse(history.find((r: any) => r.id === b.dataset.id).value);
    for (const [key, value] of Object.entries(old)) {
      const input = form.elements.namedItem(key) as HTMLInputElement | null;
      if (!input || input.disabled) continue;
      if (input.type === 'checkbox') input.checked = Boolean(value);
      else input.value = String(value ?? '');
    }
    faqs.splice(0, faqs.length, ...old.faqs);
    renderFaqs();
    notify('Earlier version loaded. Review the form, then publish to apply it.');
  });
}
async function renderVenues() {
  venues = await api('venues');
  workspace.innerHTML =
    heading(
      'Places to create.',
      'Verify the address before publishing a class date.',
      button('+ Add venue', 'new-venue', '', ''),
    ) +
    (venues.length
      ? `<div class="grid">${venues.map((v) => `<article class="panel"><h2>${h(v.name)}</h2>${status(v.archived ? 'archived' : v.verified ? 'verified' : 'needs verification')}<p>${h(v.address)}</p><p>${h(v.instructions)}</p>${button('Edit venue', 'edit-venue', v.id)}</article>`).join('')}</div>`
      : empty(
          'A place for the next adventure.',
          'Add and verify a venue before you publish dates.',
        ));
}
function venueEditor(
  v: any = { name: '', address: '', instructions: '', verified: 0, archived: 0 },
) {
  workspace.innerHTML =
    heading(
      v.id ? 'Edit venue' : 'Add a venue',
      'Use verified business information.',
      button('Back', 'back'),
    ) +
    `<form id="editor" class="panel">${field('Venue name', 'name', v.name, 'text', '', 'required')}${field('Full address', 'address', v.address, 'textarea')}${field('Arrival instructions', 'instructions', v.instructions, 'textarea')}${check('I have verified this address and the venue details.', 'verified', !!v.verified)}${check('Archive this venue (keep it in history).', 'archived', !!v.archived)}${saveBar('Save venue')}</form>`;
  const form = document.querySelector<HTMLFormElement>('#editor')!;
  onSave(form, async () => {
    const d: any = formValues(form);
    d.verified = (form.elements.namedItem('verified') as HTMLInputElement).checked;
    d.archived = (form.elements.namedItem('archived') as HTMLInputElement).checked;
    await api(`venues${v.id ? `/${v.id}` : ''}`, 'POST', d);
    notify('Venue saved.');
    await renderVenues();
  });
}
async function renderRegistrations() {
  const rows = await api('registrations');
  workspace.innerHTML =
    heading(
      'Every little adventurer.',
      'Payment and registration states are shown separately.',
      button('Check payment updates', 'reconcile'),
    ) +
    `<div class="panel"><div class="field"><label for="registration-search">Find a registration</label><input id="registration-search" type="search" placeholder="Guardian, workshop, or reference"/></div><div class="overflow"><table class="table"><thead><tr><th>Workshop / guardian</th><th>Places</th><th>Registration</th><th>Verified payment</th><th>Actions</th></tr></thead><tbody>${rows.map((r: any) => `<tr data-search="${h(`${r.guardian_name} ${r.guardian_email} ${r.workshop_name} ${r.id}`.toLowerCase())}"><td><strong>${h(r.workshop_name)}</strong><br/>${h(r.guardian_name ?? 'Personal details removed')}<br/><small>${h(r.guardian_email)}<br/>${h(r.id)}</small></td><td>${r.seats}</td><td>${status(r.status)}${r.needs_attention ? '<br/><small>Follow-up needed</small>' : ''}</td><td>${cash(r.paid)} received<br/>${(r.payment_issues ?? []).map((i: any) => `<strong>Needs review: ${h(i.amount / 100)} ${h(i.currency)}</strong><br/>`).join('')}${cash(r.refunded)} refunded<br/><small>Order total ${cash(r.total)}</small></td><td><div class="inline-actions">${r.status === 'payment_review' && r.paid - r.refunded >= r.total ? button('Confirm available places', 'confirm-review', r.id) : ''}${r.needs_attention && !['pending', 'payment_review'].includes(r.status) ? button('Follow-up complete', 'complete-review', r.id) : ''}</div>${role === 'owner' ? `<div class="inline-actions">${r.paid > r.refunded || (r.payment_issues ?? []).some((i: any) => i.refunded < i.amount) ? button('Sandbox refund', 'refund', r.id) : ''}${r.ends_at < Date.now() / 1000 && !r.anonymized_at ? button('Remove personal details', 'anonymize', r.id) : ''}</div>` : ''}</td></tr>`).join('')}</tbody></table></div>${!rows.length ? '<p class="muted">Registrations will appear here when a family starts checkout.</p>' : ''}</div>`;
  workspace
    .querySelector<HTMLInputElement>('#registration-search')!
    .addEventListener('input', (event) => {
      const query = (event.target as HTMLInputElement).value.toLowerCase();
      workspace
        .querySelectorAll<HTMLElement>('tr[data-search]')
        .forEach((row) => (row.hidden = !row.dataset.search!.includes(query)));
    });
}
async function optimized(file: File, width: number) {
  const image = await createImageBitmap(file);
  try {
    const scale = Math.min(1, width / image.width, 4096 / image.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Could not prepare this image.'))),
        'image/jpeg',
        0.84,
      ),
    );
  } finally {
    image.close();
  }
}
async function renderMedia() {
  media = await api('media');
  workspace.innerHTML =
    heading('Your creative library.', 'Images here can be used on the website and in workshops.') +
    `<form id="upload" class="panel"><h2>Add an image</h2><p class="muted">Upload a JPEG, PNG or WebP. Images are optimized and metadata is removed before publication. Use only images you have permission to publish; this is a public website image library.</p>${field('Choose image', 'image', '', 'file', '', 'accept="image/jpeg,image/png,image/webp" required')}${field('Describe the image', 'alt', '', 'text', 'Used for accessibility and to help you find it later.', 'required maxlength="300"')}${check('I have permission to publish this image, including any required photo permissions.', 'rights', false)}<button class="btn" type="submit">Upload image ↗</button></form><div class="media-grid">${media.map((m) => `<article class="media-item"><img src="/media/${h(m.id)}?w=480" width="480" height="480" alt="${h(m.alt)}"/><p>${h(m.alt)}</p><small>${m.width} × ${m.height} · ${Math.ceil(m.bytes / 1024)} KB (all sizes)</small><div class="inline-actions">${button('Edit description', 'alt-media', m.id)}${button('Remove unused image', 'delete-media', m.id)}</div></article>`).join('')}</div>`;
  const form = document.querySelector<HTMLFormElement>('#upload')!;
  onSave(form, async () => {
    const data = new FormData(form),
      file = data.get('image') as File;
    if (!file || file.size > 20000000) throw new Error('Choose an image up to 20 MB.');
    const payload = new FormData();
    payload.set('alt', String(data.get('alt')));
    payload.set('rights', String(data.get('rights') === 'on'));
    for (const w of [1600, 960, 480]) payload.set(String(w), await optimized(file, w), `${w}.jpg`);
    await api('media', 'POST', payload);
    notify('Image uploaded. Choose it from a workshop or the website content page.');
    await renderMedia();
  });
}
async function renderTeam() {
  const team = await api('team');
  workspace.innerHTML =
    heading(
      'Your creative team.',
      'Give each person only the access they need.',
      button('+ Add team member', 'new-team', '', ''),
    ) +
    `<div class="panel overflow"><table class="table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Access</th><th></th></tr></thead><tbody>${team.map((s: any) => `<tr><td>${h(s.name)}</td><td>${h(s.email)}</td><td>${h(s.role)}</td><td>${status(s.active ? 'active' : 'disabled')}</td><td>${button('Edit access', 'edit-team', s.id)}</td></tr>`).join('')}</tbody></table></div>`;
  workspace
    .querySelectorAll('[data-action=edit-team]')
    .forEach((b) =>
      b.addEventListener('click', () =>
        teamEditor(team.find((s: any) => s.id === (b as HTMLElement).dataset.id)),
      ),
    );
}
function teamEditor(s: any = { name: '', email: '', role: 'instructor', active: 1 }) {
  workspace.innerHTML =
    heading(
      'Team access',
      'Staff sign in using the email allowed here. No separate password to manage.',
      button('Back', 'back'),
    ) +
    `<form id="editor" class="panel">${field('Name', 'name', s.name, 'text', '', 'required')}${field('Sign-in email', 'email', s.email, 'email', '', 'required')}${select(
      'Role',
      'role',
      s.role,
      [
        { id: 'instructor', name: 'Instructor — assigned attendance only' },
        { id: 'manager', name: 'Manager — workshops, content and registrations' },
        { id: 'owner', name: 'Owner — full access including team and payments' },
      ],
    )}${check('Allow this person to sign in.', 'active', !!s.active)}${saveBar('Save team access')}</form>`;
  const form = document.querySelector<HTMLFormElement>('#editor')!;
  onSave(form, async () => {
    const d = formValues(form);
    await api('team', 'POST', {
      ...d,
      id: s.id,
      subject: s.subject ?? null,
      active: (form.elements.namedItem('active') as HTMLInputElement).checked,
    });
    notify('Team access saved. Cloudflare Access must also allow this person to sign in.');
    await renderTeam();
  });
}
async function render() {
  if (role === 'instructor') {
    await renderSessions();
    return;
  }
  switch (section) {
    case 'dashboard':
      await renderDashboard();
      break;
    case 'workshops':
      await renderWorkshops();
      break;
    case 'sessions':
      await renderSessions();
      break;
    case 'content':
      await renderContent();
      break;
    case 'venues':
      await renderVenues();
      break;
    case 'registrations':
      await renderRegistrations();
      break;
    case 'media':
      await renderMedia();
      break;
    case 'team':
      await renderTeam();
      break;
    default:
      workspace.innerHTML = empty(
        'Let’s get you back to your desk.',
        'Choose a page from the menu.',
      );
  }
}
workspace.addEventListener('click', async (event) => {
  const b = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
  if (!b) return;
  const key = b.dataset.id ?? '',
    action = b.dataset.action;
  try {
    switch (action) {
      case 'load-policy-drafts':
        if (
          confirm(
            'Replace the saved policy text with recommended drafts? Earlier saved text stays in history. Unsaved form changes will be discarded. Registration will remain closed until the owner completes and approves the policies.',
          )
        ) {
          await api('content/policy-drafts', 'POST', { revision: content.revision });
          await renderContent();
          notify(
            'Recommended policy drafts loaded. Complete the owner items and review before approval.',
          );
        }
        break;
      case 'back':
        await render();
        break;
      case 'new-workshop':
        workshopEditor();
        break;
      case 'edit-workshop':
        workshopEditor(workshops.find((w) => w.id === key));
        break;
      case 'copy-workshop':
        workshopEditor(
          workshops.find((w) => w.id === key),
          true,
        );
        break;
      case 'add-date':
        sessionEditor(undefined, key);
        break;
      case 'new-session':
        sessionEditor();
        break;
      case 'edit-session':
        sessionEditor(sessions.find((s) => s.id === key));
        break;
      case 'copy-session':
        sessionEditor(
          sessions.find((s) => s.id === key),
          undefined,
          true,
        );
        break;
      case 'roster':
        await roster(key);
        break;
      case 'new-venue':
        venueEditor();
        break;
      case 'edit-venue':
        venueEditor(venues.find((v) => v.id === key));
        break;
      case 'reconcile':
        b.disabled = true;
        await api('reconcile', 'POST', {});
        notify('Payment updates checked. Review any registrations needing follow-up.');
        await renderRegistrations();
        break;
      case 'confirm-review':
        if (
          confirm(
            'Confirm these paid places? Contact the guardian to explain the outcome. Availability is checked again when saving.',
          )
        ) {
          await api(`registrations/${key}/review`, 'POST', { action: 'confirm' });
          notify('Places confirmed. Please inform the guardian.');
          await renderRegistrations();
        }
        break;
      case 'complete-review':
        await api(`registrations/${key}/review`, 'POST', { action: 'complete' });
        notify('Follow-up marked complete.');
        await renderRegistrations();
        break;
      case 'refund':
        if (
          confirm('Request a sandbox refund for this registration? No live refund will be issued.')
        ) {
          await api(`registrations/${key}/refund`, 'POST', {});
          notify('Sandbox refund requested. Check payment updates to verify completion.');
          await renderRegistrations();
        }
        break;
      case 'anonymize':
        if (
          confirm(
            'Permanently remove guardian and child personal details from this historical registration? Financial records will remain.',
          )
        ) {
          await api(`registrations/${key}/anonymize`, 'POST', {});
          notify('Personal details removed. Financial history preserved.');
          await renderRegistrations();
        }
        break;
      case 'delete-media':
        if (
          confirm(
            'Remove this unused image? Images referenced by workshops or saved page versions are protected.',
          )
        ) {
          await api(`media/${key}`, 'DELETE');
          notify('Unused image removed.');
          await renderMedia();
        }
        break;
      case 'alt-media': {
        const current = media.find((m) => m.id === key),
          alt = prompt('Describe this image for accessibility:', current.alt);
        if (alt) {
          await api(`media/${key}`, 'POST', { alt });
          notify('Image description saved.');
          await renderMedia();
        }
        break;
      }
      case 'new-team':
        teamEditor();
        break;
    }
  } catch (e) {
    notify(e instanceof Error ? e.message : 'Please try again.', true);
  } finally {
    b.disabled = false;
  }
});
render().catch((e) => {
  workspace.innerHTML = empty(
    'Your workspace could not load.',
    e.message,
    button('Try again', 'back'),
  );
  notify(e.message, true);
});
