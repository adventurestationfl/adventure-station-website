import { createUI, localeOf, t as translate, errorMessage } from '../lib/i18n';
import { zonedDateTime, wallClock } from '../lib/time';
import { mediaPickerField, installMediaPickerFields } from './media-library';
type Api = (path: string, method?: string, data?: unknown) => Promise<any>;
type Notify = (message: string, error?: boolean) => void;
const locale = localeOf(document.documentElement.lang),
  { ui } = createUI(locale),
  t = (v: string) => translate(v, locale);
const h = (v: unknown) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
const cash = (n: number) =>
  new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(n / 100);
const when = (n: number) =>
  new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Chicago',
  }).format(n * 1000);
const field = (label: string, name: string, value: unknown = '', type = 'text', attrs = '') =>
  ui`<div class="field"><label for="offer-${h(name)}">${h(t(label))}</label>${type === 'textarea' ? `<textarea id="offer-${h(name)}" name="${h(name)}" ${attrs}>${h(value)}</textarea>` : `<input id="offer-${h(name)}" name="${h(name)}" type="${type}" value="${h(value)}" ${attrs}/>`}</div>`;
const select = (
  label: string,
  name: string,
  value: unknown,
  items: { id: string; name: string }[],
) =>
  ui`<div class="field"><label for="offer-${h(name)}">${h(t(label))}</label><select id="offer-${h(name)}" name="${h(name)}">${items.map((i) => `<option value="${h(i.id)}" ${String(value ?? '') === i.id ? 'selected' : ''}>${h(i.name)}</option>`).join('')}</select></div>`;
const button = (label: string, action: string, id = '') =>
  `<button class="btn small light" type="button" data-commercial-action="${action}" data-id="${h(id)}">${h(t(label))}</button>`;
export async function renderCommercial(
  host: HTMLElement,
  api: Api,
  notify: Notify,
  role: string,
  kind: 'promotions' | 'coupons',
) {
  const isCoupon = kind === 'coupons',
    owner = role === 'owner';
  const [rows, workshops, sessions, coupons] = await Promise.all([
    api(kind),
    api('workshops'),
    api('sessions'),
    isCoupon ? Promise.resolve([]) : api('coupons'),
  ]);
  const refresh = () => renderCommercial(host, api, notify, role, kind);
  function displayState(r: any) {
    if (r.state !== (isCoupon ? 'active' : 'published')) return r.state;
    const at = Math.floor(Date.now() / 1000);
    if (r.starts_at > at) return 'scheduled';
    if (r.ends_at <= at) return 'ended';
    if (isCoupon)
      return r.max_uses !== null && r.redeemed + r.held >= r.max_uses ? 'fully reserved' : 'active';
    if (r.coupon_id) {
      const c = coupons.find((c: any) => c.id === r.coupon_id);
      if (
        !c ||
        c.state !== 'active' ||
        c.starts_at > at ||
        c.ends_at <= at ||
        (c.max_uses !== null && c.held + c.redeemed >= c.max_uses)
      )
        return 'linked offer unavailable';
    }
    if (r.workshop_id && workshops.find((w: any) => w.id === r.workshop_id)?.status !== 'published')
      return 'linked workshop unavailable';
    if (r.session_id) {
      const s = sessions.find((s: any) => s.id === r.session_id);
      if (!s || s.status !== 'published' || s.starts_at <= at) return 'linked class unavailable';
    }
    return 'in display window';
  }
  function edit(original?: any, duplicate = false) {
    const item = original
      ? { ...original }
      : {
          name: '',
          code: '',
          automatic: false,
          kind: 'percent',
          amount: null,
          terms: '',
          terms_es: '',
          title: '',
          title_es: '',
          description: '',
          description_es: '',
          material_terms: '',
          material_terms_es: '',
          cta: '',
          cta_es: '',
          destination: '',
          media_id: null,
          workshop_id: null,
          session_id: null,
          coupon_id: null,
          placement: 'home_feature',
          starts_at: null,
          ends_at: null,
          state: 'draft',
          priority: 0,
          max_uses: null,
          per_email_limit: null,
        };
    if (duplicate) {
      item.id = null;
      item.revision = undefined;
      item.state = 'draft';
      item.name = item.name + ' ' + t('(copy)');
      if (isCoupon) item.code = '';
    }
    const editable = owner || item.state === 'draft';
    host.innerHTML = ui`<header class="admin-heading"><div><h1>${h(t(isCoupon ? 'Coupon & offer' : 'Promotion'))}</h1><p>Freeport local time · America/Chicago</p></div>${button('Back', 'back')}</header><form id="commercial-editor"><fieldset class="panel commercial-fields" ${editable ? '' : 'disabled'}><legend>${h(t('Offer details'))}</legend>${!editable ? ui`<p>Only the owner can change an active offer. Duplicate it to prepare a draft.</p>` : ''}${field('Internal name', 'name', item.name, 'text', 'required maxlength="120"')}${
      isCoupon
        ? ui`<div class="form-grid">${field('Coupon code', 'code', item.code, 'text', 'required pattern="[A-Za-z0-9_-]{3,32}" maxlength="32"')}${select(
            'Discount type',
            'kind',
            item.kind,
            [
              { id: 'percent', name: t('Percentage') },
              { id: 'fixed', name: t('Fixed amount ($)') },
            ],
          )}${field('Discount value', 'amount', item.amount === null ? '' : item.kind === 'percent' ? item.amount / 100 : item.amount / 100, 'number', 'required min="0.01" step="0.01"')}${field('Maximum uses (blank = unlimited)', 'max_uses', item.max_uses ?? '', 'number', 'min="1" max="1000000"')}${field('Uses per email (blank = unlimited)', 'per_email_limit', item.per_email_limit ?? '', 'number', 'min="1" max="10000"')}</div><p class="muted">Enter a percent or a dollar amount according to the discount type. Each place must retain a positive cent value. Free bookings are not supported.</p><label class="check"><input name="automatic" type="checkbox" ${item.automatic ? 'checked' : ''}/>${t('Automatically offer the best eligible discount when no code is supplied.')}</label><p class="muted">One use means one booking, regardless of child count. A supplied code takes priority; offers never stack. Per-email limits use retained records and are not identity verification.</p><div class="form-grid">${field('English offer terms', 'terms', item.terms, 'textarea', 'maxlength="1500"')}${field('Spanish offer terms', 'terms_es', item.terms_es, 'textarea', 'maxlength="1500"')}</div><p class="notice">Tax treatment and provider verification remain separate. A discount does not establish a tax exemption or activate checkout.</p>`
        : ui`<div class="form-grid">${field('English title', 'title', item.title, 'text', 'required maxlength="160"')}${field('Spanish title', 'title_es', item.title_es, 'text', 'maxlength="160"')}${field('English description', 'description', item.description, 'textarea', 'maxlength="2000"')}${field('Spanish description', 'description_es', item.description_es, 'textarea', 'maxlength="2000"')}${field('English material terms', 'material_terms', item.material_terms, 'textarea', 'maxlength="1500"')}${field('Spanish material terms', 'material_terms_es', item.material_terms_es, 'textarea', 'maxlength="1500"')}${field('English action label', 'cta', item.cta, 'text', 'maxlength="80"')}${field('Spanish action label', 'cta_es', item.cta_es, 'text', 'maxlength="80"')}</div>${select('Destination', 'destination', item.destination, [{ id: '', name: t('No action link') }, { id: '/workshops', name: t('Workshop catalog') }, { id: '/contact', name: t('Contact') }, ...workshops.filter((w: any) => w.status === 'published').map((w: any) => ({ id: '/workshops/' + w.slug, name: w.name }))])}${mediaPickerField('Promotion image', 'media_id', item.media_id ? [item.media_id] : [])}${select(
            'Placement',
            'placement',
            item.placement,
            [
              { id: 'home_feature', name: t('Homepage feature') },
              { id: 'announcement', name: t('Site announcement') },
              { id: 'workshop', name: t('Workshop page') },
            ],
          )}${field('Priority', 'priority', item.priority, 'number', 'min="-100" max="100"')}${select('Linked coupon (optional)', 'coupon_id', item.coupon_id, [{ id: '', name: t('No linked coupon') }, ...coupons.map((c: any) => ({ id: c.id, name: c.code + ' · ' + c.name }))])}<p class="muted">Linked offers disappear when the coupon expires, pauses or reaches its overall limit. Include all material terms in both languages.</p>`
    }
   <div class="form-grid">${select('Workshop scope (optional)', 'workshop_id', item.workshop_id, [{ id: '', name: t('All workshops') }, ...workshops.map((w: any) => ({ id: w.id, name: w.name }))])}${select('Class date scope (optional)', 'session_id', item.session_id, [{ id: '', name: t('All class dates') }, ...sessions.map((s: any) => ({ id: s.id, name: s.workshop_name + ' · ' + when(s.starts_at) }))])}${field('Starts (Freeport local time)', 'starts_at', item.starts_at ? wallClock(item.starts_at, 'America/Chicago') : '', 'datetime-local', 'required')}${field('Ends (Freeport local time)', 'ends_at', item.ends_at ? wallClock(item.ends_at, 'America/Chicago') : '', 'datetime-local', 'required')}${select(
     'State',
     'state',
     item.state,
     (owner
       ? ['draft', isCoupon ? 'active' : 'published', 'paused', 'archived']
       : [item.state]
     ).map((s) => ({ id: s, name: t(s) })),
   )}</div><p>Only the owner can activate or publish. Saving a draft does not advertise an offer or change business prices.</p>${editable ? `<button type="submit" class="btn">${h(t(isCoupon ? 'Save coupon' : 'Save promotion'))}</button>` : ''}<p id="commercial-form-status" role="status"></p></fieldset></form>${
     !isCoupon
       ? ui`<section class="panel commercial-preview" aria-label="${t('Draft preview')}"><h2>Draft preview</h2><p>This preview is not published.</p>${select(
           'Preview language',
           'preview_locale',
           locale,
           [
             { id: 'en-US', name: 'English' },
             { id: 'es-MX', name: 'Español (México)' },
           ],
         )}<div id="promotion-preview-copy"></div></section>`
       : ''
   }`;
    const form = host.querySelector<HTMLFormElement>('#commercial-editor')!;
    installMediaPickerFields(form, api, notify);
    const drawPreview = () => {
      if (isCoupon) return;
      const es =
          (host.querySelector('[name=preview_locale]') as HTMLSelectElement).value === 'es-MX',
        data = {
          get: (name: string) =>
            (form.elements.namedItem(name) as HTMLInputElement | null)?.value ?? '',
        };
      host.querySelector('#promotion-preview-copy')!.innerHTML =
        `<h3>${h(data.get(es ? 'title_es' : 'title') || t('Promotion title'))}</h3><p class="prose">${h(data.get(es ? 'description_es' : 'description'))}</p><p class="muted prose">${h(data.get(es ? 'material_terms_es' : 'material_terms'))}</p><span>${h(data.get(es ? 'cta_es' : 'cta'))}</span>`;
    };
    form.addEventListener('input', drawPreview);
    host.querySelector('[name=preview_locale]')?.addEventListener('change', drawPreview);
    drawPreview();
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const submit = form.querySelector<HTMLButtonElement>('[type=submit]')!,
        message = host.querySelector('#commercial-form-status')!;
      submit.disabled = true;
      try {
        const f = new FormData(form),
          str = (k: string) => String(f.get(k) ?? ''),
          nullable = (k: string) => str(k) || null;
        const value: any = {
          name: str('name'),
          starts_at: zonedDateTime(str('starts_at'), 'America/Chicago'),
          ends_at: zonedDateTime(str('ends_at'), 'America/Chicago'),
          state: str('state'),
          workshop_id: nullable('workshop_id'),
          session_id: nullable('session_id'),
          ...(item.id ? { revision: item.revision } : {}),
        };
        if (isCoupon)
          Object.assign(value, {
            code: str('code'),
            kind: str('kind'),
            amount: Math.round(Number(str('amount')) * 100),
            automatic: f.get('automatic') === 'on',
            terms: str('terms'),
            terms_es: str('terms_es'),
            max_uses: nullable('max_uses') ? Number(str('max_uses')) : null,
            per_email_limit: nullable('per_email_limit') ? Number(str('per_email_limit')) : null,
          });
        else
          Object.assign(
            value,
            Object.fromEntries(
              [
                'title',
                'title_es',
                'description',
                'description_es',
                'material_terms',
                'material_terms_es',
                'cta',
                'cta_es',
                'destination',
                'placement',
              ].map((k) => [k, str(k)]),
            ),
            {
              media_id: nullable('media_id'),
              coupon_id: nullable('coupon_id'),
              priority: Number(str('priority')),
            },
          );
        await api(kind + (item.id ? '/' + item.id : ''), 'POST', value);
        notify(isCoupon ? 'Coupon saved.' : 'Promotion saved.');
        await refresh();
      } catch (e) {
        message.textContent = errorMessage((e as Error).message, locale);
        message.setAttribute('role', 'alert');
      } finally {
        if (submit.isConnected) submit.disabled = false;
      }
    });
    host
      .querySelector('[data-commercial-action=back]')!
      .addEventListener('click', () => void refresh());
  }
  host.innerHTML = ui`<header class="admin-heading"><div><h1>${h(t(isCoupon ? 'Coupons & offers' : 'Promotions'))}</h1><p>${h(t(isCoupon ? 'Set clear discounts. Preserve every original booking fact.' : 'Schedule a focused message. Unused placements leave no empty space.'))}</p></div>${button(isCoupon ? 'Create coupon' : 'Create promotion', 'new')}</header><p class="notice">${h(t(isCoupon ? 'Only the owner activates offers. No live payments are enabled.' : 'Only the owner publishes promotions. Drafts remain private.'))}</p><div class="commercial-list">${rows.map((r: any) => ui`<article class="commercial-record"><div><h2>${h(isCoupon ? r.code : r.name)}</h2><p><span class="status">${h(t(displayState(r)))}</span> · ${when(r.starts_at)} — ${when(r.ends_at)}</p>${isCoupon ? `<p>${h(r.kind === 'percent' ? new Intl.NumberFormat(locale).format(r.amount / 100) + '%' : cash(r.amount))} · ${h(r.redeemed)} ${h(t('redeemed'))} · ${h(r.held)} ${h(t('reserved'))}</p><p>${h(t('Verified gross'))}: ${cash(r.verified_gross)} · ${h(t('Verified refunds'))}: ${cash(r.verified_refunds)}<br/>${h(t('Original discounts on paid bookings'))}: ${cash(r.saved_discount)}</p>` : `<p>${h(r.title)}</p>`}</div><div class="inline-actions">${button(owner || r.state === 'draft' ? 'Edit' : 'Details', 'edit', r.id)}${button('Duplicate', 'duplicate', r.id)}${button('History', 'history', r.id)}</div></article>`).join('') || ui`<p class="panel">No offers yet. Start with an editable draft.</p>`}</div><div id="commercial-history"></div>`;
  host.querySelectorAll<HTMLButtonElement>('[data-commercial-action]').forEach((b) =>
    b.addEventListener('click', async () => {
      const item = rows.find((r: any) => r.id === b.dataset.id);
      try {
        if (b.dataset.commercialAction === 'new') edit();
        else if (b.dataset.commercialAction === 'edit') edit(item);
        else if (b.dataset.commercialAction === 'duplicate') edit(item, true);
        else {
          const history = await api(kind + '/' + item.id + '/history');
          host.querySelector('#commercial-history')!.innerHTML =
            ui`<section class="panel"><h2>Earlier versions</h2>${
              history
                .map((v: any) => {
                  const old = JSON.parse(v.value);
                  return `<details><summary>${h(when(v.created_at))} · ${h(old.name)}</summary><p>${h(old.title || old.code)}</p><p class="prose">${h(old.description || old.terms)}</p><p class="prose">${h(old.description_es || old.terms_es)}</p></details>`;
                })
                .join('') || ui`<p>No earlier versions.</p>`
            }</section>`;
        }
      } catch (e) {
        notify((e as Error).message, true);
      }
    }),
  );
}
