/**
 * Lista de espera paga — COD-18 / contrato Otto (COD-19).
 *
 * Otto: altere só WAITLIST_API_BASE se o host mudar.
 * POST {base}/api/v1/waitlist  body { name, email, phone }
 * GET  {base}/api/v1/waitlist/{id}  poll até status === "paid"
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

function unwrap(json) {
  return json && typeof json === 'object' && json.data && typeof json.data === 'object'
    ? json.data
    : json;
}

function extractPix(json) {
  const root = unwrap(json) || {};
  const payment = root.payment && typeof root.payment === 'object' ? root.payment : root;
  const brCode = payment.br_code || payment.brCode || root.br_code || root.brCode || '';
  const brCodeBase64 =
    payment.br_code_base64 ||
    payment.brCodeBase64 ||
    root.br_code_base64 ||
    root.brCodeBase64 ||
    '';
  return {
    id: root.id || json?.id || '',
    status: String(root.status || json?.status || '').toLowerCase(),
    brCode: String(brCode || ''),
    brCodeBase64: String(brCodeBase64 || ''),
  };
}

function pixImageSrc(b64) {
  if (!b64) return '';
  return b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64}`;
}

function isAlreadyJoined(status, json) {
  if (status !== 409) {
    return JSON.stringify(json || '').toLowerCase().includes('waitlist_already_joined');
  }
  const pix = extractPix(json);
  return !(pix.brCode || pix.brCodeBase64);
}

function showPix(pix) {
  qrImg.hidden = !pix.brCodeBase64;
  qrImg.src = pix.brCodeBase64 ? pixImageSrc(pix.brCodeBase64) : '';
  brInput.value = pix.brCode;
  copyBtn.disabled = !pix.brCode;
  pollStatusEl.textContent = 'Aguardando o PIX… você só entra na lista depois do pagamento.';
  showStep('pix');
  if (pix.id) startPoll(pix.id);
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
        const pix = extractPix(json);
        if (pix.status === 'paid') {
          stopPoll();
          showStep('success');
          return;
        }
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      // GET ainda fora do ar: não marca como lista. Mantém o QR.
    }
    pollTimer = setTimeout(tick, WAITLIST_POLL_MS);
  };
  pollTimer = setTimeout(tick, WAITLIST_POLL_MS);
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
    const pix = extractPix(json);

    if (isAlreadyJoined(res.status, json)) {
      showStep('joined');
      return;
    }

    if (!res.ok) {
      showStep('error');
      return;
    }

    if (pix.status === 'paid') {
      showStep('success');
      return;
    }

    if (pix.brCode || pix.brCodeBase64) {
      showPix(pix);
      return;
    }

    showStep('pending');
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
