import { installRecordLayouts } from './admin-records';
import { createUI, localeOf, t as translate, errorMessage } from '../lib/i18n';
import { renderExtra, companionSummary } from './admin-features';
const locale = localeOf(document.documentElement.lang),
  { ui, markup: u } = createUI(locale),
  t = (v: string) => translate(v, locale);
import { zonedDateTime, wallClock } from '../lib/time';
const main = document.querySelector<HTMLElement>('#admin-main')!,
  workspace = document.querySelector<HTMLElement>('#workspace')!,
  message = document.querySelector<HTMLElement>('#admin-message')!;
installRecordLayouts(workspace);
if (locale === 'es-MX') {
  document.addEventListener(
    'invalid',
    (event) => {
      const input = event.target as HTMLInputElement;
      input.setCustomValidity(t('Please review this field.'));
    },
    true,
  );
  document.addEventListener('input', (event) =>
    (event.target as HTMLInputElement).setCustomValidity?.(''),
  );
  document.addEventListener('change', (event) =>
    (event.target as HTMLInputElement).setCustomValidity?.(''),
  );
}
const section = main.dataset.section!,
  role = main.dataset.role!;
const h = (v: unknown) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
const cash = (v: number) =>
  new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format((v ?? 0) / 100);
const date = (v: number, tz: string) =>
  new Intl.DateTimeFormat(locale, {
    timeZone: tz,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(v * 1000);
const status = (v: string) =>
  ui`<span class="status ${h(v)}">${h(t(v.replaceAll('_', ' ')))}</span>`;
const button = (label: string, action: string, id = '', style = 'light') =>
  ui`<button type="button" class="btn small ${style}" data-action="${h(action)}" data-id="${h(id)}">${h(t(label))}</button>`;
function notify(text: string, error = false) {
  message.textContent = error ? errorMessage(text, locale) : t(text);
  message.className = ui`notice${error ? ' error' : ''}`;
  message.scrollIntoView({ block: 'nearest' });
}
async function api(path: string, method = 'GET', data?: unknown) {
  const response = await fetch(ui`/api/admin/${path}`, {
    method,
    headers: data instanceof FormData ? {} : { 'Content-Type': 'application/json' },
    body: data === undefined ? undefined : data instanceof FormData ? data : JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? 'Please try again.');
  return result;
}
const heading = (title: string, subtitle: string, actions = '') =>
  ui`<header class="admin-heading"><div><h1>${h(t(title))}</h1><p>${h(t(subtitle))}</p></div><div class="inline-actions">${actions}</div></header>`;
function field(
  label: string,
  name: string,
  value: unknown = '',
  type = 'text',
  help = '',
  attrs = '',
) {
  return ui`<div class="field"><label for="${h(name)}">${h(t(label))}</label>${type === 'textarea' ? ui`<textarea id="${h(name)}" name="${h(name)}" ${attrs}>${h(value)}</textarea>` : ui`<input id="${h(name)}" name="${h(name)}" type="${h(type)}" value="${h(value)}" ${attrs}/>`}${help ? ui`<small>${h(t(help))}</small>` : ''}</div>`;
}
function select(
  label: string,
  name: string,
  value: unknown,
  options: { id: unknown; name: unknown }[],
  attrs = '',
) {
  return ui`<div class="field"><label for="${h(name)}">${h(t(label))}</label><select id="${h(name)}" name="${h(name)}" ${attrs}>${options.map((o) => ui`<option value="${h(o.id)}" ${String(o.id ?? '') === String(value ?? '') ? 'selected' : ''}>${h(o.name)}</option>`).join('')}</select></div>`;
}
const check = (label: string, name: string, value: boolean, disabled = false) =>
  ui`<label class="check"><input type="checkbox" name="${h(name)}" ${value ? 'checked' : ''} ${disabled ? 'disabled' : ''}/>${h(t(label))}</label>`;
const saveBar = (label = 'Save changes') =>
  ui`<div class="save-bar"><span class="muted">Your changes are saved when you choose “${h(t(label))}”.</span><button class="btn" type="submit">${h(t(label))} ↗</button></div>`;
const empty = (title: string, detail: string, action = '') =>
  ui`<div class="panel empty-admin"><h2>${h(t(title))}</h2><p>${h(t(detail))}</p>${action}</div>`;
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
    w.name = ui`${w.name} (copy)`;
    w.slug = ui`${w.slug}-copy-${crypto.randomUUID().slice(0, 6)}`;
    w.status = 'draft';
  }
  workspace.innerHTML =
    heading(
      w.id ? 'Edit workshop' : 'Create a workshop',
      'Describe it once. Add as many class dates as you need.',
      button('Back to workshops', 'back'),
    ) +
    ui`<div class="content-language"><span>Content language: English</span>${w.id ? ui`<button class="btn small light" type="button" data-action="translate-workshop" data-id="${h(w.id)}">Español</button>` : ui`<small>${t('Save the English source before adding Spanish content.')}</small>`}</div><form id="editor"><div class="form-columns"><div class="panel"><h2>The creative idea</h2>${field('Workshop name', 'name', w.name, 'text', '', 'required maxlength="120"')}${field('Page address', 'slug', w.slug, 'text', 'Use lowercase words separated by hyphens.', 'required pattern="[a-z0-9]+(-[a-z0-9]+)*"')}${field('Short description', 'summary', w.summary, 'textarea', 'A sentence or two for the workshop card.', 'maxlength="240"')}${field('Full description', 'description', w.description, 'textarea', '', 'maxlength="8000"')}${field('Category', 'category', w.category)}${select('Workshop image', 'media_id', w.media_id, [{ id: '', name: t('Original Adventure Station artwork') }, ...media.map((m) => ({ id: m.id, name: m.alt }))])}${media.length ? ui`<fieldset><legend>Workshop gallery (up to 12 images)</legend>${media.map((m) => check(m.alt, 'gallery_ids', (w.gallery_ids ?? []).includes(m.id)).replace('name="gallery_ids"', ui`name="gallery_ids" value="${h(m.id)}"`)).join('')}</fieldset>` : ''}${field('Included materials', 'materials', w.materials, 'textarea')}${field('Instructions for families', 'instructions', w.instructions, 'textarea')}</div><div><div class="panel"><h2>Defaults for new dates</h2><p class="muted">Change these here to save time later. Existing class dates and registrations keep their details.</p><div class="form-grid">${field('Youngest age', 'age_min', w.age_min, 'number', '', 'required min="1" max="17"')}${field('Oldest age', 'age_max', w.age_max, 'number', '', 'required min="1" max="17"')}${field('Duration (minutes)', 'duration', w.duration, 'number', '', 'required min="15" max="480"')}${field('Places per class', 'capacity', w.capacity, 'number', '', 'required min="1" max="100"')}</div>${field('Price per child ($)', 'price', w.price / 100, 'number', '', 'required min="1" max="1000" step="0.01"')}${select('Usual venue', 'venue_id', w.venue_id, [{ id: '', name: t('Choose when scheduling') }, ...venues.map((v) => ({ id: v.id, name: v.name }))])}</div><div class="panel"><h2>Visibility</h2>${select(
      'Workshop status',
      'status',
      w.status,
      ['draft', 'published', 'archived'].map((v) => ({
        id: v,
        name: v[0]!.toUpperCase() + v.slice(1),
      })),
    )}<p class="muted">Published workshops appear in the catalog. Dates are published separately.</p>${w.id ? ui`<a class="text-link" href="/workshops/${h(w.slug)}" target="_blank" rel="noopener">Preview published workshop ↗</a>` : ''}</div></div></div>${saveBar('Save workshop')}</form>`;
  const form = document.querySelector<HTMLFormElement>('#editor')!;
  onSave(form, async () => {
    const d: any = formValues(form);
    for (const k of ['age_min', 'age_max', 'duration', 'capacity']) d[k] = Number(d[k]);
    d.price = Math.round(Number(d.price) * 100);
    d.venue_id = d.venue_id || null;
    d.media_id = d.media_id || null;
    d.revision = w.revision;
    d.gallery_ids = new FormData(form).getAll('gallery_ids');
    await api(ui`workshops${w.id ? ui`/${w.id}` : ''}`, 'POST', d);
    notify('Workshop saved.');
    await renderWorkshops();
  });
}
async function renderWorkshops() {
  await lookups();
  const requestedEdit = new URLSearchParams(location.search).get('edit');
  if (requestedEdit && workshops.some((w) => w.id === requestedEdit)) {
    history.replaceState(null, '', location.pathname);
    workshopEditor(workshops.find((w) => w.id === requestedEdit));
    return;
  }
  workspace.innerHTML =
    heading(
      'Workshops',
      'The ideas you can come back to, again and again.',
      button('+ Create workshop', 'new-workshop', '', ''),
    ) +
    (workshops.length
      ? ui`<div class="grid">${workshops.map((w) => ui`<article class="admin-card"><div class="admin-card-top">${status(w.status)}<h2>${h(w.name)}</h2><span class="muted">Ages ${w.age_min}–${w.age_max} · ${w.duration} minutes</span></div><div class="admin-card-body"><p>${h(w.summary || 'Add a short description to introduce this workshop.')}</p><p>${cash(w.price)} per child · ${w.capacity} places by default</p><div class="inline-actions">${button('Add date ↗', 'add-date', w.id, '')}${button('Edit', 'edit-workshop', w.id)}${button('Duplicate', 'copy-workshop', w.id)}</div></div></article>`).join('')}</div>`
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
    ui`<div class="content-language"><span>Content language: English</span><button class="btn small light" type="button" data-action="translate-site">Español</button></div><form id="editor"><div class="form-columns"><div class="panel"><h2>When & where</h2>${select(
      'Workshop',
      'workshop_id',
      s.workshop_id,
      workshops.filter((w) => w.status !== 'archived').map((w) => ({ id: w.id, name: w.name })),
    )}${field('Start date & time', 'starts', s.starts_at ? wallClock(s.starts_at, s.timezone) : '', 'datetime-local', 'Times use the business timezone below.', 'required')}${field('End time', 'ends', s.ends_at ? wallClock(s.ends_at, s.timezone).slice(11) : '', 'time', '', 'required')}${!s.id ? field('More dates (optional)', 'extra_dates', '', 'textarea', 'Repeat this time on other dates. Enter one date per line, such as 2026-11-07.') : ''}${select(
      'Business timezone',
      'timezone',
      s.timezone,
      [
        { id: '', name: t('Choose after confirming your Florida city') },
        { id: 'America/New_York', name: t('Eastern Time — America/New_York') },
        { id: 'America/Chicago', name: t('Central Time — America/Chicago') },
      ],
      'required',
    )}${select('Venue', 'venue_id', s.venue_id, [{ id: '', name: t('Choose a venue') }, ...venues.filter((v) => !v.archived || v.id === s.venue_id).map((v) => ({ id: v.id, name: ui`${v.name}${v.verified ? '' : t(' — needs verification')}` }))], 'required')}</div><div><div class="panel"><h2>Places & price</h2>${field('Places in this class', 'capacity', s.capacity, 'number', '', 'required min="1" max="100"')}${field('Price per child ($)', 'price', s.price / 100, 'number', '', 'required min="1" max="1000" step="0.01"')}${select('Instructor (optional)', 'instructor_id', s.instructor_id, [{ id: '', name: t('Not assigned yet') }, ...instructors])}</div><div class="panel"><h2>Ready for families?</h2>${select(
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
      const value = new Date(ui`${start.value}:00Z`).getTime() + (selected?.duration ?? 60) * 60000;
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
      starts_at: zonedDateTime(ui`${day}T${String(d.starts).slice(11)}`, d.timezone),
      ends_at: zonedDateTime(ui`${day}T${d.ends}`, d.timezone),
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
    if (s.id) await api(ui`sessions/${s.id}`, 'POST', records[0]);
    else await api('sessions/batch', 'POST', { sessions: records });
    notify(ui`${records.length} class date${records.length === 1 ? '' : 's'} saved.`);
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
      ? ui`<div class="panel table-panel"><div class="record-view" data-record-view><table class="table data-table records-sessions" data-record-table="sessions" data-record-threshold="720"><caption class="visually-hidden">Class date records</caption><colgroup><col/><col/><col/><col/></colgroup><thead><tr><th scope="col">Workshop & date</th><th scope="col">Status</th><th scope="col">Places</th><th scope="col">Actions</th></tr></thead><tbody>${sessions.map((s) => ui`<tr data-record-id="${h(s.id)}"><th scope="row"><strong class="record-title">${h(s.workshop_name)}</strong><time class="record-meta" datetime="${new Date(s.starts_at * 1000).toISOString()}">${h(date(s.starts_at, s.timezone))}</time><span class="record-secondary">${h(s.venue_name)}</span></th><td>${s.starts_at < Date.now() / 1000 && s.status === 'published' ? status('completed') : status(s.status)}</td><td><span class="amount">${s.occupied} / ${s.capacity}</span><div class="progress" aria-hidden="true"><span style="width:${Math.min(100, (s.occupied / s.capacity) * 100)}%"></span></div></td><td data-actions><div class="inline-actions">${button('Attendance', 'roster', s.id)}${role !== 'instructor' ? button('Edit', 'edit-session', s.id) + button('Duplicate', 'copy-session', s.id) : ''}</div></td></tr>`).join('')}</tbody></table></div></div>`
      : empty(
          'A fresh page in the calendar.',
          'Add a date to an existing workshop. Past dates stay here as history.',
          role !== 'instructor' ? button('Add a class date', 'new-session', '', '') : '',
        ));
}
async function roster(id: string) {
  const rows = await api(ui`sessions/${id}/roster`);
  workspace.innerHTML =
    heading(
      'Attendance',
      'Confirmed participants for this class date.',
      button('Back to class dates', 'back'),
    ) +
    (rows.length
      ? ui`<div class="panel table-panel"><p class="table-scroll-hint" id="roster-scroll-help" data-scroll-hint>Scroll for more details. Names and check-in stay visible.</p><div class="table-scroll" data-scroll-table role="region" aria-label="Attendance table" aria-describedby="roster-scroll-help"><table class="table data-table roster-table ${role === 'instructor' ? 'instructor-roster' : ''}"><caption class="visually-hidden">Confirmed participant attendance</caption><colgroup><col/><col/><col/>${role !== 'instructor' ? u('<col/>') : ''}</colgroup><thead><tr><th scope="col">Child</th><th scope="col">Check-in</th><th scope="col">Age</th>${role !== 'instructor' ? u('<th scope="col">Guardian contact</th>') : ''}</tr></thead><tbody>${rows.map((p: any) => ui`<tr><th scope="row">${h(p.first_name ?? t('Removed for privacy'))}</th><td><label class="check"><input type="checkbox" data-attendance="${h(p.id)}" aria-label="${h(t('Attended') + ' — ' + (p.first_name ?? t('Removed for privacy')))}" ${p.attended ? 'checked' : ''}/><span>Attended</span></label></td><td><span class="amount">${h(p.age ?? '—')}</span></td>${role !== 'instructor' ? ui`<td><strong>${h(p.guardian_name)}</strong><span class="record-secondary identifier">${h(p.guardian_email)}</span><span class="record-secondary">${h(p.guardian_phone)}</span></td>` : ''}</tr>`).join('')}</tbody></table></div></div>`
      : empty(
          'No confirmed participants yet.',
          'Only registrations with verified payments appear on the attendance list.',
        ));
  workspace.querySelectorAll<HTMLInputElement>('[data-attendance]').forEach((box) =>
    box.addEventListener('change', async () => {
      box.disabled = true;
      try {
        await api(ui`participants/${box.dataset.attendance}/attendance`, 'POST', {
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
function setupSummary(s: any) {
  const next = s.tasks.find((t: any) => !t.complete);
  return ui`<details class="setup-summary" ${s.minimized ? '' : 'open'}><summary>Business setup: ${s.completed} of ${s.total} owner tasks complete</summary><div class="setup-next"><div><strong>${h(t(next?.title ?? 'Owner setup is complete'))}</strong><p>${h(t(next?.help ?? 'External verification and launch approval remain separate.'))}</p></div><a class="btn small" href="${h(next?.href ?? '/admin/setup')}">Continue setup</a></div><a class="text-link" href="/admin/setup">View all setup tasks</a></details>`;
}
let setupRevealCleanup: (() => void) | undefined;
async function renderSetup() {
  setupRevealCleanup?.();
  const s = await api('setup'),
    d = s.decisions;
  const nextTask = s.tasks.find((t: any) => !t.complete);
  workspace.innerHTML =
    heading(
      'Get Adventure Station ready',
      'Finish a little at a time. Your saved decisions will be here when you return.',
    ) +
    ui`<div class="setup-overview"><div><h2>${s.completed} of ${s.total} owner tasks complete</h2><progress value="${s.completed}" max="${s.total}" aria-label="Owner setup progress"></progress><p>${nextTask ? t('Next: ') + h(t(nextTask.title)) : t('Owner tasks complete. External checks remain separate.')}</p>${nextTask ? ui`<a class="btn" href="${h(nextTask.href)}">Continue setup</a>` : ''}</div><dl class="setup-readiness"><div><dt>Website editing</dt><dd>Available now</dd></div><div><dt>Registration</dt><dd>${t(s.registrationAllowed ? 'Test setup complete' : 'Setup still needed')}</dd></div><div><dt>Production launch</dt><dd>Separate review required</dd></div></dl></div><ul class="setup-list">${s.tasks.map((t: any) => ui`<li class="setup-task ${t.complete ? 'complete' : ''}"><div><h2>${h(translate(t.title, locale))}</h2><span class="task-state">${t.complete ? '✓ ' : ''}${h(translate(t.status, locale))}</span><p>${h(translate(t.help, locale))}</p></div><a href="${h(t.href)}">${translate(t.complete ? 'Review' : 'Open task', locale)}</a></li>`).join('')}</ul><h2 class="section-title">Your business decisions</h2><form id="setup-form"><details class="setup-form-section" id="business" open><summary>Business information</summary><div class="setup-form-body">${field('Legal business name', 'legalName', d.legalName)}${field('Business mailing contact', 'mailingContact', d.mailingContact, 'textarea', 'Use an appropriate business contact. Do not enter a private home address unnecessarily.')}<p><a href="/admin/content">Review public email, phone, locality and timezone ↗</a></p>${check('I have checked these business details.', 'confirm-business', false)}</div></details><details class="setup-form-section" id="supervision"><summary>How children participate</summary><div class="setup-form-body">${select(
      'Supervision arrangement',
      'supervision',
      d.supervision,
      [
        { id: 'undecided', name: t('I am still deciding') },
        { id: 'parent_present', name: t('A responsible adult stays throughout') },
        { id: 'drop_off', name: t('Children attend without their adult') },
      ],
    )}${field('Supervision, ages, arrival and emergency arrangements', 'safetyNotes', d.safetyNotes, 'textarea', 'Record the arrangements you can actually provide. Changing supervision reopens policy and operating reviews.')}<p class="notice">Drop-off needs additional regulatory evidence, safety arrangements and newly reviewed policies. Choosing it does not authorize a drop-off service.</p>${check('I have confirmed these participation arrangements.', 'confirm-supervision', false)}</div></details><details class="setup-form-section" id="licensing"><summary>Operating and licensing review</summary><div class="setup-form-body"><p>Consider the actual Florida requirements with the appropriate authority or adviser. This records your report; it is not independent certification or a finding of exemption.</p>${select(
      'Current review position',
      'licensingOutcome',
      d.licensingOutcome,
      [
        { id: 'unreviewed', name: t('Not reviewed yet') },
        { id: 'review_pending', name: t('Waiting for advice or a determination') },
        { id: 'license_required', name: t('A license or further approval is needed') },
        {
          id: 'owner_reports_authorized',
          name: t('I report that the required authorization is in place'),
        },
        {
          id: 'owner_reports_not_required',
          name: t('I report a determination that this program does not require it'),
        },
      ],
    )}${field('Determination and supporting notes', 'licensingNotes', d.licensingNotes, 'textarea')}${field('Supporting reference (optional https link)', 'licensingReference', d.licensingReference, 'url')}${check('I have recorded my current determination accurately.', 'confirm-licensing', false)}</div></details><details class="setup-form-section" id="privacy"><summary>Privacy and optional permissions</summary><div class="setup-form-body"><p>For this release, use artwork, crafts, materials, venues and non-identifying photos. Identifiable child photos and their consent workflow are deferred.</p>${field('Data, retention and privacy-request arrangements', 'privacyNotes', d.privacyNotes, 'textarea', 'Record who handles requests and the review/deletion schedule, including backups. Describe optional marketing and its opt-out process, or record that it is not used.')}<p><a href="/admin/privacy">Review historical records ↗</a> · <a href="/admin/content">Review privacy policy and review period ↗</a></p>${check('I have confirmed these privacy arrangements.', 'confirm-privacy', false)}</div></details><details class="setup-form-section" id="editorial"><summary>Website personalization</summary><div class="setup-form-body">${field('Website review notes', 'editorialNotes', d.editorialNotes, 'textarea', 'Review the homepage, About, FAQ, permitted images and contact details. This task can wait while you prepare drafts.')}${check('I have reviewed the website content.', 'confirm-editorial', false)}${check('Keep the dashboard setup section minimized.', 'minimized', s.minimized)}</div></details>${saveBar('Save setup progress')}</form><details class="setup-form-section" id="integrations"><summary>External checks: help from your developer</summary><div class="setup-form-body"><p>These checks need real external tests. You do not need to enter passwords, keys or technical settings here.</p>${s.integrations.map((i: any) => ui`<article class="setup-item"><h3>${h(i.title)}</h3>${status(i.status)}<p>${h(i.help)}</p></article>`).join('')}<p>Owner-reported operating review: ${h(d.licensingOutcome.replaceAll('_', ' '))}. Independent regulatory evidence: ${s.external.find((e: any) => e.kind === 'regulatory')?.verified ? 'Recorded for the current arrangements' : 'Not recorded'}.</p></div></details>`;
  const reveal = () => {
    const id = location.hash.slice(1),
      target = document.getElementById(id);
    if (target instanceof HTMLDetailsElement) {
      target.open = true;
      target.scrollIntoView({ block: 'start' });
      target.querySelector('summary')?.focus();
    }
  };
  window.addEventListener('hashchange', reveal);
  setupRevealCleanup = () => window.removeEventListener('hashchange', reveal);
  if (location.hash) reveal();
  const form = document.querySelector<HTMLFormElement>('#setup-form')!;
  if (role !== 'owner') {
    form
      .querySelectorAll<
        HTMLInputElement | HTMLButtonElement | HTMLSelectElement | HTMLTextAreaElement
      >('input,button,select,textarea')
      .forEach((control) => (control.disabled = true));
    form.insertAdjacentHTML(
      'afterbegin',
      ui`<p class="notice">${t('Business decisions are managed by the owner. This view is read-only.')}</p>`,
    );
  }
  onSave(form, async () => {
    const value: any = formValues(form);
    value.minimized = (form.elements.namedItem('minimized') as HTMLInputElement).checked;
    value.confirm = ['business', 'supervision', 'licensing', 'privacy', 'editorial'].filter(
      (k) => (form.elements.namedItem(ui`confirm-${k}`) as HTMLInputElement).checked,
    );
    value.revision = s.revision;
    await api('setup', 'POST', value);
    await renderSetup();
    notify('Setup progress saved. External verification stays separate.');
  });
}
async function renderNotifications() {
  const rows = await api('notifications');
  workspace.innerHTML =
    heading(
      'Messages to families',
      'Booking and payment records stay correct even when a message needs follow-up.',
      button('Check notification updates', 'check-notifications'),
    ) +
    ui`<div class="notice">Development release: customer sending is disabled. Configured tests go only to the email provider’s test addresses. Accepted means accepted by the provider; it does not mean delivered.</div>` +
    (rows.length
      ? ui`<div class="message-list">${rows.map((n: any) => ui`<article class="panel"><h2>${h(n.subject)}</h2>${status(n.state)}<p>Reference: ${h(n.registration_id)}</p><p>${h(n.last_error)}</p><p>${n.attempts} attempt(s). ${h(new Date(n.updated_at * 1000).toLocaleString())}</p>${n.state === 'queued' ? button('Retry safely', 'retry-notice', n.id) : ''}${['review', 'bounced', 'failed', 'suppressed'].includes(n.state) ? u('<p>Check the outcome and contact the guardian another way. Do not send a duplicate blindly.</p>') : ''}</article>`).join('')}</div>`
      : empty(
          'No booking messages yet.',
          'Verified confirmations, cancellations and refund updates will appear here.',
        ));
}
function retentionEditor(id: string) {
  workspace.innerHTML =
    heading(
      'Record a retention review',
      'Keep only what is still needed, and choose when to review it again.',
      button('Back to privacy review', 'back'),
    ) +
    ui`<form id="retention-form" class="panel">${select(
      'Why are details still needed?',
      'reason',
      'operational_followup',
      [
        { id: 'operational_followup', name: t('Unfinished booking follow-up') },
        { id: 'unresolved_dispute', name: t('An unresolved dispute') },
        { id: 'legal_obligation', name: t('A documented legal recordkeeping obligation') },
      ],
    )}${field('Review again in this many days', 'days', 30, 'number', 'Choose 1–365 days. Keep any supporting legal advice securely; do not enter personal or medical details here.', 'required min="1" max="365"')}<p>This records a reason for temporary retention, not a legal determination.</p>${saveBar('Save retention review')}</form>`;
  const form = document.querySelector<HTMLFormElement>('#retention-form')!;
  onSave(form, async () => {
    const v = formValues(form);
    await api(ui`privacy-review/${id}`, 'POST', {
      reason: v.reason,
      reviewAfter: Math.floor(Date.now() / 1000) + Number(v.days) * 86400,
    });
    await renderPrivacy();
    notify('Retention reason and next review date saved.');
  });
}
async function renderPrivacy() {
  const rows = await api('privacy-review');
  workspace.innerHTML =
    heading(
      'Privacy review',
      'Review due records, unresolved follow-up and reasons for retaining information.',
    ) +
    ui`<div class="panel"><p>A due date is a reminder, not automatic deletion. Financial facts and a removal record are preserved. Historical backups and payment-provider records need their own review.</p><a href="/admin/registrations">Open registration records ↗</a></div>` +
    (rows.length
      ? ui`<div class="grid">${rows.map((r: any) => ui`<article class="panel"><h2>${h(r.workshop_name)}</h2>${status(r.review_state)}<p>${h(r.id)}</p><p>Booking: ${h(r.status)}</p>${!r.anonymized_at ? button('Record retention review', 'retain-record', r.id) : ''}${r.review_after ? ui`<p>Review again ${h(new Date(r.review_after * 1000).toLocaleDateString())} · ${h(r.reason.replaceAll('_', ' '))}</p>` : ''}${!r.anonymized_at && !['pending', 'payment_review'].includes(r.status) ? button('Remove personal details', 'anonymize', r.id) : ''}</article>`).join('')}</div>`
      : empty(
          'Nothing due yet.',
          'Historical registrations will be listed here after their class.',
        ));
}
async function registrationDetails(id: string) {
  const d = await api(ui`registrations/${id}/details`);
  workspace.innerHTML =
    heading(
      'Review a family booking',
      'Cancel selected places and handle refunds as separate, recorded actions.',
      button('Back to registrations', 'back'),
    ) +
    ui`<div class="panel"><p>Reference: ${h(id)}</p><p>Cancelling places releases only those places. It does not issue a refund. The original order and payment history stay intact.</p><form id="cancel-places"><fieldset><legend>Places on this booking</legend>${d.participants.map((p: any) => check(ui`${p.first_name ?? 'Personal details removed'}${p.cancelled_at ? ' — cancelled' : ''}`, 'participantIds', false, !!p.cancelled_at).replace('name="participantIds"', ui`name="participantIds" value="${h(p.id)}"`)).join('')}</fieldset><button class="btn small" type="submit">Cancel selected places</button></form></div>${
      role === 'owner'
        ? ui`<form id="refund-form" class="panel"><h2>Request a sandbox refund</h2><p>Review the adopted policy and agreed adjustment first. This does not cancel places or prove that a refund is complete.</p>${select(
            'Verified payment',
            'paymentId',
            '',
            d.payments.map((p: any) => ({
              id: p.id,
              name: ui`${p.id} · ${cash(p.amount - p.refunded)} remaining`,
            })),
          )}${field('Refund amount ($)', 'refundAmount', '', 'number', '', 'required min="0.01" step="0.01"')}<button class="btn small" type="submit">Request sandbox refund</button></form>`
        : ''
    }<div class="panel"><h2>Refund follow-up</h2>${d.refunds.map((r: any) => ui`<article><p>${cash(r.amount)} · ${status(r.state)}</p><small>Request ${h(r.id)}</small>${r.state === 'review' ? button('Check same refund request', 'retry-refund', r.id) : ''}</article>`).join('') || u('<p>No refund requests recorded.</p>')}</div>`;
  const form = document.querySelector<HTMLFormElement>('#cancel-places')!;
  onSave(form, async () => {
    const participantIds = new FormData(form).getAll('participantIds');
    if (!participantIds.length) throw new Error('Select at least one active place.');
    if (
      !confirm(
        ui`Cancel ${participantIds.length} selected place(s)? Other places stay unchanged. Refunds are handled separately.`,
      )
    )
      return;
    await api(ui`registrations/${id}/cancel-places`, 'POST', { participantIds });
    await registrationDetails(id);
    notify('Selected places cancelled. Review any refund and message follow-up.');
  });
  const refund = document.querySelector<HTMLFormElement>('#refund-form');
  const requestId = crypto.randomUUID();
  if (refund)
    onSave(refund, async () => {
      const v = formValues(refund);
      if (
        !confirm(
          ui`Request ${cash(Math.round(Number(v.refundAmount) * 100))} as a sandbox refund? Places do not change.`,
        )
      )
        return;
      await api(ui`registrations/${id}/refund`, 'POST', {
        requestId,
        paymentId: v.paymentId,
        amount: Math.round(Number(v.refundAmount) * 100),
      });
      await registrationDetails(id);
      notify('Refund request recorded. Check its verified outcome.');
    });
  workspace.querySelectorAll<HTMLButtonElement>('[data-action=retry-refund]').forEach((b) =>
    b.addEventListener('click', async () => {
      try {
        const r = d.refunds.find((r: any) => r.id === b.dataset.id);
        await api(ui`registrations/${id}/refund`, 'POST', {
          requestId: r.id,
          paymentId: r.payment_id,
          amount: r.amount,
        });
        await registrationDetails(id);
      } catch (e) {
        notify(e instanceof Error ? e.message : 'Please try again.', true);
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
      'Overview',
      'Your workshops, your families, your next adventure.',
      ui`<a class="btn small" href="/admin/workshops">Manage workshops ↗</a>`,
    ) +
    (role === 'owner' ? setupSummary(await api('setup')) : '') +
    ui`<form id="range" class="toolbar">${field('From', 'from', from.toISOString().slice(0, 10), 'date')}${field('Through', 'to', to.toISOString().slice(0, 10), 'date')}<button class="btn small" type="submit">Update overview</button></form><div id="dashboard-data" class="loading">Loading your records…</div><div id="companion-summary"></div>`;
  const form = document.querySelector<HTMLFormElement>('#range')!;
  const load = async () => {
    const v = formValues(form);
    const d = await api(
      ui`dashboard?from=${Date.parse(ui`${v.from}T00:00:00Z`) / 1000}&to=${Date.parse(ui`${v.to}T00:00:00Z`) / 1000 + 86400}`,
    );
    const confirmed = d.registrations.find((r: any) => r.status === 'confirmed');
    document.querySelector('#dashboard-data')!.innerHTML =
      ui`<div class="dashboard-layout"><div class="panel"><h2>Your next class dates</h2>${d.upcoming.length ? d.upcoming.map((s: any) => ui`<div class="session-row"><div><strong>${h(s.name)}</strong><p>${h(date(s.starts_at, s.timezone))}</p></div><span>${s.confirmed} confirmed · ${s.capacity - s.confirmed} remaining before holds</span><a class="text-link" href="/admin/sessions">Review dates ↗</a></div>`).join('') : u('<p class="muted">No upcoming class dates. Create a workshop, then add its first date.</p>')}</div><div class="panel"><h2>Needs attention</h2><p>${d.notifications?.attention ?? 0} messages need follow-up · ${d.notifications?.pending ?? 0} waiting to send. <a href="/admin/notifications">Review messages ↗</a></p>${d.attention.length ? ui`<ul class="attention-list">${d.attention.map((r: any) => ui`<li>${h(r.workshop_name)} · ${status(r.status)} · <a href="/admin/registrations">Review registration</a></li>`).join('')}</ul>` : u('<p class="muted">No registrations flagged for payment follow-up.</p>')}</div></div><h2 class="section-title">Activity in your selected period</h2><p class="muted">Payment and registration activity in the chosen date range (UTC calendar dates).</p><div class="stats"><div class="stat"><small>Gross verified sales</small><span class="value money">${cash(d.financial.gross)}</span><small>${d.financial.payments} verified payment${d.financial.payments === 1 ? '' : 's'} · Before refunds and fees</small></div><div class="stat"><small>Refunds verified</small><span class="value money">${cash(d.financial.refunds)}</span><small>Refunds on payments made in this period</small></div><div class="stat"><small>Confirmed children</small><span class="value">${confirmed?.children ?? 0}</span><small>${confirmed?.orders ?? 0} confirmed registrations created in this period</small></div></div><div class="panel"><h2>Workshop popularity</h2>${d.popular.length ? d.popular.map((p: any) => ui`<p>${h(p.workshop_name)} — ${p.children} confirmed children</p>`).join('') : u('<p class="muted">Confirmed registrations will build this picture over time.</p>')}</div>${role === 'owner' ? ui`<div class="panel"><h2>Privacy review</h2><p>${d.privacy?.count ?? 0} historical registrations are due for a personal-data review. Open Registrations to remove personal details when appropriate.</p></div>` : ''}<div class="panel"><h2>Registration states</h2>${d.registrations.length ? d.registrations.map((r: any) => ui`<p>${status(r.status)} ${r.orders} registrations · ${r.children} children</p>`).join('') : u('<p class="muted">No registrations in this date range.</p>')}</div>`;
  };
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    load().catch((e) => notify(e.message, true));
  });
  await load();
  await companionSummary(document.querySelector<HTMLElement>('#companion-summary')!, api);
}
async function renderContent() {
  [content, media] = await Promise.all([api('content'), api('media')]);
  const owner = role === 'owner';
  workspace.innerHTML =
    heading(
      'Website content',
      'Edit the words and images. The design takes care of itself.',
      ui`<a class="btn small light" href="/" target="_blank" rel="noopener">View website ↗</a>`,
    ) +
    ui`<div class="content-language"><span>Content language: English</span><button class="btn small light" type="button" data-action="translate-site">Español</button></div><form id="editor"><div class="form-columns"><div><div class="panel"><h2>Your homepage</h2>${field('Main headline', 'headline', content.headline, 'textarea', '', 'required maxlength="140"')}${field('Welcome text', 'intro', content.intro, 'textarea')}${field('Promotional heading', 'promotion', content.promotion)}${select('Homepage image', 'heroMediaId', content.heroMediaId, [{ id: '', name: t('Original Adventure Station artwork') }, ...media.map((m) => ({ id: m.id, name: m.alt }))])}${select(
      'Accent color',
      'accent',
      content.accent,
      [
        { id: 'coral', name: t('Warm coral') },
        { id: 'blue', name: t('Creative blue') },
        { id: 'green', name: t('Garden green') },
      ],
    )}</div><div class="panel"><h2>Our story</h2>${field('Business description', 'about', content.about, 'textarea')}</div><div class="panel"><h2>Frequently asked questions</h2><div id="faq-fields"></div>${button('+ Add a question', 'add-faq')}</div></div><div><div class="panel"><h2>Say hello</h2>${field('Contact email', 'email', content.email, 'email', '', 'required')}${field('Contact phone (optional)', 'phone', content.phone)}${field('Florida city / locality', 'locality', content.locality, 'text', 'Confirm the actual business location.', owner ? '' : 'disabled')}${select(
      'Business timezone',
      'timezone',
      content.timezone,
      [
        { id: '', name: t('Awaiting location confirmation') },
        { id: 'America/New_York', name: t('Eastern Time') },
        { id: 'America/Chicago', name: t('Central Time') },
      ],
      owner ? '' : 'disabled',
    )}</div><div class="panel"><h2>Workshop & privacy policies</h2>${owner ? button('Load recommended policy drafts', 'load-policy-drafts') : ''}<p class="muted">Recommended drafts use parent-present workshops. Confirm operating arrangements and complete every [OWNER: ...] item before approval. Draft text stays private until approved.</p><p class="muted">Only publish policies the owner has confirmed. These are also saved with each registration.</p>${field('Cancellations & refunds', 'refundPolicy', content.refundPolicy, 'textarea', '', owner ? '' : 'disabled')}${field('Guardian supervision', 'supervisionPolicy', content.supervisionPolicy, 'textarea', '', owner ? '' : 'disabled')}${field('Drop-off & pickup', 'pickupPolicy', content.pickupPolicy, 'textarea', '', owner ? '' : 'disabled')}${field('Privacy & registration information', 'privacyPolicy', content.privacyPolicy, 'textarea', '', owner ? '' : 'disabled')}${check('I confirm these policies, the location and timezone are accurate and approved for families.', 'policiesApproved', content.policiesApproved, !owner)}${field('Privacy review after this many days', 'retentionDays', content.retentionDays, 'number', 'Review historical personal details for removal after this period. Financial facts are retained.', owner ? 'min="30" max="730"' : 'disabled')}</div></div></div>${saveBar('Publish website changes')}</form><div class="panel"><h2>Earlier versions</h2><p>Restore earlier text into the form, review it, then publish to apply it.</p><div id="history-list"></div></div>`;
  const faqs: any[] = content.faqs.map((v: any) => ({ ...v }));
  function renderFaqs() {
    document.querySelector('#faq-fields')!.innerHTML = faqs
      .map(
        (f, i) =>
          ui`<fieldset><legend>Question ${i + 1}</legend>${field('Question', ui`faq-q-${i}`, f.question)}${field('Answer', ui`faq-a-${i}`, f.answer, 'textarea')}${button('Remove question', 'remove-faq', String(i))}</fieldset>`,
      )
      .join('');
  }
  function captureFaqs() {
    faqs.forEach((f, i) => {
      f.question = (document.querySelector(ui`[name=faq-q-${i}]`) as HTMLInputElement)?.value ?? '';
      f.answer = (document.querySelector(ui`[name=faq-a-${i}]`) as HTMLInputElement)?.value ?? '';
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
            ui`<p>${h(new Date(r.created_at * 1000).toLocaleString())} ${button('Restore into form', 'restore-content', r.id)}</p>`,
        )
        .join('')
    : u('<p class="muted">Your previous version will be kept each time you publish.</p>');
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
      'Venues',
      'Verify the address before publishing a class date.',
      button('+ Add venue', 'new-venue', '', ''),
    ) +
    (venues.length
      ? ui`<div class="grid">${venues.map((v) => ui`<article class="panel"><h2>${h(v.name)}</h2>${status(v.archived ? 'archived' : v.verified ? 'verified' : 'needs verification')}<p>${h(v.address)}</p><p>${h(v.instructions)}</p>${button('Edit venue', 'edit-venue', v.id)}</article>`).join('')}</div>`
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
    ui`${v.id ? ui`<div class="content-language"><span>Content language: English</span><button class="btn small light" type="button" data-action="translate-venue" data-id="${h(v.id)}">Español</button></div>` : ''}<form id="editor" class="panel">${field('Venue name', 'name', v.name, 'text', '', 'required')}${field('Full address', 'address', v.address, 'textarea')}${field('Arrival instructions', 'instructions', v.instructions, 'textarea')}${field('Venue capacity', 'capacity', v.capacity ?? '', 'number', 'Maximum children permitted for these activities.', 'min="1" max="100"')}${field('Accessibility information', 'accessibility', v.accessibility ?? '', 'textarea')}${check('Permission to hold workshops here is confirmed.', 'permission_confirmed', !!v.permission_confirmed)}${check('I have verified this address and the venue details.', 'verified', !!v.verified)}${check('Archive this venue (keep it in history).', 'archived', !!v.archived)}${saveBar('Save venue')}</form>`;
  const form = document.querySelector<HTMLFormElement>('#editor')!;
  onSave(form, async () => {
    const d: any = formValues(form);
    d.capacity = d.capacity ? Number(d.capacity) : null;
    d.permission_confirmed = (
      form.elements.namedItem('permission_confirmed') as HTMLInputElement
    ).checked;
    d.verified = (form.elements.namedItem('verified') as HTMLInputElement).checked;
    d.archived = (form.elements.namedItem('archived') as HTMLInputElement).checked;
    await api(ui`venues${v.id ? ui`/${v.id}` : ''}`, 'POST', d);
    notify('Venue saved.');
    await renderVenues();
  });
}
async function renderRegistrations() {
  const rows = await api('registrations');
  workspace.innerHTML =
    heading(
      'Registrations',
      'Payment and registration states are shown separately.',
      button('Check payment updates', 'reconcile'),
    ) +
    ui`<div class="panel table-panel"><div class="field record-search"><label for="registration-search">Find a registration</label><input id="registration-search" type="search" placeholder="Guardian, workshop, or reference"/></div><div class="record-view" data-record-view><table class="table data-table records-registrations" data-record-table="registrations" data-record-threshold="920"><caption class="visually-hidden">Registration records</caption><colgroup><col/><col/><col/><col/><col/></colgroup><thead><tr><th scope="col">Workshop / guardian</th><th scope="col">Places</th><th scope="col">Registration</th><th scope="col">Verified payment</th><th scope="col">Actions</th></tr></thead><tbody>${rows.map((r: any) => ui`<tr data-record-id="${h(r.id)}" data-search="${h(`${r.guardian_name} ${r.guardian_email} ${r.workshop_name} ${r.id}`.toLowerCase())}"><th scope="row"><strong class="record-title">${h(r.workshop_name)}</strong><time class="record-meta" datetime="${new Date(r.starts_at * 1000).toISOString()}">${h(date(r.starts_at, r.timezone))}</time><span class="record-secondary">${h(r.guardian_name ?? t('Personal details removed'))}</span><span class="record-secondary identifier">${h(r.guardian_email)}</span><span class="record-secondary identifier">${h(r.id)}</span></th><td><span class="amount">${r.seats - r.cancelled_seats} ${t(r.seats - r.cancelled_seats === 1 ? 'active place' : 'active places')}</span><small class="record-secondary">${r.seats} ${t('originally booked')}</small></td><td>${status(r.status)}${r.needs_attention ? u('<small class="record-secondary">Follow-up needed</small>') : ''}</td><td><span class="amount">${cash(r.paid)}</span> ${t('received')}<br/>${(r.payment_issues ?? []).map((i: any) => ui`<strong>${t('Needs review:')} <span class="amount">${h(i.amount / 100)} ${h(i.currency)}</span></strong><br/>`).join('')}<span class="amount">${cash(r.refunded)}</span> ${t('refunded')}<small class="record-secondary">${t('Order total')} <span class="amount">${cash(r.total)}</span></small></td><td data-actions>${button('Review booking', 'booking-details', r.id)}<div class="inline-actions">${r.status === 'payment_review' && r.paid - r.refunded >= r.total ? button('Confirm available places', 'confirm-review', r.id) : ''}${r.needs_attention && !['pending', 'payment_review'].includes(r.status) ? button('Follow-up complete', 'complete-review', r.id) : ''}</div>${role === 'owner' ? ui`<div class="inline-actions">${r.paid > r.refunded || (r.payment_issues ?? []).some((i: any) => i.refunded < i.amount) ? button('Review refund', 'booking-details', r.id) : ''}${r.ends_at < Date.now() / 1000 && !r.anonymized_at ? button('Remove personal details', 'anonymize', r.id) : ''}</div>` : ''}</td></tr>`).join('')}</tbody></table></div>${!rows.length ? u('<p class="muted empty-table">Registrations will appear here when a family starts checkout.</p>') : ''}<p class="muted empty-table" data-filter-empty hidden>${t('No registrations match this search.')}</p></div>`;
  workspace
    .querySelector<HTMLInputElement>('#registration-search')!
    .addEventListener('input', (event) => {
      const query = (event.target as HTMLInputElement).value.toLowerCase();
      workspace
        .querySelectorAll<HTMLElement>('tr[data-search]')
        .forEach((row) => (row.hidden = !row.dataset.search!.includes(query)));
      workspace.querySelector<HTMLElement>('[data-filter-empty]')!.hidden = [
        ...workspace.querySelectorAll<HTMLElement>('tr[data-search]'),
      ].some((row) => !row.hidden);
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
    ui`<form id="upload" class="panel"><h2>Add an image</h2><p class="muted">Upload a JPEG, PNG or WebP. Images are optimized and metadata is removed before publication. Use only images you have permission to publish; this is a public website image library.</p>${field('Choose image', 'image', '', 'file', '', 'accept="image/jpeg,image/png,image/webp" required')}${field('Describe the image', 'alt', '', 'text', 'Used for accessibility and to help you find it later.', 'required maxlength="300"')}${check('I have permission to publish this image, including any required photo permissions.', 'rights', false)}${check('This image does not identify a child.', 'non_identifying', false)}<p>Use brand artwork, craft projects, materials, venues or non-identifying photos. Identifiable child photos are deferred.</p><button class="btn" type="submit">Upload image ↗</button></form><div class="media-grid">${media.map((m) => ui`<article class="media-item"><img src="/media/${h(m.id)}?w=480" width="480" height="480" alt="${h(m.alt)}"/><p>${h(m.alt)}</p><small>${m.width} × ${m.height} · ${Math.ceil(m.bytes / 1024)} KB (all sizes)</small><div class="inline-actions">${button('Edit description', 'alt-media', m.id)}${button('Remove unused image', 'delete-media', m.id)}</div></article>`).join('')}</div>`;
  const form = document.querySelector<HTMLFormElement>('#upload')!;
  onSave(form, async () => {
    const data = new FormData(form),
      file = data.get('image') as File;
    if (!file || file.size > 20000000) throw new Error('Choose an image up to 20 MB.');
    const payload = new FormData();
    payload.set('alt', String(data.get('alt')));
    payload.set('non_identifying', String(data.get('non_identifying') === 'on'));
    payload.set('rights', String(data.get('rights') === 'on'));
    for (const w of [1600, 960, 480])
      payload.set(String(w), await optimized(file, w), ui`${w}.jpg`);
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
    ui`<div class="panel table-panel"><div class="record-view" data-record-view><table class="table data-table records-team" data-record-table="team" data-record-threshold="720"><caption class="visually-hidden">Team member records</caption><colgroup><col/><col/><col/><col/><col/></colgroup><thead><tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Role</th><th scope="col">Access</th><th scope="col">Actions</th></tr></thead><tbody>${team.map((s: any) => ui`<tr data-record-id="${h(s.id)}"><th scope="row"><strong class="record-title">${h(s.name)}</strong></th><td><span class="identifier">${h(s.email)}</span></td><td>${h(t(s.role))}</td><td>${status(s.active ? 'active' : 'disabled')}</td><td data-actions>${button('Edit access', 'edit-team', s.id)}</td></tr>`).join('')}</tbody></table></div>${!team.length ? ui`<p class="muted empty-table">${t('No team members found.')}</p>` : ''}</div>`;
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
    ui`<form id="editor" class="panel">${field('Name', 'name', s.name, 'text', '', 'required')}${field('Sign-in email', 'email', s.email, 'email', '', 'required')}${select(
      'Role',
      'role',
      s.base_role ?? s.role,
      [
        { id: 'instructor', name: t('Instructor — assigned attendance only') },
        { id: 'manager', name: t('Manager — workshops, content and registrations') },
        { id: 'owner', name: t('Owner — full access including team and payments') },
      ],
    )}${check('Allow this person to sign in.', 'active', !!s.active)}${saveBar('Save team access')}</form>${role === 'owner' && s.id && s.base_role !== 'owner' ? ui`<section class="panel"><h2>Godmin technical access</h2><p>Requires a verified sign-in and explicit owner confirmation. Business, financial and policy approvals stay with the owner.</p>${s.identity_bound ? button(s.role === 'godmin' ? 'Revoke Godmin access' : 'Grant Godmin access', 'godmin-change', s.id) : ui`<p>Waiting for this person to sign in with their invited identity.</p>`}</section>` : ''}`;
  workspace.querySelector('[data-action=godmin-change]')?.addEventListener('click', async () => {
    if (!confirm(t('Confirm this change to verified technical access?'))) return;
    try {
      await api('team/' + s.id + '/godmin', 'POST', { grant: s.role !== 'godmin', confirm: true });
      await renderTeam();
    } catch (error) {
      notify((error as Error).message, true);
    }
  });
  const form = document.querySelector<HTMLFormElement>('#editor')!;
  onSave(form, async () => {
    const d = formValues(form);
    await api('team', 'POST', {
      ...d,
      id: s.id,
      active: (form.elements.namedItem('active') as HTMLInputElement).checked,
    });
    notify('Team access saved. Cloudflare Access must also allow this person to sign in.');
    await renderTeam();
  });
}
async function render() {
  if (await renderExtra(section, role, workspace, api, notify)) return;
  if (role === 'instructor') {
    await renderSessions();
    return;
  }
  switch (section) {
    case 'setup':
      await renderSetup();
      break;
    case 'notifications':
      await renderNotifications();
      break;
    case 'privacy':
      await renderPrivacy();
      break;
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
      case 'retain-record':
        retentionEditor(key);
        break;
      case 'booking-details':
        await registrationDetails(key);
        break;
      case 'check-notifications':
        await api('notifications/check', 'POST', {});
        await renderNotifications();
        notify('Notification checks complete. Review any follow-up.');
        break;
      case 'retry-notice':
        await api(ui`notifications/${key}/retry`, 'POST', {});
        await renderNotifications();
        break;
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
          await api(ui`registrations/${key}/review`, 'POST', { action: 'confirm' });
          notify('Places confirmed. Please inform the guardian.');
          await renderRegistrations();
        }
        break;
      case 'complete-review':
        await api(ui`registrations/${key}/review`, 'POST', { action: 'complete' });
        notify('Follow-up marked complete.');
        await renderRegistrations();
        break;
      case 'anonymize':
        if (
          confirm(
            'Permanently remove guardian and child personal details from this historical registration? Financial records will remain.',
          )
        ) {
          await api(ui`registrations/${key}/anonymize`, 'POST', {});
          notify('Personal details removed. Financial history preserved.');
          if (section === 'privacy') await renderPrivacy();
          else await renderRegistrations();
        }
        break;
      case 'delete-media':
        if (
          confirm(
            'Remove this unused image? Images referenced by workshops or saved page versions are protected.',
          )
        ) {
          await api(ui`media/${key}`, 'DELETE');
          notify('Unused image removed.');
          await renderMedia();
        }
        break;
      case 'alt-media': {
        const current = media.find((m) => m.id === key),
          alt = prompt('Describe this image for accessibility:', current.alt);
        if (alt) {
          await api(ui`media/${key}`, 'POST', { alt });
          notify('Image description saved.');
          await renderMedia();
        }
        break;
      }
      case 'translate-workshop':
        await translationEditor('workshop', key);
        break;
      case 'translate-venue':
        await translationEditor('venue', key);
        break;
      case 'translate-site':
        await translationEditor('site', 'site');
        break;
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

async function translationEditor(type: 'workshop' | 'site' | 'venue', id: string) {
  const data = await api(ui`translations/${type}/${id}`),
    value = data.value;
  const keys =
    type === 'workshop'
      ? ['name', 'summary', 'description', 'category', 'materials', 'instructions']
      : type === 'venue'
        ? ['instructions', 'accessibility']
        : [
            'headline',
            'intro',
            'about',
            'promotion',
            'refundPolicy',
            'supervisionPolicy',
            'pickupPolicy',
            'privacyPolicy',
          ];
  const labels: Record<string, string> = {
    name: t('Workshop name'),
    summary: 'Short description',
    description: 'Full description',
    category: 'Category',
    materials: 'Materials',
    instructions: 'Instructions',
    accessibility: 'Accessibility',
    headline: 'Main headline',
    intro: 'Welcome text',
    about: 'Business description',
    promotion: 'Promotional heading',
    refundPolicy: 'Cancellations & refunds',
    supervisionPolicy: 'Guardian supervision',
    pickupPolicy: 'Drop-off & pickup',
    privacyPolicy: 'Privacy & registration information',
  };
  workspace.innerHTML =
    heading(
      'Spanish content',
      'One shared record. Dates, prices, capacity and registrations stay unchanged.',
      button('Back', 'back'),
    ) +
    ui`<p class="notice">${t('Save English changes before switching content language. Policy translations require separate owner approval.')}</p><form id="translation-editor" class="panel">${keys.map((k) => field(labels[k]!, k, value[k] ?? '', ['name', 'category', 'headline', 'promotion'].includes(k) ? 'text' : 'textarea')).join('')}${type === 'site' ? ui`${data.proposedPolicies ? ui`<button class="btn light" type="button" id="load-spanish-policies">${t('Load proposed Spanish policy drafts')}</button><p>${t('Drafts need comparison with your English policies and owner review. Loading does not approve or save them.')}</p>` : ''}<h2>${t('Frequently asked questions')}</h2><div id="translated-faqs">${(value.faqs ?? []).map((f: any, i: number) => ui`<fieldset>${field('Question', 'question-' + i, f.question)}${field('Answer', 'answer-' + i, f.answer, 'textarea')}</fieldset>`).join('')}</div><button type="button" class="btn light" id="translation-add-faq">${t('Add a question')}</button>${check('I have reviewed and approve these Spanish policy translations.', 'approved', data.approved, role !== 'owner')}` : ''}${saveBar('Save Spanish content')}</form><details class="panel"><summary>${t('English source for reference')}</summary>${keys.map((k) => ui`<h3>${h(t(labels[k]!))}</h3><p class="prose">${h(data.source[k])}</p>`).join('')}</details>`;
  const form = document.querySelector<HTMLFormElement>('#translation-editor')!;
  document.querySelector('#load-spanish-policies')?.addEventListener('click', () => {
    if (!confirm(t('Replace these unsaved policy fields with proposed drafts?'))) return;
    for (const [key, value] of Object.entries(data.proposedPolicies.policies))
      (form.elements.namedItem(key) as HTMLTextAreaElement).value = String(value);
    (form.elements.namedItem('approved') as HTMLInputElement).checked = false;
  });
  document.querySelector('#translation-add-faq')?.addEventListener('click', () => {
    const list = document.querySelector('#translated-faqs')!,
      i = list.children.length;
    list.insertAdjacentHTML(
      'beforeend',
      ui`<fieldset>${field('Question', 'question-' + i)}${field('Answer', 'answer-' + i, '', 'textarea')}</fieldset>`,
    );
  });
  onSave(form, async () => {
    const values = formValues(form);
    const result: Record<string, unknown> = Object.fromEntries(
      keys.map((k) => [k, values[k] ?? '']),
    );
    if (type === 'site')
      result.faqs = [...form.querySelectorAll('#translated-faqs fieldset')].map((_, i) => ({
        question: values['question-' + i],
        answer: values['answer-' + i],
      }));
    await api(ui`translations/${type}/${id}`, 'POST', {
      value: result,
      revision: data.revision,
      sourceRevision: data.sourceRevision,
      approved:
        type === 'site' ? (form.elements.namedItem('approved') as HTMLInputElement).checked : false,
    });
    notify('Spanish content saved. Policy approval remains separate.');
    await translationEditor(type, id);
  });
}
