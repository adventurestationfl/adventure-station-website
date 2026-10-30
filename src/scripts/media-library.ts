import { createUI, localeOf, t as translate, errorMessage } from '../lib/i18n';
type Api = (path: string, method?: string, data?: unknown) => Promise<any>;
type Notify = (text: string, error?: boolean) => void;
const locale = localeOf(document.documentElement.lang),
  { ui } = createUI(locale),
  t = (v: string) => translate(v, locale);
const h = (v: unknown) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
const imageURL = (id: string) => `/api/admin/media/${encodeURIComponent(id)}/preview?w=480`;
const kinds: Record<string, string> = {
  previously_declared: 'Previous publication declaration',
  owner_created: 'Owner-created',
  licensed: 'Licensed',
  client_supplied: 'Client-supplied',
  ai_generated: 'AI-generated',
  pending: 'Permission pending',
  restricted: 'Restricted',
};
let modalCount = 0,
  bodyOverflow = '';
function modal(title: string, returnFocus?: HTMLElement) {
  const previous = returnFocus ?? (document.activeElement as HTMLElement | null),
    dialog = document.createElement('dialog');
  const previousImage = previous?.dataset.mediaId,
    previousDetails = previous?.dataset.pickerDetails;
  dialog.className = 'media-dialog';
  const label = 'media-modal-' + crypto.randomUUID();
  dialog.setAttribute('aria-labelledby', label);
  dialog.innerHTML = ui`<header class="media-dialog-heading"><h2 id="${label}">${h(t(title))}</h2><button class="btn small light" type="button" data-close>${t('Close')}</button></header><div class="media-dialog-body"></div>`;
  const body = dialog.querySelector<HTMLElement>('.media-dialog-body')!;
  dialog.querySelector('[data-close]')!.addEventListener('click', () => {
    if (dialog.dataset.busy !== 'true') dialog.close();
  });
  dialog.addEventListener('click', (e) => {
    if (e.target !== dialog || dialog.dataset.busy === 'true') return;
    const r = dialog.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
      dialog.close();
  });
  if (!modalCount++) {
    bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  document.body.append(dialog);
  dialog.showModal();
  dialog.addEventListener(
    'close',
    () => {
      dialog.remove();
      if (!--modalCount) document.body.style.overflow = bodyOverflow;
      // Awaiting picker callers re-enable their trigger in a promise finalizer.
      // Restore focus after that finalizer, including nested modal dismissal.
      requestAnimationFrame(() => {
        const target = previous?.isConnected
          ? previous
          : previousImage
            ? document.querySelector<HTMLElement>(`[data-media-id="${CSS.escape(previousImage)}"]`)
            : previousDetails
              ? document.querySelector<HTMLElement>(
                  `[data-picker-details="${CSS.escape(previousDetails)}"]`,
                )
              : null;
        if (target && !target.matches(':disabled')) target.focus({ preventScroll: true });
        else
          (
            document.querySelector(
              'dialog[open] input, dialog[open] button, #library-query',
            ) as HTMLElement | null
          )?.focus({ preventScroll: true });
      });
    },
    { once: true },
  );
  return { dialog, body };
}
function field(
  label: string,
  name: string,
  value: unknown = '',
  type = 'text',
  attrs = '',
  id = name,
) {
  return ui`<div class="field"><label for="${h(id)}">${h(t(label))}</label>${type === 'textarea' ? `<textarea id="${h(id)}" name="${h(name)}" ${attrs}>${h(value)}</textarea>` : `<input id="${h(id)}" name="${h(name)}" type="${type}" value="${h(value)}" ${attrs}/>`}</div>`;
}
async function guarded(
  button: HTMLButtonElement,
  action: () => Promise<void>,
  notify: Notify,
  disable = true,
) {
  if (button.dataset.pending === 'true') return;
  button.dataset.pending = 'true';
  if (disable) button.disabled = true;
  try {
    await action();
  } catch (e) {
    notify(e instanceof Error ? e.message : 'Please try again.', true);
  } finally {
    if (button.isConnected && disable) button.disabled = false;
    delete button.dataset.pending;
  }
}
const readableDate = (n: number) =>
  new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'America/Chicago' }).format(
    n * 1000,
  );
function tile(m: any, selected?: boolean) {
  return ui`<button type="button" class="media-choice" data-media-id="${h(m.id)}" ${selected === undefined ? 'aria-haspopup="dialog"' : `aria-pressed="${selected}"`}><img src="${imageURL(m.id)}" width="480" height="320" alt="" loading="lazy"/><span><strong>${h(m.title || m.filename)}</strong><small>${h(m.width)} × ${h(m.height)} · ${Math.ceil(m.bytes / 1024)} KB</small><small>${h(t(kinds[m.rights_kind] ?? 'Permission pending'))}${m.usage_count ? ' · ' + h(m.usage_count) + ' ' + t('references') : ''}</small></span></button>`;
}
type Adjust = { ratio: string; rotation: number; x: number; y: number };
type UploadItem = {
  file: File;
  key: string;
  title: string;
  alt: string;
  alt_es: string;
  adjust: Adjust;
  id?: string;
  error?: string;
};
async function dimensions(file: File) {
  if (file.size > 20000000) throw new Error('Choose an image up to 20 MB.');
  const bytes = new Uint8Array(await file.slice(0, 262144).arrayBuffer()),
    view = new DataView(bytes.buffer);
  let width = 0,
    height = 0;
  if (bytes[0] === 255 && bytes[1] === 216) {
    for (let at = 2; at + 9 < bytes.length;) {
      if (bytes[at] !== 255) break;
      const marker = bytes[at + 1]!,
        length = view.getUint16(at + 2);
      if (length < 2) break;
      if ([192, 193, 194].includes(marker)) {
        height = view.getUint16(at + 5);
        width = view.getUint16(at + 7);
        break;
      }
      at += length + 2;
    }
  } else if (
    bytes.length >= 24 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)
  ) {
    width = view.getUint32(16);
    height = view.getUint32(20);
  } else if (
    bytes.length >= 30 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  ) {
    const kind = String.fromCharCode(...bytes.slice(12, 16));
    if (kind === 'VP8X') {
      width = 1 + bytes[24]! + (bytes[25]! << 8) + (bytes[26]! << 16);
      height = 1 + bytes[27]! + (bytes[28]! << 8) + (bytes[29]! << 16);
    } else if (kind === 'VP8 ') {
      width = view.getUint16(26, true) & 16383;
      height = view.getUint16(28, true) & 16383;
    } else if (kind === 'VP8L' && bytes[20] === 47) {
      const bits = view.getUint32(21, true);
      width = 1 + (bits & 16383);
      height = 1 + ((bits >>> 14) & 16383);
    }
  }
  if (!width || !height) throw new Error('Choose a standard JPEG, PNG or WebP image.');
  if (width > 4096 || height > 4096 || width * height > 16000000)
    throw new Error('Choose a valid image no larger than 4096 × 4096 pixels.');
  return { width, height };
}
function imageCanvas(bitmap: ImageBitmap, a: Adjust, width: number) {
  const rotated = document.createElement('canvas'),
    odd = a.rotation % 180 !== 0;
  rotated.width = odd ? bitmap.height : bitmap.width;
  rotated.height = odd ? bitmap.width : bitmap.height;
  const r = rotated.getContext('2d')!;
  r.fillStyle = 'white';
  r.fillRect(0, 0, rotated.width, rotated.height);
  r.translate(rotated.width / 2, rotated.height / 2);
  r.rotate((a.rotation * Math.PI) / 180);
  r.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
  let cropW = rotated.width,
    cropH = rotated.height;
  if (a.ratio !== 'original') {
    const ratio = Number(a.ratio.split(':')[0]) / Number(a.ratio.split(':')[1]);
    if (cropW / cropH > ratio) cropW = cropH * ratio;
    else cropH = cropW / ratio;
  }
  const x = ((rotated.width - cropW) * a.x) / 100,
    y = ((rotated.height - cropH) * a.y) / 100,
    scale = Math.min(1, width / cropW, 4096 / cropH);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(cropW * scale));
  canvas.height = Math.max(1, Math.round(cropH * scale));
  canvas
    .getContext('2d')!
    .drawImage(rotated, x, y, cropW, cropH, 0, 0, canvas.width, canvas.height);
  rotated.width = 0;
  rotated.height = 0;
  return canvas;
}
async function adjustImage(item: UploadItem, returnFocus: HTMLElement) {
  await dimensions(item.file);
  const bitmap = await createImageBitmap(item.file),
    { dialog, body } = modal('Adjust image', returnFocus);
  let a = { ...item.adjust };
  body.innerHTML = ui`<p>These changes apply to the upload. Your original file stays unchanged.</p><div class="media-crop-preview"></div><form id="media-adjust"><div class="form-grid"><div class="field"><label for="crop-ratio">Crop</label><select id="crop-ratio"><option value="original">${t('Original proportions')}</option><option value="1:1">${t('Square')}</option><option value="4:3">${t('Landscape')}</option><option value="3:4">${t('Portrait')}</option></select></div><div class="field"><label for="crop-rotation">Rotation</label><select id="crop-rotation">${[0, 90, 180, 270].map((n) => `<option value="${n}">${n}°</option>`).join('')}</select></div></div>${field('Horizontal crop position', 'crop-x', a.x, 'range', 'min="0" max="100"')}${field('Vertical crop position', 'crop-y', a.y, 'range', 'min="0" max="100"')}<button class="btn" type="submit">Keep adjustment</button></form>`;
  const ratio = body.querySelector<HTMLSelectElement>('#crop-ratio')!,
    rotation = body.querySelector<HTMLSelectElement>('#crop-rotation')!;
  ratio.value = a.ratio;
  rotation.value = String(a.rotation);
  const redraw = () => {
    a = {
      ratio: ratio.value,
      rotation: Number(rotation.value),
      x: Number(body.querySelector<HTMLInputElement>('#crop-x')!.value),
      y: Number(body.querySelector<HTMLInputElement>('#crop-y')!.value),
    };
    body.querySelector('.media-crop-preview')!.replaceChildren(imageCanvas(bitmap, a, 720));
  };
  body.querySelector('form')!.addEventListener('input', redraw);
  body.querySelector('form')!.addEventListener('submit', (e) => {
    e.preventDefault();
    item.adjust = a;
    dialog.close();
  });
  dialog.addEventListener('close', () => bitmap.close(), { once: true });
  redraw();
}
function uploadRequest(payload: FormData, progress: (value: number) => void) {
  return new Promise<any>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/admin/media');
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
    xhr.timeout = 60000;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) progress(e.loaded / e.total);
    };
    xhr.onload = () => {
      try {
        const result = JSON.parse(xhr.responseText);
        if (xhr.status < 200 || xhr.status >= 300)
          throw new Error(
            xhr.status === 401
              ? 'Your sign-in has ended. Sign in again before saving.'
              : result.error || 'Please try again.',
          );
        resolve(result);
      } catch (e) {
        reject(e);
      }
    };
    xhr.onerror = xhr.ontimeout = () =>
      reject(new Error('Upload could not be confirmed. Retry uses the same upload reference.'));
    xhr.send(payload);
  });
}
export async function uploadImages(
  _api: Api,
  notify: Notify,
  onUploaded: (ids: string[]) => Promise<void> | void,
) {
  const { dialog, body } = modal('Add images');
  let items: UploadItem[] = [],
    busy = false;
  body.innerHTML = ui`<form id="media-upload"><p>Choose non-identifying JPEG, PNG or WebP images. Optimized copies are stored; location metadata is removed. Identifiable child photos remain deferred.</p><label class="media-drop" for="media-files"><strong>Choose files or drop them here</strong><span>Up to 8 images, 20 MB each, 4096 × 4096 pixels.</span><input id="media-files" type="file" accept="image/jpeg,image/png,image/webp" multiple/></label><div id="media-upload-items"></div><div class="field"><label for="upload-rights">Image rights</label><select id="upload-rights"><option value="pending">${t('Permission pending')}</option>${Object.entries(
    kinds,
  )
    .filter(([k]) => !['pending', 'restricted', 'previously_declared'].includes(k))
    .map(([k, v]) => `<option value="${k}">${h(t(v))}</option>`)
    .join(
      '',
    )}</select></div><label class="check"><input id="upload-publish" type="checkbox"/>${t('I confirm permission to use these images publicly.')}</label><label class="check"><input id="upload-non-identifying" type="checkbox" required/>${t('These images do not identify a child.')}</label><p class="muted">A rights label is a recordkeeping aid, not proof of exclusive ownership. Pending images stay private.</p><progress id="media-progress" max="1" value="0" aria-label="${t('Upload progress')}"></progress><p id="media-upload-status" role="status" aria-live="polite"></p><button class="btn" type="submit">Upload images</button></form>`;
  const form = body.querySelector<HTMLFormElement>('form')!,
    list = body.querySelector<HTMLElement>('#media-upload-items')!,
    input = body.querySelector<HTMLInputElement>('#media-files')!,
    status = body.querySelector<HTMLElement>('#media-upload-status')!,
    progress = body.querySelector<HTMLProgressElement>('#media-progress')!;
  const sync = () => {
    list.querySelectorAll<HTMLElement>('[data-upload-index]').forEach((row) => {
      const item = items[Number(row.dataset.uploadIndex)]!;
      for (const key of ['title', 'alt', 'alt_es'] as const)
        item[key] = row.querySelector<HTMLInputElement>(`[name=${key}]`)!.value;
    });
  };
  const draw = () => {
    list.innerHTML = items
      .map(
        (item, i) =>
          ui`<fieldset data-upload-index="${i}" ${item.id ? 'disabled' : ''}><legend>${h(item.file.name)}</legend>${field('Image title', 'title', item.title, 'text', 'maxlength="160"', 'upload-' + i + '-title')}${field('English image description', 'alt', item.alt, 'text', 'required maxlength="300"', 'upload-' + i + '-alt')}${field('Spanish image description', 'alt_es', item.alt_es, 'text', 'maxlength="300"', 'upload-' + i + '-alt_es')}<button class="btn small light" type="button" data-adjust="${i}" ${item.id ? 'disabled' : ''}>Adjust image</button>${item.id ? ui`<p>Uploaded</p>` : item.error ? ui`<p role="alert">${h(errorMessage(item.error, locale))}</p>` : ''}</fieldset>`,
      )
      .join('');
    list.querySelectorAll<HTMLButtonElement>('[data-adjust]').forEach((b) =>
      b.addEventListener('click', () =>
        guarded(
          b,
          async () => {
            sync();
            await adjustImage(items[Number(b.dataset.adjust)]!, b);
          },
          notify,
        ),
      ),
    );
  };
  const add = async (files: File[]) => {
    if (busy) return;
    if (items.length + files.length > 8) throw new Error('Choose up to 8 images at a time.');
    sync();
    for (const file of files) {
      await dimensions(file);
      items.push({
        file,
        key: crypto.randomUUID(),
        title: file.name.replace(/\.[^.]+$/, ''),
        alt: '',
        alt_es: '',
        adjust: { ratio: 'original', rotation: 0, x: 50, y: 50 },
      });
    }
    draw();
  };
  input.addEventListener('change', () =>
    add([...(input.files ?? [])]).catch((e) => {
      status.textContent = errorMessage(e.message, locale);
    }),
  );
  const drop = body.querySelector<HTMLElement>('.media-drop')!;
  drop.addEventListener('dragover', (e) => {
    e.preventDefault();
    drop.classList.add('dragging');
  });
  drop.addEventListener('dragleave', () => drop.classList.remove('dragging'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('dragging');
    add([...(e.dataTransfer?.files ?? [])]).catch((e) => {
      status.textContent = errorMessage(e.message, locale);
    });
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (busy || !form.reportValidity()) return;
    sync();
    const button = form.querySelector<HTMLButtonElement>('[type=submit]')!;
    void guarded(
      button,
      async () => {
        if (!items.length) throw new Error('Choose an image.');
        const publish = body.querySelector<HTMLInputElement>('#upload-publish')!.checked,
          kind = body.querySelector<HTMLSelectElement>('#upload-rights')!.value;
        if (publish && (kind === 'pending' || items.some((i) => !i.alt_es.trim())))
          throw new Error(
            'Choose the rights status and add both image descriptions before public use.',
          );
        busy = true;
        dialog.dataset.busy = 'true';
        const controls = [
          ...form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>(
            'input,select,button',
          ),
        ].map((n) => ({ n, disabled: n.disabled }));
        controls.forEach(({ n }) => (n.disabled = true));
        dialog.querySelector<HTMLButtonElement>('[data-close]')!.disabled = true;
        const ids: string[] = [];
        try {
          for (const [i, item] of items.entries()) {
            if (item.id) {
              ids.push(item.id);
              continue;
            }
            item.error = undefined;
            status.textContent = `${t('Preparing image')} ${i + 1} / ${items.length}`;
            const bitmap = await createImageBitmap(item.file);
            try {
              const payload = new FormData();
              for (const key of ['title', 'alt', 'alt_es'] as const) payload.set(key, item[key]);
              payload.set('publication_allowed', String(publish));
              payload.set('rights', String(publish));
              payload.set('rights_kind', kind);
              payload.set('non_identifying', 'true');
              payload.set('upload_key', item.key);
              for (const width of [1600, 960, 480]) {
                const canvas = imageCanvas(bitmap, item.adjust, width),
                  blob = await new Promise<Blob>((resolve, reject) =>
                    canvas.toBlob(
                      (b) => (b ? resolve(b) : reject(new Error('Could not prepare this image.'))),
                      'image/jpeg',
                      0.84,
                    ),
                  );
                canvas.width = 0;
                canvas.height = 0;
                payload.set(String(width), blob, width + '.jpg');
              }
              status.textContent = `${t('Uploading image')} ${i + 1} / ${items.length}`;
              const result = await uploadRequest(payload, (n) => {
                progress.value = (i + n) / items.length;
              });
              item.id = result.id;
              ids.push(result.id);
            } catch (e) {
              item.error = (e as Error).message;
              draw();
              throw e;
            } finally {
              bitmap.close();
            }
          }
          status.textContent = t('Images uploaded.');
          await onUploaded(ids);
          dialog.close();
          notify('Images uploaded.');
        } finally {
          busy = false;
          dialog.dataset.busy = 'false';
          controls.forEach(({ n, disabled }) => {
            if (n.isConnected)
              n.disabled =
                disabled ||
                !!items[Number(n.closest<HTMLElement>('[data-upload-index]')?.dataset.uploadIndex)]
                  ?.id;
          });
          if (dialog.isConnected)
            dialog.querySelector<HTMLButtonElement>('[data-close]')!.disabled = false;
        }
      },
      (message, error) => {
        status.textContent = errorMessage(message, locale);
        if (error) status.setAttribute('role', 'alert');
      },
    );
  });
  dialog.addEventListener('cancel', (e) => {
    if (busy) e.preventDefault();
  });
}

export async function chooseMedia(
  api: Api,
  notify: Notify,
  options: {
    multiple?: boolean;
    selected?: string[];
    publicOnly?: boolean;
    returnFocus?: HTMLElement;
  } = {},
) {
  const { dialog, body } = modal(
      options.multiple ? 'Choose gallery images' : 'Choose an image',
      options.returnFocus,
    ),
    selected = new Set(options.selected ?? []);
  let offset = 0,
    records: any[] = [];
  body.innerHTML = ui`<div class="media-toolbar"><form id="picker-search" class="media-search"><label for="picker-query">Search images</label><div class="inline-actions"><input id="picker-query" type="search" maxlength="100"/><button class="btn small light" type="submit">Search</button></div></form><button class="btn small light" id="picker-upload" type="button">Upload new images</button></div><p class="muted">Selecting an image reuses it. Your editor stays open.</p><div class="media-grid media-picker-grid"></div><p id="picker-status" role="status"></p><div class="media-picker-footer"><div class="inline-actions"><button class="btn small light" type="button" id="picker-prev">Previous</button><button class="btn small light" type="button" id="picker-next">Next</button></div><button class="btn" type="button" id="picker-use">Use selected images</button></div>`;
  const grid = body.querySelector<HTMLElement>('.media-grid')!,
    query = body.querySelector<HTMLInputElement>('#picker-query')!,
    status = body.querySelector<HTMLElement>('#picker-status')!;
  let applied = false;
  const render = () => {
    grid.innerHTML =
      records
        .map(
          (m) =>
            `<article class="media-picker-entry">${tile(m, selected.has(m.id))}<button class="btn small light" type="button" data-picker-details="${h(m.id)}">${h(t('Image details'))}</button></article>`,
        )
        .join('') || ui`<p>No images match this search.</p>`;
    status.textContent = `${selected.size} ${t('selected')}`;
    grid.querySelectorAll<HTMLButtonElement>('[data-picker-details]').forEach((b) =>
      b.addEventListener(
        'click',
        () =>
          void guarded(
            b,
            () =>
              imageDetails(
                records.find((m) => m.id === b.dataset.pickerDetails),
                api,
                notify,
                'manager',
                load,
                b,
              ),
            notify,
          ),
      ),
    );
    grid.querySelectorAll<HTMLButtonElement>('[data-media-id]').forEach((b) =>
      b.addEventListener('click', () => {
        const id = b.dataset.mediaId!;
        if (selected.has(id)) selected.delete(id);
        else {
          if (!options.multiple) selected.clear();
          if (selected.size >= 12) {
            notify('Choose up to 12 gallery images.', true);
            return;
          }
          selected.add(id);
        }
        render();
        grid.querySelector<HTMLElement>(`[data-media-id="${id}"]`)?.focus();
      }),
    );
  };
  let loadGeneration = 0;
  const load = async () => {
    const generation = ++loadGeneration;
    grid.setAttribute('aria-busy', 'true');
    try {
      const nextRecords = await api(
        `media?limit=60&offset=${offset}&q=${encodeURIComponent(query.value)}`,
      );
      if (generation !== loadGeneration || !body.isConnected) return;
      records = nextRecords;
      render();
      body.querySelector<HTMLButtonElement>('#picker-prev')!.disabled = offset === 0;
      body.querySelector<HTMLButtonElement>('#picker-next')!.disabled = records.length < 60;
    } finally {
      if (generation === loadGeneration) grid.setAttribute('aria-busy', 'false');
    }
  };
  body.querySelector('form')!.addEventListener('submit', (e) => {
    e.preventDefault();
    offset = 0;
    load().catch((e) => {
      status.textContent = errorMessage(e.message, locale);
    });
  });
  for (const [key, direction] of [
    ['picker-prev', -1],
    ['picker-next', 1],
  ] as const)
    body.querySelector<HTMLButtonElement>('#' + key)!.addEventListener(
      'click',
      (e) =>
        void guarded(
          e.currentTarget as HTMLButtonElement,
          async () => {
            offset = Math.max(0, offset + 60 * direction);
            await load();
          },
          notify,
        ),
    );
  body.querySelector('#picker-upload')!.addEventListener(
    'click',
    () =>
      void uploadImages(api, notify, async (ids) => {
        if (!options.multiple) selected.clear();
        for (const id of ids.slice(0, options.multiple ? 12 - selected.size : 1)) selected.add(id);
        offset = 0;
        await load();
      }),
  );
  body.querySelector<HTMLButtonElement>('#picker-use')!.addEventListener(
    'click',
    (e) =>
      void guarded(
        e.currentTarget as HTMLButtonElement,
        async () => {
          if (options.publicOnly) {
            const chosen = await Promise.all([...selected].map((id) => api('media/' + id)));
            if (
              chosen.some(
                (m) =>
                  !m.publication_allowed ||
                  ['pending', 'restricted'].includes(m.rights_kind) ||
                  m.deleted_at ||
                  m.purged_at,
              )
            )
              throw new Error(
                'Confirm publication permission in Image details before selecting this image.',
              );
          }
          applied = true;
          dialog.close();
        },
        (message) => {
          status.textContent = errorMessage(message, locale);
        },
      ),
  );
  const result = new Promise<string[] | null>((resolve) =>
    dialog.addEventListener('close', () => resolve(applied ? [...selected] : null), { once: true }),
  );
  // Dismissal must settle immediately, even if the initial image request is
  // slow. Otherwise a restored trigger can silently ignore an immediate reopen.
  void load().catch((e) => {
    if (body.isConnected) status.textContent = errorMessage(e.message, locale);
  });
  return result;
}

export function mediaPickerField(label: string, name: string, ids: string[], multiple = false) {
  return ui`<fieldset class="media-picker-field" data-media-field="${h(name)}" data-multiple="${multiple}"><legend>${h(t(label))}</legend><div class="media-field-values">${ids.map((id) => `<input type="hidden" name="${h(name)}" value="${h(id)}"/>`).join('')}</div><div class="media-field-preview">${ids.map((id) => `<img src="${imageURL(id)}" alt="" width="96" height="72"/>`).join('')}</div><div class="inline-actions"><button class="btn small light" type="button" data-choose-media>${h(t(multiple ? 'Choose gallery images' : 'Choose an image'))}</button><button class="btn small light" type="button" data-clear-media>Clear selection</button></div></fieldset>`;
}
export function installMediaPickerFields(form: HTMLElement, api: Api, notify: Notify) {
  form.querySelectorAll<HTMLElement>('[data-media-field]').forEach((field) => {
    const name = field.dataset.mediaField!,
      multiple = field.dataset.multiple === 'true',
      values = () =>
        [...field.querySelectorAll<HTMLInputElement>('input[type=hidden]')].map((n) => n.value);
    const set = (ids: string[]) => {
      field.querySelector('.media-field-values')!.innerHTML =
        ids.map((id) => `<input type="hidden" name="${h(name)}" value="${h(id)}"/>`).join('') ||
        (!multiple ? `<input type="hidden" name="${h(name)}" value=""/>` : '');
      field.querySelector('.media-field-preview')!.innerHTML = ids
        .map((id) => `<img src="${imageURL(id)}" alt="" width="96" height="72"/>`)
        .join('');
    };
    if (!values().length) set([]);
    field.querySelector<HTMLButtonElement>('[data-choose-media]')!.addEventListener(
      'click',
      (e) =>
        void guarded(
          e.currentTarget as HTMLButtonElement,
          async () => {
            const ids = await chooseMedia(api, notify, {
              multiple,
              selected: values(),
              publicOnly: true,
              returnFocus: field.querySelector<HTMLButtonElement>('[data-choose-media]')!,
            });
            if (ids) set(ids);
          },
          notify,
          false,
        ),
    );
    field.querySelector('[data-clear-media]')!.addEventListener('click', () => set([]));
  });
}

async function imageDetails(
  record: any,
  api: Api,
  notify: Notify,
  role: string,
  refresh: () => Promise<void>,
  returnFocus?: HTMLElement,
) {
  let m = record;
  const usage = await api(`media/${m.id}/usage`);
  const { dialog, body } = modal('Image details', returnFocus);
  body.innerHTML = ui`<div class="media-inspector"><div><img class="media-full-preview" src="/api/admin/media/${h(m.id)}/preview?w=1600" alt="${h(locale === 'es-MX' ? m.alt_es || m.alt : m.alt)}"/><p>${h(m.width)} × ${h(m.height)} · ${Math.ceil(m.bytes / 1024)} KB · ${readableDate(m.created_at)}</p><h3>Used here</h3><ul class="media-usage">${usage.map((u: any) => `<li>${h(t(u.kind === 'history' || u.kind === 'promotion_history' ? 'Saved version' : u.kind === 'website' ? 'Website content' : u.kind === 'promotion' ? 'Promotion' : 'Workshop'))}: ${h(u.label)}</li>`).join('') || ui`<li>Not currently referenced.</li>`}</ul></div><form id="media-details">${field('Image title', 'media-title', m.title || m.filename, 'text', 'maxlength="160"')}${field('English image description', 'media-alt', m.alt, 'textarea', 'required maxlength="300"')}${field('Spanish image description', 'media-alt-es', m.alt_es, 'textarea', 'maxlength="300"')}${field('English caption', 'media-caption', m.caption, 'textarea', 'maxlength="600"')}${field('Spanish caption', 'media-caption-es', m.caption_es, 'textarea', 'maxlength="600"')}<div class="field"><label for="media-rights">Image rights</label><select id="media-rights">${Object.entries(
    kinds,
  )
    .map(
      ([k, v]) =>
        `<option value="${k}" ${k === m.rights_kind ? 'selected' : ''}>${h(t(v))}</option>`,
    )
    .join(
      '',
    )}</select></div>${field('Rights reference or note', 'media-rights-note', m.rights_note, 'textarea', 'maxlength="600"')}<label class="check"><input id="media-public" type="checkbox" ${m.publication_allowed ? 'checked' : ''}/>${t('Allow public use')}</label><label class="check"><input id="media-rights-confirm" type="checkbox"/>${t('I confirm permission to use this image publicly.')}</label>${field('Horizontal focal point', 'media-focal-x', m.focal_x, 'range', 'min="0" max="100"')}${field('Vertical focal point', 'media-focal-y', m.focal_y, 'range', 'min="0" max="100"')}<p class="muted">The focal point guides cover crops. Rights changes apply to future image requests; downloaded copies cannot be recalled.</p><button class="btn" type="submit">Save image details</button><p id="media-detail-status" role="status"></p></form></div><div class="inline-actions media-destructive"><button class="btn small light" type="button" id="media-trash" ${usage.length ? 'disabled' : ''}>Move to trash</button>${role === 'owner' ? ui`<button class="btn small light" type="button" id="media-withdraw">Withdraw and erase image</button>` : ''}</div>`;
  const form = body.querySelector<HTMLFormElement>('form')!,
    status = body.querySelector<HTMLElement>('#media-detail-status')!;
  const preview = body.querySelector<HTMLImageElement>('.media-full-preview')!;
  preview.classList.add('media-focal-preview');
  const reflect = () => {
    const x = body.querySelector<HTMLInputElement>('#media-focal-x')!.value,
      y = body.querySelector<HTMLInputElement>('#media-focal-y')!.value;
    preview.style.objectPosition = `${x}% ${y}%`;
    body.querySelector<HTMLTextAreaElement>('#media-alt-es')!.required =
      body.querySelector<HTMLInputElement>('#media-public')!.checked &&
      body.querySelector<HTMLSelectElement>('#media-rights')!.value !== 'previously_declared';
  };
  form.addEventListener('input', reflect);
  reflect();
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    void guarded(
      form.querySelector<HTMLButtonElement>('[type=submit]')!,
      async () => {
        const text = (id: string) => (body.querySelector('#' + id) as HTMLInputElement).value;
        await api(`media/${m.id}`, 'POST', {
          revision: m.revision,
          title: text('media-title'),
          alt: text('media-alt'),
          alt_es: text('media-alt-es'),
          caption: text('media-caption'),
          caption_es: text('media-caption-es'),
          rights_kind: text('media-rights'),
          rights_note: text('media-rights-note'),
          publication_allowed: body.querySelector<HTMLInputElement>('#media-public')!.checked,
          rights: body.querySelector<HTMLInputElement>('#media-rights-confirm')!.checked,
          focal_x: Number(text('media-focal-x')),
          focal_y: Number(text('media-focal-y')),
        });
        status.textContent = t('Image details saved.');
        m = { ...m, revision: m.revision + 1 };
        await refresh();
      },
      (message, error) => {
        status.textContent = errorMessage(message, locale);
        if (error) status.setAttribute('role', 'alert');
      },
    );
  });
  body.querySelector<HTMLButtonElement>('#media-trash')!.addEventListener(
    'click',
    (e) =>
      void guarded(
        e.currentTarget as HTMLButtonElement,
        async () => {
          await api(`media/${m.id}`, 'DELETE', { revision: m.revision });
          dialog.close();
          notify('Image moved to trash. Restore it within 30 days.');
          await refresh();
        },
        notify,
      ),
  );
  body.querySelector<HTMLButtonElement>('#media-withdraw')?.addEventListener('click', (e) => {
    if (
      !confirm(
        t(
          'Withdraw this image immediately and erase its stored copies? Existing uses will stop showing this image. This cannot be undone.',
        ),
      )
    )
      return;
    void guarded(
      e.currentTarget as HTMLButtonElement,
      async () => {
        await api(`media/${m.id}/withdraw`, 'POST', { revision: m.revision });
        dialog.close();
        notify('Image withdrawn.');
        await refresh();
      },
      notify,
    );
  });
}
export async function renderMediaLibrary(
  host: HTMLElement,
  api: Api,
  notify: Notify,
  role: string,
) {
  let records: any[] = [],
    offset = 0,
    trash = false,
    view = 'grid';
  host.innerHTML = ui`<header class="admin-heading"><div><h1>Media Library</h1><p>Find, describe and reuse your creative images.</p></div><button class="btn small" id="library-upload" type="button">Add images</button></header><div class="panel media-toolbar"><form id="library-search" class="media-search"><label for="library-query">Search images</label><div class="inline-actions"><input id="library-query" type="search" maxlength="100"/><button class="btn small light" type="submit">Search</button></div></form><div class="field"><label for="library-filter">Rights status</label><select id="library-filter"><option value="">${t('All images')}</option>${Object.entries(
    kinds,
  )
    .map(([k, v]) => `<option value="${k}">${h(t(v))}</option>`)
    .join(
      '',
    )}</select></div><div class="field"><label for="library-sort">Sort images</label><select id="library-sort"><option value="newest">${t('Newest first')}</option><option value="oldest">${t('Oldest first')}</option><option value="name">${t('Name')}</option><option value="usage">${t('Usage')}</option></select></div><div class="inline-actions"><button class="btn small light" type="button" id="library-view">Compact list</button><button class="btn small light" type="button" id="library-trash">Trash</button></div></div><p id="library-status" role="status" aria-live="polite"></p><div id="library-records" class="media-grid media-library-grid"></div><div class="inline-actions"><button class="btn small light" type="button" id="library-prev">Previous</button><button class="btn small light" type="button" id="library-next">Next</button></div>`;
  const grid = host.querySelector<HTMLElement>('#library-records')!,
    status = host.querySelector<HTMLElement>('#library-status')!,
    query = host.querySelector<HTMLInputElement>('#library-query')!,
    filter = host.querySelector<HTMLSelectElement>('#library-filter')!,
    sort = host.querySelector<HTMLSelectElement>('#library-sort')!;
  const draw = () => {
    grid.classList.toggle('media-list-view', view === 'list');
    grid.innerHTML =
      records
        .map((m) =>
          trash
            ? ui`<article class="panel"><h2>${h(m.title || m.filename)}</h2><p>${t('Cleanup after')} ${readableDate(m.purge_after)}</p><button class="btn small light" type="button" data-restore="${h(m.id)}">Restore image</button></article>`
            : tile(m),
        )
        .join('') || ui`<p class="panel">No images match this search.</p>`;
    if (!trash)
      grid.querySelectorAll<HTMLButtonElement>('[data-media-id]').forEach((b) =>
        b.addEventListener(
          'click',
          () =>
            void guarded(
              b,
              () =>
                imageDetails(
                  records.find((m) => m.id === b.dataset.mediaId),
                  api,
                  notify,
                  role,
                  load,
                  b,
                ),
              notify,
            ),
        ),
      );
    grid.querySelectorAll<HTMLButtonElement>('[data-restore]').forEach((b) =>
      b.addEventListener(
        'click',
        () =>
          void guarded(
            b,
            async () => {
              const m = records.find((m) => m.id === b.dataset.restore);
              await api(`media/${m.id}/restore`, 'POST', { revision: m.revision });
              notify('Image restored.');
              await load();
            },
            notify,
          ),
      ),
    );
  };
  let loadGeneration = 0;
  const load = async () => {
    const generation = ++loadGeneration;
    grid.setAttribute('aria-busy', 'true');
    try {
      const nextRecords = await api(
        `media?limit=60&offset=${offset}&q=${encodeURIComponent(query.value)}&rights=${encodeURIComponent(filter.value)}&sort=${sort.value}&trash=${trash}`,
      );
      if (generation !== loadGeneration || !host.isConnected) return;
      records = nextRecords;
      draw();
      status.textContent = trash
        ? t('Unused images stay recoverable for 30 days. Cleanup is permanent after it starts.')
        : t('Only images with confirmed permission can be used publicly.');
      host.querySelector<HTMLButtonElement>('#library-prev')!.disabled = offset === 0;
      host.querySelector<HTMLButtonElement>('#library-next')!.disabled = records.length < 60;
    } finally {
      if (generation === loadGeneration) grid.setAttribute('aria-busy', 'false');
    }
  };
  host.querySelector('#library-upload')!.addEventListener(
    'click',
    () =>
      void uploadImages(api, notify, async () => {
        offset = 0;
        trash = false;
        query.value = '';
        filter.value = '';
        sort.value = 'newest';
        host.querySelector<HTMLButtonElement>('#library-trash')!.textContent = t('Trash');
        await load();
      }),
  );
  host.querySelector('form')!.addEventListener('submit', (e) => {
    e.preventDefault();
    offset = 0;
    load().catch((e) => notify(e.message, true));
  });
  for (const control of [filter, sort])
    control.addEventListener('change', () => {
      offset = 0;
      load().catch((e) => notify(e.message, true));
    });
  host.querySelector<HTMLButtonElement>('#library-view')!.addEventListener('click', (e) => {
    view = view === 'grid' ? 'list' : 'grid';
    (e.currentTarget as HTMLElement).textContent = t(
      view === 'grid' ? 'Compact list' : 'Gallery view',
    );
    draw();
  });
  host.querySelector<HTMLButtonElement>('#library-trash')!.addEventListener('click', (e) => {
    trash = !trash;
    offset = 0;
    (e.currentTarget as HTMLElement).textContent = t(trash ? 'Back to library' : 'Trash');
    load().catch((e) => notify(e.message, true));
  });
  for (const [id, direction] of [
    ['library-prev', -1],
    ['library-next', 1],
  ] as const)
    host.querySelector<HTMLButtonElement>('#' + id)!.addEventListener(
      'click',
      (e) =>
        void guarded(
          e.currentTarget as HTMLButtonElement,
          async () => {
            offset = Math.max(0, offset + 60 * direction);
            await load();
          },
          notify,
        ),
    );
  await load();
}
