import { createUI, localeOf, t as translate, errorMessage } from '../lib/i18n';
const locale = localeOf(document.documentElement.lang),
  { ui } = createUI(locale),
  t = (s: string) => translate(s, locale);
const h = (v: unknown) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
type Api = (path: string, method?: string, data?: unknown) => Promise<any>;
export async function renderCommunications(
  host: HTMLElement,
  api: Api,
  notify: (s: string, error?: boolean) => void,
  owner: boolean,
) {
  const rows = await api('session-communications');
  host.innerHTML = ui`<section class="panel"><h2>Class updates & reminders</h2><p>Prepare weather, venue or attendance instructions for confirmed bookings. A message does not change a booking, cancel a class or approve a venue. Customer delivery remains disabled.</p><div class="field"><label for="communication-session">Class date</label><select id="communication-session"><option value="">${t('Choose a class date')}</option>${rows.map((r: any) => `<option value="${h(r.id)}">${h(r.workshop_name)} · ${h(new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: r.timezone }).format(r.starts_at * 1000))}</option>`).join('')}</select></div><div id="communication-editor"></div></section>`;
  const select = host.querySelector<HTMLSelectElement>('#communication-session')!,
    editor = host.querySelector<HTMLElement>('#communication-editor')!;
  let generation = 0;
  select.onchange = async () => {
    const current = ++generation,
      id = select.value;
    editor.innerHTML = '';
    if (!id) return;
    try {
      const data = await api('session-communications/' + id);
      if (current !== generation) return;
      const editable = owner || data.reminder_hours === null;
      const area = (label: string, name: string) =>
        `<div class="field"><label for="communication-${name}">${h(t(label))}</label><textarea id="communication-${name}" name="${name}" maxlength="2000">${h(data[name])}</textarea></div>`;
      editor.innerHTML = ui`<form id="communication-form"><fieldset ${editable ? '' : 'disabled'}><legend>Message drafts</legend><div class="form-grid">${area('English class update', 'notice_en')}${area('Spanish class update', 'notice_es')}${area('English reminder', 'reminder_en')}${area('Spanish reminder', 'reminder_es')}</div><div class="field"><label for="communication-hours">Reminder timing</label><select id="communication-hours" name="reminder_hours" ${owner ? '' : 'disabled'}>${[
        ['', 'Off'],
        ['24', '24 hours before'],
        ['48', '48 hours before'],
      ]
        .map(
          ([value, label]) =>
            `<option value="${value}" ${String(data.reminder_hours ?? '') === value ? 'selected' : ''}>${h(t(label!))}</option>`,
        )
        .join(
          '',
        )}</select></div><p>Reminders are off until the owner enables them. Only active places in confirmed bookings are included. Each reminder is queued once per booking and booking time.</p>${editable ? `<button class="btn" type="submit">${h(t('Save message drafts'))}</button>` : ''}</fieldset></form>${owner ? `<button type="button" class="btn light" id="queue-class-update">${h(t('Queue saved class update'))}</button>` : ui`<p>Only the owner can queue updates or enable reminders. Enabled reminder drafts are read-only for other staff.</p>`}<p id="communication-result" role="status"></p>`;
      const result = editor.querySelector<HTMLElement>('#communication-result')!,
        form = editor.querySelector<HTMLFormElement>('form')!;
      form.onsubmit = async (event) => {
        event.preventDefault();
        const button = form.querySelector<HTMLButtonElement>('[type=submit]')!;
        button.disabled = true;
        try {
          const value: any = { revision: data.revision };
          for (const key of ['notice_en', 'notice_es', 'reminder_en', 'reminder_es'])
            value[key] = (form.elements.namedItem(key) as HTMLTextAreaElement).value;
          const hours = (form.elements.namedItem('reminder_hours') as HTMLSelectElement).value;
          value.reminder_hours = hours ? Number(hours) : null;
          const saved = await api('session-communications/' + id, 'POST', value);
          data.revision = saved.revision;
          result.textContent = t('Message drafts saved. Delivery remains disabled.');
        } catch (e) {
          result.textContent = errorMessage((e as Error).message, locale);
        } finally {
          button.disabled = false;
        }
      };
      editor
        .querySelector<HTMLButtonElement>('#queue-class-update')
        ?.addEventListener('click', async (event) => {
          // Queue only the exact saved revision; edits must be deliberately saved first.
          const button = event.currentTarget as HTMLButtonElement;
          button.disabled = true;
          try {
            const r = await api('session-communications/' + id + '/queue', 'POST', {
              revision: data.revision,
            });
            result.textContent =
              t('Messages queued:') + ' ' + r.queued + '. ' + t('Queued does not mean delivered.');
          } catch (e) {
            result.textContent = errorMessage((e as Error).message, locale);
          } finally {
            button.disabled = false;
          }
        });
    } catch (e) {
      if (current === generation) notify((e as Error).message, true);
    }
  };
}
