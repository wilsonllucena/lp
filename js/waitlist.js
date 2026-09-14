/**
 * CTA Garantir acesso — formulário curto e WhatsApp de vendas. Sem PIX.
 *
 * wa.me/5561985507287 com nome, e-mail, telefone e a linha de interesse.
 */
const SALES_WHATSAPP = '5561985507287';
const INTEREST_LINE = 'Tenho interesse em organizar minha equipe.';

const overlay = document.getElementById('waitlist');
const sheet = overlay.querySelector('.waitlist-sheet');
const form = document.getElementById('waitlist-form');
const formBanner = document.getElementById('waitlist-form-error');
const reopenBtn = document.getElementById('waitlist-reopen');

let lastOpener = null;
let lastWhatsAppUrl = '';

function isCoarseOrNarrow() {
  return window.matchMedia('(pointer: coarse)').matches
    || window.matchMedia('(max-width: 720px)').matches;
}

function showStep(name) {
  overlay.querySelectorAll('[data-step]').forEach((step) => {
    step.hidden = step.dataset.step !== name;
  });
  const heading = overlay.querySelector(`[data-step="${name}"] h2`);
  if (heading) sheet.setAttribute('aria-labelledby', heading.id);
  if (name === 'form') {
    if (!isCoarseOrNarrow()) field('name').focus();
    else sheet.focus();
    return;
  }
  const primary =
    overlay.querySelector(`[data-step="${name}"] .btn-primary`) ||
    overlay.querySelector(`[data-step="${name}"] input`) ||
    sheet;
  primary.focus();
}

function getFocusable() {
  const step = overlay.querySelector('[data-step]:not([hidden])');
  const nodes = [
    sheet.querySelector('.waitlist-close'),
    ...(step ? step.querySelectorAll('button, input, textarea, select') : []),
  ];
  return nodes.filter((el) => el && !el.disabled && !el.hidden);
}

function openWaitlist(opener) {
  lastOpener = opener || document.activeElement;
  form.reset();
  clearFieldErrors();
  lastWhatsAppUrl = '';
  overlay.hidden = false;
  document.body.classList.add('waitlist-lock');
  showStep('form');
}

function closeWaitlist() {
  overlay.hidden = true;
  document.body.classList.remove('waitlist-lock');
  if (lastOpener && typeof lastOpener.focus === 'function') lastOpener.focus();
}

function clearFieldErrors() {
  form.querySelectorAll('[data-error]').forEach((el) => {
    el.textContent = '';
  });
  form.querySelectorAll('input').forEach((input) => {
    input.removeAttribute('aria-invalid');
  });
  if (formBanner) {
    formBanner.hidden = true;
    formBanner.textContent = '';
  }
}

function field(name) {
  return form.elements.namedItem(name);
}

function setFieldError(name, message) {
  const input = field(name);
  const err = form.querySelector(`[data-error="${name}"]`);
  if (input) input.setAttribute('aria-invalid', 'true');
  if (err) err.textContent = message;
}

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

function formatPhone(value) {
  const d = digits(value).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validateForm() {
  clearFieldErrors();
  const name = field('name').value.trim();
  const email = field('email').value.trim();
  const phone = digits(field('phone').value);
  let ok = true;

  if (name.length < 2) {
    setFieldError('name', 'Escreva seu nome.');
    ok = false;
  }
  if (!validEmail(email)) {
    setFieldError('email', 'E-mail inválido.');
    ok = false;
  }
  if (phone.length < 10 || phone.length > 11) {
    setFieldError('phone', 'Telefone com DDD, só números.');
    ok = false;
  }
  return ok;
}

function buildWhatsAppUrl({ name, email, phone, church }) {
  const parts = [
    `Olá! Meu nome é ${name}.`,
    `E-mail: ${email}.`,
    `Telefone: ${phone}.`,
  ];
  if (church) parts.push(`Igreja: ${church}.`);
  parts.push(INTEREST_LINE);
  return `https://wa.me/${SALES_WHATSAPP}?text=${encodeURIComponent(parts.join(' '))}`;
}

function openWhatsApp(url) {
  lastWhatsAppUrl = url;
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) {
    window.location.assign(url);
    return false;
  }
  return true;
}

function submitWaitlist(event) {
  event.preventDefault();
  if (!validateForm()) return;

  const name = field('name').value.trim();
  const email = field('email').value.trim();
  const phone = formatPhone(field('phone').value);
  const church = field('church') ? field('church').value.trim() : '';
  const url = buildWhatsAppUrl({ name, email, phone, church });

  if (openWhatsApp(url)) showStep('sent');
}

document.querySelectorAll('[data-waitlist-open]').forEach((el) => {
  el.addEventListener('click', (event) => {
    event.preventDefault();
    openWaitlist(el);
  });
});

overlay.addEventListener('click', (event) => {
  if (event.target === overlay) closeWaitlist();
});

overlay.querySelectorAll('[data-waitlist-close]').forEach((el) => {
  el.addEventListener('click', closeWaitlist);
});

if (reopenBtn) {
  reopenBtn.addEventListener('click', () => {
    if (lastWhatsAppUrl) openWhatsApp(lastWhatsAppUrl);
  });
}

form.addEventListener('submit', submitWaitlist);

field('phone').addEventListener('input', () => {
  const phone = field('phone');
  const caretAtEnd = phone.selectionStart === phone.value.length;
  phone.value = formatPhone(phone.value);
  if (caretAtEnd) phone.setSelectionRange(phone.value.length, phone.value.length);
});

document.addEventListener('keydown', (event) => {
  if (overlay.hidden) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    closeWaitlist();
    return;
  }
  if (event.key !== 'Tab') return;
  const nodes = getFocusable();
  if (!nodes.length) return;
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});
