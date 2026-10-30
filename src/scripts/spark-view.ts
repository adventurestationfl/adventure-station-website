import { createUI, t as translate, localeOf, errorMessage } from '../lib/i18n';
import { activityTopics, topicLabel } from '../lib/activity-topics';
type Api = (path: string, method?: string, data?: unknown) => Promise<any>;
const locale = localeOf(document.documentElement.lang),
  { ui } = createUI(locale),
  t = (s: string) => translate(s, locale);
const h = (v: unknown) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
const date = (value: string | number) =>
  new Intl.DateTimeFormat(locale, { timeZone: 'America/Chicago', dateStyle: 'medium' }).format(
    typeof value === 'number' ? value * 1000 : new Date(value),
  );
const money = (v: number) =>
  new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(v / 1000000);
const labels: Record<string, string> = {
  curated: 'Curated idea',
  'research-informed': 'Research-informed idea',
  ai: 'AI-developed draft',
  adaptation: 'Editable variation',
  owner: 'Staff-refined idea',
};
const evidenceLabels: Record<string, string> = {
  'original-exploration': 'Original creative exploration',
  'research-inspired': 'Research-inspired activity',
  'seasonal-opportunity': 'Seasonal opportunity',
  adaptation: 'Adaptation',
};
function ideaView(idea: any) {
  return ui`<article class="spark-idea" tabindex="-1"><p class="eyebrow">${h(t(labels[idea.source] ?? 'Curated idea'))}</p><h2>${h(idea.title)}</h2><p>${h(idea.description)}</p><p class="muted">${h(idea.relevance)} ${t('Ages')} ${idea.age_min}–${idea.age_max} · ${idea.duration} ${t('minutes')} · ${h(idea.difficulty)}</p><p class="topic-chips">${idea.tags.map((id: string) => `<span class="tag">${h(topicLabel(id, locale))}</span>`).join('')}</p><p><strong>${t('Materials')}</strong> ${h(idea.materials)}</p><details class="spark-provenance"><summary>Explore the activity</summary><dl class="idea-details">${['preparation', 'outline', 'benefit', 'safety', 'cleanup', 'accessibility', 'variations', 'artwork', 'cost'].map((k) => ui`<div><dt>${h(t(k[0]!.toUpperCase() + k.slice(1)))}</dt><dd>${h(idea[k])}</dd></div>`).join('')}</dl></details>${idea.sources.length ? ui`<details class="spark-provenance"><summary>Sources and context</summary><p>${h(t(evidenceLabels[idea.evidenceClass] ?? 'Research-inspired activity'))}. ${t('References provide context, not measured demand or copied instructions.')}</p><ul>${idea.sources.map((source: any) => ui`<li><a href="${h(source.url)}" target="_blank" rel="noopener noreferrer">${h(source.title)}</a><p>${t('Retrieved')} ${h(date(source.retrievedAt))}${source.publishedAt ? ' · ' + t('Published') + ' ' + h(date(source.publishedAt)) : ''}</p><p>${h(t(source.geography ?? ''))}</p></li>`).join('')}</ul></details>` : ''}<div class="inline-actions"><button class="btn small" data-spark="draft" data-idea="${h(idea.id)}">Create workshop draft</button><button class="btn small light" data-spark="save" data-idea="${h(idea.id)}">Save idea</button><button class="btn small light" data-spark="another">Show another</button><button class="btn small light" data-spark="refine" data-idea="${h(idea.id)}">Refine idea</button><button class="btn small light" data-spark="variation" data-idea="${h(idea.id)}">Generate a variation</button><button class="btn small light" data-spark="dismiss" data-idea="${h(idea.id)}">Dismiss</button></div></article>`;
}
function opportunityView(items: any[], filtered = false) {
  return ui`<section class="panel spark-opportunities"><h2>Fresh opportunities</h2><p>New references to spark an original activity. These are creative briefs, not ready-made workshops or measured popularity trends.</p>${
    items
      .slice(0, 3)
      .map(
        (o) =>
          ui`<article class="commercial-record"><div><h3>${h(o.title)}</h3><p>${h(o.question)}</p><p class="muted">${h(t(o.evidenceClass === 'seasonal-opportunity' ? 'Seasonal opportunity' : 'Research-informed reference'))} · ${h(t(o.freshness === 'historical-collection' ? 'Historical collection reference' : 'Dated editorial reference'))}</p><details><summary>Sources and context</summary><p><a href="${h(o.source.url)}" target="_blank" rel="noopener noreferrer">${h(o.source.title)}</a></p><p>${t('Retrieved')} ${h(date(o.source.retrievedAt))}${o.source.publishedAt ? ' · ' + t('Published') + ' ' + h(date(o.source.publishedAt)) : ''}</p><p>${h(t(o.source.geography))}</p><div class="field"><label for="brief-${h(o.id)}">${t('Conversation brief')}</label><textarea id="brief-${h(o.id)}" readonly rows="4">${h(o.question + ' ' + o.source.url + ' ' + t('Develop an original, practical bilingual activity. Review safety and existing ideas; do not assume popularity, prices or publication.'))}</textarea></div><a class="text-link" href="https://chatgpt.com/plugins/plugin_asdk_app_6ae3a4ada2f48191a015be0f10b28ab9" target="_blank" rel="noopener noreferrer">${t('Explore in ChatGPT Studio')}</a><p>${t('Conversation does not automatically save or publish. Draft access requires separate authorization and dashboard review.')}</p></details></div></article>`,
      )
      .join('') ||
    ui`<p>${t(filtered ? 'No fresh briefs match this topic. Explore an idea below.' : 'Fresh references are being checked. Your saved and original ideas remain available.')}</p>`
  }</section>`;
}
export async function renderSpark(
  host: HTMLElement,
  role: string,
  api: Api,
  notify: (text: string, error?: boolean) => void,
) {
  let data: any,
    topic = '',
    query = '',
    previewId = '';
  const show = async () => {
    host.setAttribute('aria-busy', 'true');
    const buttons = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).map((b) => ({
      b,
      disabled: b.disabled,
    }));
    buttons.forEach(({ b }) => (b.disabled = true));
    try {
      data = await api('companion');
    } catch (error) {
      host.setAttribute('aria-busy', 'false');
      buttons.forEach(({ b, disabled }) => (b.disabled = disabled));
      throw error;
    }
    const featured = data.library.find((i: any) => i.id === previewId) ?? data.idea;
    const matching = data.library.filter(
      (i: any) =>
        (!topic || i.tags.includes(topic)) &&
        (!query ||
          (i.title + ' ' + i.description + ' ' + i.materials)
            .toLocaleLowerCase(locale)
            .includes(query.toLocaleLowerCase(locale))),
    );
    const links = (list: any[], limit = 18) =>
      list
        .slice(0, limit)
        .map(
          (i) =>
            ui`<li><button class="text-link" data-preview-idea="${h(i.id)}">${h(i.title)}</button><small>${h(t(labels[i.source] ?? 'Curated idea'))}</small></li>`,
        )
        .join('');
    const month = new Date().toLocaleString('en-US', {
        timeZone: 'America/Chicago',
        month: 'numeric',
      }),
      next = (Number(month) % 12) + 1;
    const last = data.research.runs.find((r: any) => r.kind === 'discovery');
    host.innerHTML = ui`<header class="admin-heading"><div><h1>Creative Spark</h1><p>Wonder · Create · Play</p><p>A practical starting point for your next workshop. Review and adapt every idea.</p></div><button class="btn small light" data-spark="refresh">Find fresh inspiration</button></header><p class="muted spark-refresh-status">${t('Research refresh')}: ${h(t(data.research.enabled ? data.research.frequency : 'disabled'))}${last ? ' · ' + h(t(last.status)) + ' · ' + h(date(last.started_at)) : ''}</p><div class="panel spark-filters"><div class="field"><label for="spark-topic">Activity topic</label><select id="spark-topic"><option value="">${t('All topics')}</option>${activityTopics.map((v) => `<option value="${v.id}" ${topic === v.id ? 'selected' : ''}>${h(topicLabel(v.id, locale))}</option>`).join('')}</select></div><form id="spark-search" class="field"><label for="spark-query">Search ideas</label><div class="inline-actions"><input id="spark-query" name="query" value="${h(query)}" maxlength="100" type="search"/><button class="btn small light" type="submit">Search</button></div></form></div>${opportunityView(
      (data.discovery?.opportunities ?? []).filter((o: any) => !topic || o.tags.includes(topic)),
      !!topic,
    )}<p class="eyebrow">Today’s featured idea</p><div id="spark-featured">${featured ? ideaView(featured) : ui`<p class="panel">No idea selected. Restore a dismissed idea below.</p>`}</div><div class="spark-collections"><section class="panel spark-library"><h2>Discover ideas</h2><ul class="spark-records">${links(matching, 6) || ui`<li>No ideas match these filters.</li>`}</ul>${matching.length > 6 ? ui`<details class="spark-library-more"><summary>Browse all ideas</summary><ul class="spark-records">${links(matching.slice(6), matching.length)}</ul></details>` : ''}</section><section class="panel"><h2>Newly discovered ideas</h2><ul class="spark-records">${
      links(
        matching.filter((i: any) => i.createdAt && Date.now() / 1000 - i.createdAt < 30 * 86400),
        3,
      ) || ui`<li>Research is preparing new ideas. Your curated library remains available.</li>`
    }</ul><h2>Seasonal recommendations</h2>${data.seasonalContext.map((c: any) => ui`<p class="muted">${h(t(c.label))} · ${h(date(c.date + 'T12:00:00Z'))} <a href="${h(c.url)}" target="_blank" rel="noopener noreferrer">${t('Calendar reference')}</a></p>`).join('')}<ul class="spark-records">${
      links(
        matching.filter((i: any) => i.months.includes(Number(month)) || i.months.includes(next)),
        3,
      ) || ui`<li>Explore evergreen ideas while new seasonal suggestions are prepared.</li>`
    }</ul></section></div><section class="panel"><h2>Saved ideas</h2><div class="saved-ideas"><ul class="spark-records">${
      links(
        data.preferences
          .filter((p: any) => p.saved)
          .map((p: any) => data.library.find((i: any) => i.id === p.idea_id))
          .filter(Boolean),
        data.preferences.length,
      ) || ui`<li>Save an idea to find it here later.</li>`
    }</ul></div></section><details class="panel"><summary>Dismissed ideas</summary>${data.preferences
      .filter((p: any) => p.dismissed)
      .map(
        (p: any) =>
          ui`<p>${h(data.library.find((i: any) => i.id === p.idea_id)?.title ?? p.idea_id)} <button class="btn small light" data-spark="restore" data-idea="${h(p.idea_id)}">Restore</button></p>`,
      )
      .join(
        '',
      )}</details><details class="panel"><summary>Your inspiration preferences</summary><form id="spark-profile"><fieldset><legend>Preferred topics</legend><div class="topic-options">${activityTopics.map((v) => `<label><input type="checkbox" name="topics" value="${v.id}" ${data.profile.topics.includes(v.id) ? 'checked' : ''}/> ${h(topicLabel(v.id, locale))}</label>`).join('')}</div></fieldset><div class="form-grid"><div class="field"><label for="spark-min">Youngest age</label><input id="spark-min" name="age_min" type="number" min="4" max="17" required value="${data.profile.age_min}"/></div><div class="field"><label for="spark-max">Oldest age</label><input id="spark-max" name="age_max" type="number" min="4" max="17" required value="${data.profile.age_max}"/></div></div><div class="field"><label for="spark-complexity">Material complexity</label><select id="spark-complexity" name="complexity">${['any', 'simple', 'moderate'].map((v) => `<option value="${v}" ${data.profile.complexity === v ? 'selected' : ''}>${h(t(v))}</option>`).join('')}</select></div><div class="field"><label for="spark-materials">Preferred materials</label><input id="spark-materials" name="materials" maxlength="200" value="${h(data.profile.materials)}"/></div><button class="btn small" type="submit">Save inspiration preferences</button></form></details><details id="spark-how" class="panel"><summary>How inspiration works</summary><p>${h(t(data.ai.reason))}</p><p>Sources are dated topic references. No idea is labeled trending without verified popularity evidence.</p>${['owner', 'godmin'].includes(role) ? ui`<button class="btn small light" id="spark-config-open">Generation and research settings</button><div id="spark-config"></div>` : ''}</details>`;
    host.setAttribute('aria-busy', 'false');
    host.querySelector<HTMLSelectElement>('#spark-topic')!.addEventListener('change', async (e) => {
      topic = (e.target as HTMLSelectElement).value;
      await show();
      host.querySelector<HTMLElement>('#spark-topic')!.focus();
    });
    host.querySelector('#spark-search')!.addEventListener('submit', async (e) => {
      e.preventDefault();
      query = host.querySelector<HTMLInputElement>('#spark-query')!.value;
      await show();
      host.querySelector<HTMLElement>('#spark-query')!.focus();
    });
    host.querySelector('#spark-profile')!.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget as HTMLFormElement);
      try {
        await api('companion/profile', 'POST', {
          topics: f.getAll('topics'),
          age_min: Number(f.get('age_min')),
          age_max: Number(f.get('age_max')),
          complexity: f.get('complexity'),
          materials: f.get('materials'),
        });
        notify(t('Inspiration preferences saved.'));
        await show();
      } catch (err) {
        notify(errorMessage(err instanceof Error ? err.message : String(err), locale), true);
      }
    });
    host
      .querySelector('#spark-config-open')
      ?.addEventListener('click', () =>
        settings().catch((err) =>
          notify(errorMessage(err instanceof Error ? err.message : String(err), locale), true),
        ),
      );
  };
  const settings = async () => {
    const status = await api('companion/config'),
      c = status.config,
      panel = host.querySelector('#spark-config')!;
    panel.innerHTML = ui`<p>${t('Reserved monthly budget')}: ${h(money(status.usage.reservedMicrousd))} · ${t('Requests')}: ${status.usage.requests}</p><p>${h(t(status.activated ? 'Model generation is active.' : 'Model generation is not activated.'))}</p><p>Secrets belong in Worker secret storage. A personal chat subscription does not provide API credits.</p><p>Reserved allowance is not verified spending. Failed or ambiguous calls retain their reservation. ChatGPT conversations do not use this API ledger.</p><form id="spark-config-form"><div class="field"><label><input name="researchEnabled" type="checkbox" ${c.researchEnabled ? 'checked' : ''}/> ${t('Automatic topic research')}</label></div><div class="field"><label for="spark-frequency">Research frequency</label><select id="spark-frequency" name="researchFrequency">${['twice-daily', 'daily', 'weekly', 'fortnightly'].map((v) => `<option value="${v}" ${c.researchFrequency === v ? 'selected' : ''}>${h(t(v))}</option>`).join('')}</select></div><div class="field"><label for="spark-provider">Generation provider</label><select id="spark-provider" name="provider"><option value="none" ${c.provider === 'none' ? 'selected' : ''}>${t('No model provider')}</option><option value="workers-ai" ${c.provider === 'workers-ai' ? 'selected' : ''}>Cloudflare Workers AI</option></select></div><div class="field"><label for="spark-model">Model identifier</label><input id="spark-model" name="model" maxlength="120" value="${h(c.model)}"/></div><div class="field"><label for="spark-cap">Monthly expenditure cap (USD)</label><input id="spark-cap" name="monthlyCap" type="number" min="0" max="100" step="0.01" required value="${c.monthlyCapMicrousd / 1000000}"/></div><div class="field"><label><input name="enabled" type="checkbox" ${c.enabled ? 'checked' : ''}/> ${t('Use generation when separately authorized')}</label></div><p>Saving these preferences does not authorize paid usage or provision credentials. Zero budget keeps generation disabled.</p><button class="btn small" type="submit">Save generation settings</button></form>`;
    panel.querySelector('form')!.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget as HTMLFormElement);
      try {
        await api('companion/config', 'POST', {
          researchEnabled: f.has('researchEnabled'),
          researchFrequency: f.get('researchFrequency'),
          provider: f.get('provider'),
          model: f.get('model'),
          monthlyCapMicrousd: Math.round(Number(f.get('monthlyCap')) * 1000000),
          enabled: f.has('enabled'),
        });
        notify(t('Generation preferences saved. Activation is shown separately.'));
        await settings();
      } catch (err) {
        notify(errorMessage(err instanceof Error ? err.message : String(err), locale), true);
      }
    });
  };
  const editor = (idea: any, action: string) => {
    const featured = host.querySelector('#spark-featured')!;
    if (action === 'draft') {
      featured.innerHTML = ui`<form id="spark-draft-form" class="panel"><h2>${h(idea.title)}</h2><p>Choose your own price and capacity. This creates an editable draft, never a published date.</p><div class="form-grid"><div class="field"><label for="spark-draft-price">Price per child ($)</label><input id="spark-draft-price" name="price" type="number" min="1" max="1000" step="0.01" required/></div><div class="field"><label for="spark-draft-capacity">Places per class</label><input id="spark-draft-capacity" name="capacity" type="number" min="1" max="100" required/></div></div><button class="btn small" type="submit">Prepare editable draft</button> <button type="button" class="btn small light" data-spark="cancel">Cancel</button></form>`;
      featured.querySelector('form')!.addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.currentTarget as HTMLFormElement;
        if (!form.reportValidity()) return;
        const f = new FormData(form),
          button = form.querySelector<HTMLButtonElement>('[type=submit]')!;
        button.disabled = true;
        try {
          const result = await api(`companion/${idea.id}/draft`, 'POST', {
            price: Math.round(Number(f.get('price')) * 100),
            capacity: Number(f.get('capacity')),
          });
          location.assign('/admin/workshops?edit=' + encodeURIComponent(result.id));
        } catch (err) {
          notify(errorMessage(err instanceof Error ? err.message : String(err), locale), true);
          button.disabled = false;
        }
      });
    } else {
      const variation = action === 'variation',
        copies = idea.variants;
      featured.innerHTML = ui`<form class="panel" id="spark-refine-form"><h2>${t(variation ? 'Create an editable variation' : 'Refine this idea')}</h2><p>Your original idea and saved state are preserved. This creates a new editable version.</p>${[
        'en',
        'es',
      ]
        .map((language) => {
          const c = copies[language],
            suffix = language === 'es' ? ' — otra forma de explorar' : ' — another way to explore';
          return `<fieldset><legend>${language === 'es' ? 'Español' : 'English'}</legend>${[
            ['title', 'Title', variation ? (c.title + suffix).slice(0, 120) : c.title, 120],
            [
              'description',
              'Description',
              variation ? (c.description + ' ' + c.variations).slice(0, 700) : c.description,
              700,
            ],
            ['materials', 'Materials', c.materials, 1200],
            ['outline', 'Activity outline', c.outline, 1600],
          ]
            .map(
              ([key, label, value, max]) =>
                `<div class="field"><label for="spark-${language}-${key}">${h(t(String(label)))}</label><textarea id="spark-${language}-${key}" name="${language}_${key}" required maxlength="${max}">${h(value)}</textarea></div>`,
            )
            .join('')}</fieldset>`;
        })
        .join(
          '',
        )}<p>Variations are editable adaptations, not claims of AI generation or current popularity.</p><button class="btn small" type="submit">Save new version</button> <button class="btn small light" type="button" data-spark="cancel">Cancel</button></form>`;
      featured.querySelector('form')!.addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget as HTMLFormElement),
          copy = (lang: string) =>
            Object.fromEntries(
              ['title', 'description', 'materials', 'outline'].map((k) => [
                k,
                f.get(lang + '_' + k),
              ]),
            );
        try {
          const result = await api(`companion/${idea.id}/refine`, 'POST', {
            en: copy('en'),
            es: copy('es'),
            variation,
          });
          previewId = result.idea.id;
          await show();
          notify(t('New idea version saved. The original is preserved.'));
        } catch (err) {
          notify(errorMessage(err instanceof Error ? err.message : String(err), locale), true);
        }
      });
    }
    featured.querySelector<HTMLElement>('input,textarea')?.focus();
  };
  host.addEventListener('click', async (event) => {
    const preview = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-preview-idea]');
    if (preview) {
      previewId = preview.dataset.previewIdea!;
      host.querySelector('#spark-featured')!.innerHTML = ideaView(
        data.library.find((i: any) => i.id === previewId),
      );
      host.querySelector<HTMLElement>('.spark-idea')!.focus();
      return;
    }
    const b = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-spark]');
    if (!b) return;
    b.disabled = true;
    host
      .querySelectorAll<HTMLButtonElement>('[data-spark],[data-preview-idea]')
      .forEach((button) => (button.disabled = true));
    try {
      const action = b.dataset.spark!,
        id = b.dataset.idea,
        idea = data.library.find((i: any) => i.id === id);
      if (['draft', 'refine', 'variation'].includes(action)) {
        editor(idea, action);
        return;
      }
      if (action === 'cancel') {
        // Cancel only the local editor. A background library refresh used to
        // replace a newly opened technical section and lose the user's click.
        const current = data.library.find((i: any) => i.id === previewId) ?? data.idea;
        host.querySelector('#spark-featured')!.innerHTML = current ? ideaView(current) : '';
        host.querySelector<HTMLElement>('.spark-idea')?.focus();
        return;
      }
      if (action === 'refresh') {
        const result = await api('companion/refresh', 'POST', {});
        notify(
          t(
            result.state === 'fallback'
              ? 'Research is unavailable. Cached ideas are ready.'
              : 'Research refresh checked. Your saved ideas are preserved.',
          ),
        );
      } else if (action === 'another') {
        previewId = '';
        await api('companion/another', 'POST', {});
      } else {
        await api(`companion/${id}/${action}`, 'POST', {});
        if (action === 'dismiss') previewId = '';
      }
      await show();
    } catch (err) {
      notify(errorMessage(err instanceof Error ? err.message : String(err), locale), true);
    } finally {
      host
        .querySelectorAll<HTMLButtonElement>('[data-spark],[data-preview-idea]')
        .forEach((button) => (button.disabled = false));
      b.disabled = false;
    }
  });
  await show();
}
