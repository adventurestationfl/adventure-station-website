import { createUI, localeOf, t as translate } from '../lib/i18n';
type Api = (path: string, method?: string, data?: unknown) => Promise<any>;
const locale = localeOf(document.documentElement.lang),
  { ui } = createUI(locale),
  t = (v: string) => translate(v, locale);
const h = (v: unknown) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
function proposalView(command: any) {
  const data = command.data?.value ?? command.data ?? {};
  const labels: Record<string, string> = {
    name: 'Workshop name',
    summary: 'Short description',
    description: 'Description',
    category: 'Category',
    materials: 'Materials',
    instructions: 'Instructions',
    age_min: 'Minimum age',
    age_max: 'Maximum age',
    duration: 'Duration (minutes)',
    capacity: 'Capacity',
    price: 'Price (USD cents)',
    locale: 'Language',
  };
  return ui`<dl class="idea-details">${Object.entries(labels)
    .filter(([key]) => data[key] !== undefined)
    .map(([key, label]) => ui`<div><dt>${h(t(label))}</dt><dd>${h(data[key])}</dd></div>`)
    .join(
      '',
    )}${data.sessions ? ui`<div><dt>${t('Draft class dates')}</dt><dd>${data.sessions.length}</dd></div>` : ''}</dl><p>${t('Nothing will be published. Review all shared facts before opening bookings.')}</p>`;
}
const recordLink = (event: any) => {
  const section: Record<string, string> = {
    workshop: 'workshops',
    session: 'sessions',
    content: 'content',
    translation: 'content',
    team: 'team',
    media: 'media',
    idea: 'creative',
    preferences: 'settings',
    mcp: 'connections',
    registration: 'registrations',
    payment: 'registrations',
    refund: 'registrations',
  };
  const target = section[event.action.split('.')[0]];
  return target
    ? ui`<a href="/admin/${target}${target === 'workshops' ? '?edit=' + encodeURIComponent(event.entity_id) : ''}">${t('Open related records')}</a>`
    : '';
};
const actions = (idea: any) =>
  ui`<div class="inline-actions"><button class="btn small" data-spark="draft" data-idea="${h(idea.id)}">Create workshop draft</button><button class="btn small light" data-spark="save" data-idea="${h(idea.id)}">Save idea</button><button class="btn small light" data-spark="another">Show another</button><button class="btn small light" data-spark="dismiss" data-idea="${h(idea.id)}">Dismiss</button></div>`;
function ideaView(idea: any, compact = false) {
  return ui`<article class="spark-idea"><p class="eyebrow">Curated workshop idea · not a verified trend</p><h2>${h(idea.title)}</h2><p>${h(idea.description)}</p><p class="muted">${t('Ages')} ${idea.age_min}–${idea.age_max} · ${idea.duration} ${t('minutes')} · ${t('Suggested group')}: ${idea.capacity}</p>${compact ? '' : ui`<dl class="idea-details">${['materials', 'preparation', 'difficulty', 'benefit', 'cost', 'cleanup', 'accessibility', 'safety', 'variations'].map((k) => ui`<div><dt>${h(t(k[0]!.toUpperCase() + k.slice(1)))}</dt><dd>${h(idea[k])}</dd></div>`).join('')}</dl>`}${actions(idea)}</article>`;
}
export async function companionSummary(host: HTMLElement, api: Api) {
  const [data, prefs] = await Promise.all([api('companion'), api('preferences')]);
  host.innerHTML = ui`${prefs.encouragement === 'disabled' ? '' : ui`<details class="encouragement" ${prefs.encouragement === 'shown' ? 'open' : ''}><summary>${t('A little encouragement for today')}</summary><p>${h(data.phrase.text)}</p><a href="/admin/settings">${t('Personal preferences')}</a></details>`}<section class="companion-summary"><div><strong>${t('Creative Spark')}</strong><p>${h(data.idea?.title ?? t('No idea selected. Restore a dismissed idea below.'))}</p></div><a class="btn small light" href="/admin/creative">Explore today’s idea</a></section>`;
  host.querySelector('details')?.addEventListener('toggle', async (event) => {
    const shown = (event.currentTarget as HTMLDetailsElement).open;
    await api('preferences', 'POST', { ...prefs, encouragement: shown ? 'shown' : 'minimized' });
  });
}
export async function renderExtra(
  section: string,
  role: string,
  host: HTMLElement,
  api: Api,
  notify: (text: string, error?: boolean) => void,
): Promise<boolean> {
  if (section === 'settings') {
    const prefs = await api('preferences');
    host.innerHTML = ui`<header class="admin-heading"><div><h1>Personal preferences</h1><p>These settings affect only your account.</p></div></header><form class="panel" id="preferences"><div class="field"><label for="locale">Interface language</label><select id="locale" name="locale"><option value="en-US" ${prefs.locale === 'en-US' ? 'selected' : ''}>English</option><option value="es-MX" ${prefs.locale === 'es-MX' ? 'selected' : ''}>Español</option></select></div><div class="field"><label for="encouragement">Daily encouragement</label><select id="encouragement" name="encouragement">${['shown', 'minimized', 'disabled'].map((v) => ui`<option value="${v}" ${prefs.encouragement === v ? 'selected' : ''}>${h(t(v))}</option>`).join('')}</select></div><button class="btn" type="submit">Save personal preferences</button></form>${['owner', 'godmin'].includes(role) ? ui`<section class="panel"><h2>AI Connections</h2><p>Connect an eligible ChatGPT or Claude account with limited permissions.</p><a class="btn light" href="/admin/connections">Review AI Connections</a></section>` : ''}`;
    host.querySelector('form')!.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api(
          'preferences',
          'POST',
          Object.fromEntries(new FormData(e.currentTarget as HTMLFormElement)),
        );
        location.reload();
      } catch (error) {
        notify((error as Error).message, true);
      }
    });
    return true;
  }
  if (section === 'creative') {
    const render = async () => {
      const data = await api('companion');
      host.innerHTML = ui`<header class="admin-heading"><div><h1>Creative Spark</h1><p>A practical starting point for your next workshop. Review and adapt every idea.</p></div></header>${data.idea ? ideaView(data.idea) : ui`<p class="panel">${t('No idea selected. Restore a dismissed idea below.')}</p>`}<section class="panel"><h2>Saved ideas</h2><div class="saved-ideas">${
        data.preferences
          .filter((p: any) => p.saved)
          .map((p: any) => {
            const i = data.library.find((i: any) => i.id === p.idea_id);
            return i
              ? ui`<button class="btn light" data-preview-idea="${h(i.id)}">${h(i.title)}</button>`
              : '';
          })
          .join('') || ui`<p>${t('Save an idea to find it here later.')}</p>`
      }</div></section><details class="panel"><summary>Dismissed ideas</summary>${data.preferences
        .filter((p: any) => p.dismissed)
        .map((p: any) => {
          const i = data.library.find((i: any) => i.id === p.idea_id);
          return ui`<p>${h(i?.title)} <button class="btn small light" data-spark="restore" data-idea="${h(p.idea_id)}">${t('Restore')}</button></p>`;
        })
        .join(
          '',
        )}</details><section class="panel"><h2>Optional AI and trends</h2><p>No separately authorized AI API or budget is configured. No paid generation runs here.</p><p>These suggestions are curated, evergreen or seasonal. They are not claims of current popularity.</p><p>Use age range, duration, available materials, theme and budget when requesting additional ideas from a separately connected assistant. Review safety, costs and instructions before use.</p></section>`;
      host.querySelectorAll<HTMLButtonElement>('[data-preview-idea]').forEach((b) =>
        b.addEventListener('click', () => {
          host.querySelector('.spark-idea')!.outerHTML = ideaView(
            data.library.find((i: any) => i.id === b.dataset.previewIdea),
          );
          host.querySelector('.spark-idea')!.scrollIntoView({ block: 'start' });
        }),
      );
    };
    host.addEventListener('click', async (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-spark]');
      if (!b) return;
      b.disabled = true;
      try {
        const action = b.dataset.spark!,
          id = b.dataset.idea;
        if (action === 'draft') {
          const result = await api(ui`companion/${id}/draft`, 'POST', {});
          notify(
            t('Workshop draft prepared. Review its content, price and capacity before publishing.'),
          );
          location.assign(ui`/admin/workshops?edit=${encodeURIComponent(result.id)}`);
          return;
        }
        if (action === 'another') await api('companion/another', 'POST', {});
        else {
          await api(ui`companion/${id}/${action}`, 'POST', {});
        }
        await render();
      } catch (error) {
        notify((error as Error).message, true);
      } finally {
        b.disabled = false;
      }
    });
    await render();
    return true;
  }
  if (section === 'activity') {
    const load = async (params: URLSearchParams = new URLSearchParams()) => {
      const data = await api('activity?' + params);
      const labels: Record<string, string> = {
        request: 'Request denied',
        workshop: 'Workshop updated',
        session: 'Class date updated',
        content: 'Website content published',
        setup: 'Business setup saved',
        team: 'Team access changed',
        media: 'Image library changed',
        translation: 'Translation updated',
        idea: 'Creative idea updated',
        preferences: 'Personal preferences saved',
        payment: 'Payment verification',
        refund: 'Refund update',
        places: 'Selected places cancelled',
        registration: 'Registration review',
        privacy: 'Privacy review recorded',
        notification: 'Notification follow-up',
        attendance: 'Attendance updated',
        mcp: 'AI connection activity',
        scheduled: 'Scheduled processing completed',
      };
      const label = (action: string) => t(labels[action.split('.')[0]!] || 'System activity');
      host.innerHTML = ui`<header class="admin-heading"><div><h1>Activity History</h1><p>Important application actions. Cloudflare Access maintains separate sign-in records.</p></div></header><form class="panel toolbar" id="activity-filter"><div class="field"><label for="actor">Person</label><select id="actor" name="actor"><option value="">${t('All people')}</option>${data.actors.map((a: any) => ui`<option value="${h(a.id)}" ${params.get('actor') === a.id ? 'selected' : ''}>${h(a.name)}</option>`).join('')}</select></div><div class="field"><label for="category">Category</label><select name="category" id="category"><option value="">${t('All categories')}</option>${Object.keys(
        labels,
      )
        .map(
          (k) =>
            ui`<option value="${k}" ${params.get('category') === k ? 'selected' : ''}>${h(label(k))}</option>`,
        )
        .join(
          '',
        )}</select></div><div class="field"><label for="from">From</label><input type="date" id="from" name="from"/></div><div class="field"><label for="to">Through</label><input type="date" id="to" name="to"/></div><button type="submit" class="btn small">Filter activity</button></form><ol class="activity-list">${data.events.map((event: any) => ui`<li><strong>${h(label(event.action))}</strong><p>${h(event.actor_name || t(event.actor_role))} · ${h(t(event.source))} · ${h(t(event.outcome))}</p><time datetime="${new Date(event.created_at * 1000).toISOString()}">${h(new Intl.DateTimeFormat(locale, { timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'short' }).format(event.created_at * 1000))}</time>${recordLink(event)}${role === 'godmin' ? ui`<details><summary>${t('Technical details')}</summary><code>${h(event.action)} · ${h(event.entity_id)} · ${h(event.correlation_id)} ${h(event.tool_name)}</code></details>` : ''}</li>`).join('') || ui`<li>${t('No activity matches these filters.')}</li>`}</ol>${data.hasMore ? ui`<button class="btn light" id="activity-next">${t('Older activity')}</button>` : ''}<p class="muted">${t('Application audit records are append-only. Review restricted archival after 365 days; no ordinary edit or delete action is available.')}</p>`;
      host.querySelector('form')!.addEventListener('submit', (e) => {
        e.preventDefault();
        const values = Object.fromEntries(new FormData(e.currentTarget as HTMLFormElement)),
          p = new URLSearchParams({
            actor: String(values.actor),
            category: String(values.category),
          });
        if (values.from) p.set('from', String(values.from));
        if (values.to) p.set('to', String(values.to));
        load(p).catch((error) => notify(error.message, true));
      });
      host.querySelector('#activity-next')?.addEventListener('click', () => {
        const p = new URLSearchParams(params);
        p.set('before', data.next.before);
        p.set('cursor', data.next.cursor);
        load(p).catch((error) => notify(error.message, true));
      });
    };
    await load();
    return true;
  }
  if (section === 'connections') {
    const data = await api('connections');
    host.innerHTML = ui`<header class="admin-heading"><div><h1>AI Connections</h1><p>Optional access for an eligible ChatGPT or Claude account.</p></div></header><section class="panel"><h2>${t(data.enabled ? 'Available for connection testing' : 'Connection testing is disabled')}</h2><p>Account eligibility and workspace restrictions differ. A personal chat subscription does not provide API credits.</p><p>Client compatibility has not been verified in ChatGPT or Claude. Configuration alone is not a connected account.</p>${data.enabled ? ui`<label for="connection-url">${t('MCP server URL')}</label><input id="connection-url" readonly value="${h(data.url)}"/>` : ''}<p>Available scopes: read workshops, schedules and aggregate statistics; optional draft writing. No children’s records, payments, role changes, policy adoption or automatic publication.</p></section><section class="panel"><h2>Authorized connections</h2>${data.grants.map((g: any) => ui`<div class="session-row"><div><strong>${h(g.client_name)}</strong><p>${h(g.scopes)} · ${h(t(g.revoked_at ? 'revoked' : 'active'))}</p></div>${g.revoked_at ? '' : ui`<button class="btn small light" data-revoke="${h(g.id)}">${t('Disconnect')}</button>`}</div>`).join('') || ui`<p>${t('No AI client has been authorized.')}</p>`}</section><section class="panel"><h2>${t('Draft requests awaiting your review')}</h2>${data.proposals.map((p: any) => ui`<article class="panel"><h3>${h(t(p.tool_name))}</h3><p>${h(p.command.data?.name ?? p.command.data?.value?.name ?? p.command.route)}</p><details><summary>${t('Review proposed content')}</summary>${proposalView(p.command)}${role === 'godmin' ? ui`<pre class="proposed-content">${h(JSON.stringify(p.command.data, null, 2))}</pre>` : ''}</details><button class="btn small" data-apply-proposal="${h(p.id)}">${t('Apply this draft request')}</button><button class="btn small light" data-reject-proposal="${h(p.id)}">${t('Reject request')}</button></article>`).join('') || ui`<p>${t('No draft requests are awaiting review.')}</p>`}</section><details class="panel"><summary>Client configuration</summary><p>Copy the exact OAuth redirect URL from the client’s connection settings. An owner or Godmin can register that redirect here. The person connecting still signs in and explicitly approves limited access.</p><form id="mcp-client"><div class="field"><label for="client-name">Client</label><select id="client-name" name="name"><option>ChatGPT</option><option>Claude</option></select></div><div class="field"><label for="redirect-uri">Exact HTTPS redirect URL</label><input id="redirect-uri" name="redirectUri" type="url" required/></div><button class="btn" type="submit">Register client configuration</button></form><div id="client-result" role="status"></div></details>`;
    host.querySelectorAll<HTMLButtonElement>('[data-apply-proposal]').forEach((b) =>
      b.addEventListener('click', async () => {
        if (!confirm(t('Apply this reviewed draft request? Nothing will be published.'))) return;
        b.disabled = true;
        try {
          await api('connections/proposals/' + b.dataset.applyProposal + '/apply', 'POST', {
            confirm: true,
          });
          notify(t('Draft request applied. Review it in Workshops.'));
          await renderExtra(section, role, host, api, notify);
        } catch (error) {
          notify((error as Error).message, true);
        } finally {
          b.disabled = false;
        }
      }),
    );
    host.querySelectorAll<HTMLButtonElement>('[data-reject-proposal]').forEach((b) =>
      b.addEventListener('click', async () => {
        try {
          await api('connections/proposals/' + b.dataset.rejectProposal + '/reject', 'POST', {});
          await renderExtra(section, role, host, api, notify);
        } catch (error) {
          notify((error as Error).message, true);
        }
      }),
    );
    host.querySelectorAll<HTMLButtonElement>('[data-revoke]').forEach((b) =>
      b.addEventListener('click', async () => {
        try {
          await api('connections/' + b.dataset.revoke + '/revoke', 'POST', {});
          await renderExtra(section, role, host, api, notify);
        } catch (error) {
          notify((error as Error).message, true);
        }
      }),
    );
    host.querySelector('form')!.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const result = await api(
          'connections/clients',
          'POST',
          Object.fromEntries(new FormData(e.currentTarget as HTMLFormElement)),
        );
        host.querySelector('#client-result')!.textContent =
          t('Client ID:') +
          ' ' +
          result.id +
          '. ' +
          t('Configuration saved. No account is connected yet.');
      } catch (error) {
        notify((error as Error).message, true);
      }
    });
    return true;
  }
  return false;
}
