import { t as translate, localeOf, errorMessage } from '../lib/i18n';
const locale = localeOf(document.documentElement.lang),
  t = (v: string) => translate(v, locale);
const form = document.querySelector<HTMLFormElement>('#registration-form');
if (form) {
  const quantity = form.querySelector<HTMLSelectElement>('#quantity')!,
    participants = form.querySelector('#participants')!,
    message = form.querySelector<HTMLElement>('#form-message')!;
  function renderChildren() {
    const old = [...participants.querySelectorAll('fieldset')].map((f) => ({
      name: (f.querySelector('[name="first_name"]') as HTMLInputElement).value,
      age: (f.querySelector('[name="age"]') as HTMLInputElement).value,
    }));
    participants.replaceChildren();
    for (let i = 0; i < Number(quantity.value); i++) {
      const group = document.createElement('fieldset'),
        legend = document.createElement('legend');
      legend.textContent = `${t('Child')} ${i + 1}`;
      group.append(legend);
      for (const [key, label, type] of [
        ['first_name', 'First name', 'text'],
        ['age', 'Age', 'number'],
      ]) {
        const field = document.createElement('div');
        field.className = 'field';
        const l = document.createElement('label'),
          input = document.createElement('input');
        input.id = `child-${i}-${key}`;
        input.name = key!;
        input.type = type!;
        input.required = true;
        l.htmlFor = input.id;
        l.textContent = t(label!);
        if (key === 'age') {
          input.min = form!.dataset.ageMin!;
          input.max = form!.dataset.ageMax!;
          input.value = old[i]?.age ?? '';
        } else {
          input.maxLength = 60;
          input.value = old[i]?.name ?? '';
        }
        field.append(l, input);
        group.append(field);
      }
      participants.append(group);
    }
  }
  if (locale === 'es-MX') {
    form.addEventListener(
      'invalid',
      (event) => {
        const input = event.target as HTMLInputElement;
        input.setCustomValidity(
          input.validity.valueMissing
            ? t('Please complete this field.')
            : input.validity.typeMismatch
              ? t('Enter a valid email address.')
              : t('Choose an allowed value.'),
        );
      },
      true,
    );
    form.addEventListener('input', (event) =>
      (event.target as HTMLInputElement).setCustomValidity?.(''),
    );
    form.addEventListener('change', (event) =>
      (event.target as HTMLInputElement).setCustomValidity?.(''),
    );
  }
  quantity.addEventListener('change', renderChildren);
  renderChildren();
  const key = `registration-intent-${form.dataset.session}`;
  let intent = sessionStorage.getItem(key) ?? crypto.randomUUID();
  sessionStorage.setItem(key, intent);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const button = form.querySelector<HTMLButtonElement>('button[type=submit]')!;
    button.disabled = true;
    message.className = 'notice';
    message.textContent = t('Reserving your places and preparing checkout…');
    const data = new FormData(form);
    const payload = {
      session_id: form.dataset.session,
      locale,
      policy_version: form.dataset.policyVersion,
      guardian_name: data.get('guardian_name'),
      guardian_email: data.get('guardian_email'),
      guardian_phone: data.get('guardian_phone'),
      participants: [...participants.querySelectorAll('fieldset')].map((f) => ({
        first_name: (f.querySelector('[name=first_name]') as HTMLInputElement).value,
        age: Number((f.querySelector('[name=age]') as HTMLInputElement).value),
      })),
      guardian_attestation: data.get('guardian_attestation') === 'on',
      policy_agreement: data.get('policy_agreement') === 'on',
      marketing_consent: data.get('marketing_consent') === 'on',
      photo_consent: data.get('photo_consent') === 'on',
    };
    try {
      const response = await fetch('/api/registrations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': intent,
          'Accept-Language': locale,
        },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(t(result.error));
      const target = new URL(result.checkout_url);
      if (target.hostname !== 'sandbox.square.link')
        throw new Error('The checkout address could not be verified.');
      sessionStorage.removeItem(key);
      window.location.assign(target.href);
    } catch (e) {
      message.className = 'notice error';
      message.textContent = errorMessage(
        e instanceof Error ? e.message : 'Please try again.',
        locale,
      );
      button.disabled = false;
    }
  });
}
