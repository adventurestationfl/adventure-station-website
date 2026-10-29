export {};
const drawer = document.querySelector<HTMLDialogElement>('#staff-drawer')!;
const trigger = document.querySelector<HTMLButtonElement>('.admin-menu-toggle')!;
const closeButton = document.querySelector<HTMLButtonElement>('[data-close-navigation]')!;
const content = document.querySelector<HTMLElement>('#navigation-content')!;
const desktop = document.querySelector<HTMLElement>('#desktop-navigation-slot')!;
const mobile = document.querySelector<HTMLElement>('#drawer-navigation-slot')!;
const narrow = matchMedia('(max-width:960px)');
let restoreFocus = true;
function dismiss(restore = true) {
  restoreFocus = restore;
  if (drawer.open) drawer.close();
}
function sync() {
  const focused = document.activeElement as HTMLElement | null;
  if (narrow.matches) {
    mobile.append(content);
    trigger.hidden = false;
    if (focused && content.contains(focused)) trigger.focus();
  } else {
    const wasOpen = drawer.open;
    dismiss(false);
    desktop.append(content);
    trigger.hidden = true;
    if (wasOpen)
      (
        content.querySelector<HTMLElement>('[aria-current="page"]') ??
        content.querySelector<HTMLElement>('a')
      )?.focus();
  }
}
trigger.addEventListener('click', () => {
  if (!narrow.matches || drawer.open) return;
  restoreFocus = true;
  drawer.showModal();
  trigger.setAttribute('aria-expanded', 'true');
  document.documentElement.classList.add('navigation-open');
  closeButton.focus();
});
drawer.addEventListener('close', () => {
  trigger.setAttribute('aria-expanded', 'false');
  document.documentElement.classList.remove('navigation-open');
  if (restoreFocus && narrow.matches) trigger.focus({ preventScroll: true });
});
drawer.addEventListener('cancel', (event) => {
  event.preventDefault();
  dismiss();
});
drawer.addEventListener('keydown', (event) => {
  if (event.key !== 'Tab' || !drawer.open) return;
  const controls = [
    ...drawer.querySelectorAll<HTMLElement>(
      'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
    ),
  ].filter(
    (element) =>
      element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden',
  );
  const first = controls[0],
    last = controls.at(-1),
    active = document.activeElement;
  if (event.shiftKey && (active === first || !drawer.contains(active))) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && (active === last || !drawer.contains(active))) {
    event.preventDefault();
    first?.focus();
  }
});
closeButton.addEventListener('click', () => dismiss());
let backdropDown = false;
const outside = (event: PointerEvent) => {
  const rect = drawer.getBoundingClientRect();
  return (
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  );
};
drawer.addEventListener('pointerdown', (event) => {
  backdropDown = event.target === drawer && outside(event);
});
drawer.addEventListener('pointerup', (event) => {
  if (backdropDown && event.target === drawer && outside(event)) dismiss();
  backdropDown = false;
});
content.addEventListener('click', (event) => {
  if ((event.target as HTMLElement).closest('a[href]') && drawer.open) dismiss(false);
});
narrow.addEventListener('change', sync);
sync();
