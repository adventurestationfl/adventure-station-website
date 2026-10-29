// Move the original live cells into semantic list items, rather than cloning controls or
// making screen readers interpret a visually stacked table. Resize keeps input/listener state.
function recordLayout(table: HTMLTableElement) {
  const host = table.closest<HTMLElement>('[data-record-view]')!,
    threshold = Number(table.dataset.recordThreshold);
  const list = document.createElement('ol');
  list.className = 'record-list';
  list.setAttribute('role', 'list');
  list.setAttribute('aria-label', table.caption!.textContent!.trim());
  list.hidden = true;
  const labels = [...table.tHead!.rows[0]!.cells].map((cell) => cell.textContent!.trim());
  const records = [...table.tBodies[0]!.rows].map((row) => {
    const item = document.createElement('li');
    item.className = 'record-item';
    item.dataset.recordId = row.dataset.recordId;
    item.hidden = row.hidden;
    const details = document.createElement('dl');
    details.className = 'record-details';
    const slots = [...row.cells].map((cell, index) => {
      const slot = document.createElement(
        index === 0 || cell.hasAttribute('data-actions') ? 'div' : 'dd',
      );
      if (index === 0) {
        slot.className = 'record-primary';
        item.append(slot);
        item.append(details);
      } else if (cell.hasAttribute('data-actions')) {
        slot.className = 'record-actions';
        item.append(slot);
      } else {
        const field = document.createElement('div'),
          label = document.createElement('dt');
        label.textContent = labels[index]!;
        field.append(label, slot);
        details.append(field);
      }
      return { cell, slot };
    });
    list.append(item);
    return { row, item, slots };
  });
  host.append(list);
  let compact = false;
  const sync = () => {
    const next = host.clientWidth < threshold;
    if (next === compact) return;
    const focus = host.contains(document.activeElement)
      ? (document.activeElement as HTMLElement)
      : null;
    for (const record of records)
      for (const { cell, slot } of record.slots) {
        const source = next ? cell : slot,
          target = next ? slot : cell;
        target.append(...source.childNodes);
      }
    table.hidden = next;
    list.hidden = !next;
    host.classList.toggle('is-record-list', next);
    compact = next;
    if (focus?.isConnected) focus.focus({ preventScroll: true });
  };
  const resize = new ResizeObserver(sync);
  resize.observe(host);
  const hidden = new MutationObserver(() => {
    for (const { row, item } of records) item.hidden = row.hidden;
  });
  hidden.observe(table, { subtree: true, attributes: true, attributeFilter: ['hidden'] });
  sync();
  return () => {
    resize.disconnect();
    hidden.disconnect();
  };
}
function scrollTable(region: HTMLElement) {
  const sync = () => {
    const overflowing = region.scrollWidth > region.clientWidth + 1;
    region.classList.toggle('has-overflow', overflowing);
    region.classList.toggle(
      'at-scroll-end',
      region.scrollLeft + region.clientWidth >= region.scrollWidth - 2,
    );
    region.tabIndex = overflowing ? 0 : -1;
    const hint = region.parentElement!.querySelector<HTMLElement>('[data-scroll-hint]');
    if (hint) hint.hidden = !overflowing;
  };
  const resize = new ResizeObserver(sync);
  resize.observe(region);
  region.addEventListener('scroll', sync, { passive: true });
  sync();
  return () => {
    resize.disconnect();
    region.removeEventListener('scroll', sync);
  };
}
export function installRecordLayouts(root: HTMLElement) {
  const controllers = new Map<HTMLElement, () => void>();
  const scan = () => {
    for (const [element, dispose] of controllers)
      if (!root.contains(element)) {
        dispose();
        controllers.delete(element);
      }
    root.querySelectorAll<HTMLTableElement>('table[data-record-table]').forEach((table) => {
      if (!controllers.has(table)) controllers.set(table, recordLayout(table));
    });
    root.querySelectorAll<HTMLElement>('[data-scroll-table]').forEach((region) => {
      if (!controllers.has(region)) controllers.set(region, scrollTable(region));
    });
  };
  new MutationObserver(scan).observe(root, { childList: true, subtree: true });
  scan();
}
