/**
 * Lista de espera — contrato Otto (COD-19), PIX na landing. Sem cartão, sem redirect.
 *
 * Otto: altere só WAITLIST_API_BASE se o host mudar.
 * Fallback local: http://127.0.0.1:8000
 *
 * POST {base}/api/v1/waitlist  JSON { name, email, phone }  phone dígitos 11999999999
 *   201 created e 200 pending-reuse — mesmo envelope data.{ id, status, amount, payment }
 *   409 { message, code: "waitlist_already_joined" }
 *   422 erros de validação
 * GET  {base}/api/v1/waitlist/{data.id}  até data.status === "paid" (payment pode ser null)
 */
const WAITLIST_API_BASE = 'https://api.louveplan.com.br';
const WAITLIST_PATH = '/api/v1/waitlist';
const WAITLIST_POLL_MS = 3000;

const overlay = document.getElementById('waitlist');
const sheet = overlay.querySelector('.waitlist-sheet');
const form = document.getElementById('waitlist-form');
const qrImg = document.getElementById('waitlist-qr');
const brInput = document.getElementById('waitlist-brcode');
const copyBtn = document.getElementById('waitlist-copy');
const pollStatusEl = document.getElementById('waitlist-poll');
const submitBtn = document.getElementById('waitlist-submit');
const joinedCopy = document.getElementById('waitlist-joined-copy');
const formBanner = document.getElementById('waitlist-form-error');

let lastOpener = null;
let pollTimer = null;
let pollAbort = null;

function waitlistUrl(id) {
  const base = WAITLIST_API_BASE.replace(/\/$/, '');
  return id
    ? `${base}${WAITLIST_PATH}/${encodeURIComponent(id)}`
    : `${base}${WAITLIST_PATH}`;
}

function showStep(name) {
  overlay.querySelectorAll('[data-step]').forEach((step) => {
    step.hidden = step.dataset.step !== name;
  });
  const heading = overlay.querySelector(`[data-step="${name}"] h2`);
  if (heading) sheet.setAttribute('aria-labelledby', heading.id);
  if (name === 'form') {
    field('name').focus();
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
  stopPoll();
  form.reset();
  clearFieldErrors();
  overlay.hidden = false;
  document.body.classList.add('waitlist-lock');
  showStep('price');
}

function closeWaitlist() {
  stopPoll();
  overlay.hidden = true;
  document.body.classList.remove('waitlist-lock');
  if (lastOpener && typeof lastOpener.focus === 'function') lastOpener.focus();
}

function stopPoll() {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
  if (pollAbort) {
    pollAbort.abort();
    pollAbort = null;
  }
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

function applyApiValidation(json) {
  clearFieldErrors();
  const errors = json && json.errors && typeof json.errors === 'object' ? json.errors : {};
  let mapped = false;
  ['name', 'email', 'phone'].forEach((key) => {
    const item = errors[key];
    const msg = Array.isArray(item) ? item[0] : item;
    if (msg) {
      setFieldError(key, String(msg));
      mapped = true;
    }
  });
  if (!mapped && formBanner) {
    formBanner.hidden = false;
    formBanner.textContent = json && json.message
      ? String(json.message)
      : 'Confira os dados e tente de novo.';
  }
}

/** Só o envelope travado: json.data.{ id, status, payment.br_code, payment.br_code_base64 }. */
function readWaitlist(json) {
  const data = json && json.data && typeof json.data === 'object' ? json.data : null;
  if (!data) return { id: '', status: '', brCode: '', qrSrc: '' };
  const payment = data.payment && typeof data.payment === 'object' ? data.payment : null;
  return {
    id: data.id ? String(data.id) : '',
    status: data.status ? String(data.status) : '',
    brCode: payment && payment.br_code ? String(payment.br_code) : '',
    qrSrc: payment && payment.br_code_base64 ? String(payment.br_code_base64) : '',
  };
}

function showPix(entry) {
  const hasQr = Boolean(entry.qrSrc);
  qrImg.hidden = !hasQr;
  qrImg.src = hasQr ? entry.qrSrc : '';
  brInput.value = entry.brCode;
  copyBtn.disabled = !entry.brCode;
  pollStatusEl.textContent = 'Aguardando o PIX… você só entra na lista depois do pagamento.';
  showStep('pix');
  if (entry.id) startPoll(entry.id);
}

function startPoll(id) {
  stopPoll();
  const tick = async () => {
    pollAbort = new AbortController();
    try {
      const res = await fetch(waitlistUrl(id), {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: pollAbort.signal,
      });
      if (res.ok) {
        const json = await res.json().catch(() => ({}));
        if (readWaitlist(json).status === 'paid') {
          stopPoll();
          showStep('success');
          return;
        }
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return;
    }
    pollTimer = setTimeout(tick, WAITLIST_POLL_MS);
  };
  tick();
}

function showJoined(json) {
  if (joinedCopy) {
    joinedCopy.textContent = json && json.message
      ? String(json.message)
      : 'Este e-mail já está na lista de espera.';
  }
  showStep('joined');
}

async function submitWaitlist(event) {
  event.preventDefault();
  if (!validateForm()) return;

  submitBtn.disabled = true;
  submitBtn.textContent = 'Aguarde…';

  const body = {
    name: field('name').value.trim(),
    email: field('email').value.trim(),
    phone: digits(field('phone').value),
  };

  try {
    const res = await fetch(waitlistUrl(), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const json = await res.json().catch(() => ({}));

    if (res.status === 422) {
      applyApiValidation(json);
      showStep('form');
      return;
    }

    if (res.status === 409) {
      showJoined(json);
      return;
    }

    if (res.status === 200 || res.status === 201) {
      const entry = readWaitlist(json);
      if (entry.id && entry.brCode && entry.qrSrc) {
        showPix(entry);
        return;
      }
    }

    showStep('error');
  } catch {
    showStep('error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Pagar R$ 4,90';
  }
}

async function copyPix() {
  const code = brInput.value.trim();
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code);
    copyBtn.textContent = 'Copiado';
    setTimeout(() => {
      copyBtn.textContent = 'Copiar';
    }, 1600);
  } catch {
    brInput.select();
  }
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

overlay.querySelector('[data-waitlist-next]').addEventListener('click', () => {
  showStep('form');
});

overlay.querySelectorAll('[data-waitlist-retry]').forEach((el) => {
  el.addEventListener('click', () => showStep('form'));
});

copyBtn.addEventListener('click', copyPix);
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
