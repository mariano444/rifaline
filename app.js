const SUPABASE_URL = 'https://skntovnkuanrnqgenimb.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_1DTwZSGlIGt0SFZMnDvy_Q_fgZPlGug';

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false },
  }
);

const WA_NUMBER = '5493516000000';
const WA_MSG_CONSULTA = encodeURIComponent('Hola, tengo una consulta sobre el sorteo');
const WA_MSG_PARTICIPAR = encodeURIComponent('Hola, quiero participar en el sorteo');

const TOTAL = 300;
const PAYMENT_STORAGE_KEY = 'sorteo_pending_payment_reference';
const FUNCTION_NAMES = {
  bootstrap: 'bootstrap-raffle',
  createPayment: 'create-payment-link',
  paymentStatus: 'payment-status',
  drawWinner: 'draw-winner',
  confirmWinner: 'confirm-winner',
};

let demoNums = new Set();
let realNums = new Set();
let selSet = new Set();
let demoList = [];
let realList = [];
let drawDone = false;
let sorteoId = null;
let pendingWinner = null;
let currentPrize = 0;
let currentSecretCode = '';
let liveTimer = null;
let syncTimer = null;
let buttonBusy = false;

const takenSet = () => {
  const set = new Set();
  demoNums.forEach((n) => set.add(n));
  realNums.forEach((n) => set.add(n));
  return set;
};

const fmt = (n) => (n < 10 ? `00${n}` : n < 100 ? `0${n}` : String(n));
const fmtPrize = (n) => `$${Number(n || 0).toLocaleString('es-AR')}`;

window.addEventListener('DOMContentLoaded', () => {
  const waUrl = (msg) => `https://wa.me/${WA_NUMBER}?text=${msg}`;
  document.querySelectorAll('[data-wa]').forEach((el) => {
    const msg = el.dataset.wa === 'participar' ? WA_MSG_PARTICIPAR : WA_MSG_CONSULTA;
    el.href = waUrl(msg);
  });
});

function showAlert(type, msg) {
  document.getElementById('alertBox').innerHTML = `<div class="alert ${type}">${msg}</div>`;
  window.clearTimeout(showAlert._timer);
  showAlert._timer = window.setTimeout(() => {
    document.getElementById('alertBox').innerHTML = '';
  }, 7000);
}

function setLS(id, state) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = `ls${state ? ` ${state}` : ''}`;
}

function calcDisplay() {
  const n = selSet.size;
  if (n === 0) return { unit: 0, total: 0, tier: null };
  if (n <= 2) return { unit: 2500, total: n * 2500, tier: '1' };
  if (n <= 4) return { unit: 2000, total: n * 2000, tier: '3' };
  return { unit: 1400, total: n * 1400, tier: '5' };
}

function highlightTier(tier) {
  ['1', '3', '5'].forEach((key) => {
    const el = document.getElementById(`tier-${key}`);
    if (el) el.classList.remove('sel');
  });
  if (!tier) return;
  const target = document.getElementById(`tier-${tier}`);
  if (target) target.classList.add('sel');
}

function updateLiveCnt() {
  document.getElementById('live-cnt').textContent = `+${Math.floor(Math.random() * 15) + 6} personas`;
  window.clearTimeout(liveTimer);
  liveTimer = window.setTimeout(updateLiveCnt, Math.random() * 16000 + 9000);
}

function setButtonBusy(isBusy, label) {
  buttonBusy = isBusy;
  const btn = document.getElementById('btnReg');
  const txt = document.getElementById('btnRegTxt');
  btn.disabled = isBusy || selSet.size === 0;
  if (isBusy) {
    txt.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg> ${label}`;
  } else {
    updateSummary();
  }
}

async function invokeFunction(name, body) {
  const { data, error } = await supabaseClient.functions.invoke(name, { body });
  if (error) throw error;
  return data;
}

function buildReturnUrl() {
  if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
    return `${window.location.origin}${window.location.pathname}`;
  }
  return null;
}

function normalizeParticipant(row) {
  const nums = Array.isArray(row.numeros) ? row.numeros.map((n) => Number(n)).sort((a, b) => a - b) : [];
  return {
    id: row.id,
    name: row.nombre,
    last: row.apellido,
    phone: row.telefono || '',
    prov: row.provincia,
    loc: row.localidad,
    pay: row.metodo_pago,
    review: row.resena || '',
    time: row.hora_reg || '',
    total: Number(row.total_pagado || 0),
    nums,
    isDemo: !!row.es_demo,
  };
}

function clearFormAfterSuccess() {
  ['f-name', 'f-last', 'f-phone', 'f-loc', 'f-review'].forEach((id) => {
    document.getElementById(id).value = '';
  });
  document.getElementById('f-prov').value = '';
  document.getElementById('f-pay').value = 'Transferencia';
  selSet.clear();
  updateSummary();
}

function applyRaffleState(payload) {
  const raffle = payload.raffle;
  const participants = Array.isArray(payload.participants) ? payload.participants.map(normalizeParticipant) : [];

  sorteoId = raffle.id;
  currentPrize = Number(raffle.premio || 0);
  currentSecretCode = raffle.secret_code || '';
  drawDone = raffle.estado !== 'activo';

  demoList = participants.filter((p) => p.isDemo);
  realList = participants.filter((p) => !p.isDemo);
  demoNums = new Set(demoList.flatMap((p) => p.nums));
  realNums = new Set(realList.flatMap((p) => p.nums));

  pendingWinner = payload.currentWinner || null;

  document.getElementById('heroPrize').textContent = fmtPrize(currentPrize);
  document.getElementById('wPrize').textContent = fmtPrize(currentPrize);

  buildGrid();
  updateStats();
  renderParts();
  updateSummary();
  renderWinnerHistory(payload.winners || []);
  updateLastWinnerBanner(payload.winners || []);

  // Si hay un ganador pendiente que no ha sido confirmado, mostrar el modal automáticamente
  if (pendingWinner && !pendingWinner.confirmado) {
    revealWinner(pendingWinner);
  }

  if (takenSet().size >= TOTAL && !drawDone && raffle.estado === 'activo') {
    window.setTimeout(() => {
      if (!drawDone) startDrawCountdown();
    }, 1200);
  }
}

async function loadRaffleState(showLoader) {
  if (showLoader) {
    document.getElementById('loadingOverlay').classList.remove('hidden');
  }

  try {
    const data = await invokeFunction(FUNCTION_NAMES.bootstrap, {});
    if (!data || !data.raffle) {
      throw new Error('No se pudo obtener el sorteo activo.');
    }
    applyRaffleState(data);
  } finally {
    if (showLoader) {
      window.setTimeout(() => {
        document.getElementById('loadingOverlay').classList.add('hidden');
      }, 250);
    }
  }
}

function buildGrid() {
  const grid = document.getElementById('numGrid');
  const taken = takenSet();
  const frag = document.createDocumentFragment();
  grid.innerHTML = '';
  for (let i = 1; i <= TOTAL; i += 1) {
    const button = document.createElement('button');
    button.className = `nb${taken.has(i) ? ' sold' : ''}`;
    button.textContent = fmt(i);
    button.id = `n${i}`;
    if (!taken.has(i)) {
      button.onclick = () => toggleNum(i);
    }
    frag.appendChild(button);
  }
  grid.appendChild(frag);
  document.getElementById('numSearch').max = TOTAL;
}

function updateStats() {
  const sold = takenSet().size;
  const avail = TOTAL - sold;
  const pct = Math.round((sold / TOTAL) * 100);
  document.getElementById('s-avail').textContent = avail;
  document.getElementById('s-sold').textContent = sold;
  document.getElementById('s-pct').textContent = `${pct}%`;
  document.getElementById('p-fill').style.width = `${pct}%`;
  document.getElementById('p-pct').textContent = `${pct}%`;
  document.getElementById('p-lbl').textContent = `${sold} de ${TOTAL} vendidos`;
  document.getElementById('p-max').textContent = TOTAL;
  document.getElementById('sc-avail').textContent = avail;
  document.getElementById('ub-avail').textContent = `${avail} restantes`;

  const urgency =
    avail <= 5
      ? `Solo quedan ${avail} lugar${avail === 1 ? '' : 'es'}!`
      : avail <= 15
        ? `Ultimos ${avail} lugares disponibles`
        : `Solo ${avail} de ${TOTAL} lugares disponibles`;
  document.getElementById('hero-total-txt').textContent = urgency;
}

function updateSummary() {
  const count = selSet.size;
  const hint = document.getElementById('selHint');
  const box = document.getElementById('orderBox');
  const btn = document.getElementById('btnReg');
  const txt = document.getElementById('btnRegTxt');
  const wrap = document.getElementById('btnWrap');
  const { unit, total, tier } = calcDisplay();

  highlightTier(tier);
  hint.textContent =
    count > 0
      ? `${count} numero${count > 1 ? 's' : ''} seleccionado${count > 1 ? 's' : ''} - completa tu pago para confirmar`
      : 'Toca cualquier numero libre para reservarlo';
  hint.style.color = count > 0 ? 'var(--gold)' : 'var(--text3)';
  hint.style.fontWeight = count > 0 ? '800' : '400';

  if (count === 0) {
    btn.disabled = true;
    txt.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg> Selecciona al menos 1 numero para participar';
    box.classList.remove('show');
    wrap.classList.remove('active');
    return;
  }

  if (buttonBusy) return;

  btn.disabled = false;
  txt.innerHTML = `Pagar con Transferencia - ${count} numero${count > 1 ? 's' : ''} - $${total.toLocaleString('es-AR')}`;
  wrap.classList.add('active');
  box.classList.add('show');
  document.getElementById('o-nums').textContent = [...selSet].sort((a, b) => a - b).map(fmt).join(', ');
  document.getElementById('o-unit').textContent = `$${unit.toLocaleString('es-AR')} c/u`;
  document.getElementById('o-qty').textContent = count;
  document.getElementById('o-total').textContent = `$${total.toLocaleString('es-AR')}`;
}

function toggleNum(n) {
  if (selSet.has(n)) {
    selSet.delete(n);
    document.getElementById(`n${n}`).classList.remove('sel');
  } else {
    selSet.add(n);
    document.getElementById(`n${n}`).classList.add('sel');
  }
  updateSummary();
}

function searchNum(value) {
  document.querySelectorAll('.nb').forEach((button) => button.classList.remove('hi'));
  if (!value) return;
  const num = Number.parseInt(value, 10);
  if (num >= 1 && num <= TOTAL) {
    const button = document.getElementById(`n${num}`);
    if (button) {
      button.classList.add('hi');
      button.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }
}

function renderParts() {
  const list = document.getElementById('partList');
  const all = [...demoList, ...realList];
  document.getElementById('partCnt').textContent = `${all.length} participante${all.length === 1 ? '' : 's'}`;
  list.innerHTML = '';

  [...all].reverse().slice(0, 100).forEach((participant) => {
    const ini = `${participant.name[0] || ''}${participant.last[0] || ''}`.toUpperCase();
    const el = document.createElement('div');
    const numsHtml = participant.nums.map((n) => `<span>${fmt(n)}</span>`).join('');
    el.className = 'part-item';
    el.innerHTML = `
      <div class="part-av">${ini}</div>
      <div>
        <div class="pname">${participant.name} ${participant.last}</div>
        <div class="pmeta">${participant.prov} · ${participant.loc}${participant.time ? ` · ${participant.time}` : ''}</div>
        <div class="pnums">${numsHtml}</div>
        <div class="preview${participant.review ? ' show' : ''}">${participant.review ? `"${participant.review}"` : ''}</div>
      </div>
      <div class="pright">
        <div class="pprice">$${participant.total.toLocaleString('es-AR')}</div>
      </div>`;
    list.appendChild(el);
  });
}

function updateLastWinnerBanner(winners) {
  const last = Array.isArray(winners) && winners.length ? winners[0] : null;
  const banner = document.getElementById('recentWinnerBanner');
  if (banner) {
    banner.style.cursor = 'pointer';
    banner.onclick = () => {
      if (pendingWinner && !pendingWinner.confirmado) {
        revealWinner(pendingWinner);
      }
    };
  }

  if (last) {
    document.getElementById('lastWinnerName').textContent = last.nombre;
    document.getElementById('lastWinnerLoc').textContent = last.localidad;
    document.getElementById('lastWinnerPrize').textContent = fmtPrize(last.premio || 0);
    return;
  }

  const fallback = [
    { name: 'Valentina Rios', loc: 'Cordoba', prize: 2100000 },
    { name: 'Facundo Medina', loc: 'Rosario', prize: 3500000 },
    { name: 'Micaela Vargas', loc: 'La Plata', prize: 1800000 },
  ][Math.floor(Math.random() * 3)];

  document.getElementById('lastWinnerName').textContent = fallback.name;
  document.getElementById('lastWinnerLoc').textContent = fallback.loc;
  document.getElementById('lastWinnerPrize').textContent = fmtPrize(fallback.prize);
}

function renderWinnerHistory(winners) {
  const card = document.getElementById('historyCard');
  const container = document.getElementById('winnerHistory');
  if (!Array.isArray(winners) || winners.length === 0) {
    card.style.display = 'none';
    container.innerHTML = '';
    return;
  }

  card.style.display = 'block';
  container.innerHTML = '';
  winners.slice(0, 10).forEach((winner) => {
    const el = document.createElement('div');
    el.className = 'wcard';
    el.innerHTML = `
      <div class="wc-trophy">🏆</div>
      <div>
        <div class="wc-num">N${fmt(Number(winner.numero_ganador || 0))}</div>
        <div class="wc-name">${winner.nombre}</div>
        <div class="wc-detail">${winner.localidad} · Sorteo de ${winner.total_numeros || TOTAL} numeros</div>
        <span class="wstatus ${winner.confirmado ? 'ok' : 'pend'}">${winner.confirmado ? 'Premio confirmado' : 'Pendiente de confirmacion'}</span>
      </div>
      <div class="wc-right"><div class="wc-prize">${fmtPrize(winner.premio || 0)}</div></div>`;
    container.appendChild(el);
  });
}

function collectFormData() {
  const name = document.getElementById('f-name').value.trim();
  const last = document.getElementById('f-last').value.trim();
  const phone = document.getElementById('f-phone').value.trim();
  const prov = document.getElementById('f-prov').value;
  const loc = document.getElementById('f-loc').value.trim();
  const pay = document.getElementById('f-pay').value;
  const review = document.getElementById('f-review').value.trim();
  const nums = [...selSet].sort((a, b) => a - b);
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return { name, last, phone, prov, loc, pay, review, nums, time };
}

function validateRegistration(formData) {
  if (!formData.name) return 'Ingresa tu nombre.';
  if (!formData.last) return 'Ingresa tu apellido.';
  if (!formData.phone) return 'Ingresa tu WhatsApp.';
  if (!formData.prov) return 'Selecciona tu provincia.';
  if (!formData.loc) return 'Ingresa tu localidad.';
  if (!formData.nums.length) return 'Selecciona al menos un numero.';
  if (!sorteoId) return 'No encontramos un sorteo activo.';
  return null;
}

async function registerParticipant() {
  if (buttonBusy) return;

  const formData = collectFormData();
  const validationError = validateRegistration(formData);
  if (validationError) {
    showAlert('err', validationError);
    return;
  }

  const { total } = calcDisplay();
  try {
    setButtonBusy(true, 'Generando link de pago...');
    const data = await invokeFunction(FUNCTION_NAMES.createPayment, {
      sorteoId,
      participant: {
        nombre: formData.name,
        apellido: formData.last,
        telefono: formData.phone,
        provincia: formData.prov,
        localidad: formData.loc,
        metodoPago: 'Transferencia',
        resena: formData.review,
        horaReg: formData.time,
      },
      numeros: formData.nums,
      totalPagado: total,
      returnUrl: buildReturnUrl(),
    });

    if (!data || !data.paymentUrl || !data.referenceId) {
      throw new Error('Galio Pay no devolvio un link valido.');
    }

    localStorage.setItem(PAYMENT_STORAGE_KEY, data.referenceId);
    showAlert('ok', `Te estamos redirigiendo a Galio Pay para pagar $${total.toLocaleString('es-AR')}.`);
    window.setTimeout(() => {
      window.location.href = data.paymentUrl;
    }, 700);
  } catch (error) {
    console.error(error);
    showAlert('err', error.message || 'No se pudo crear el pago.');
    setButtonBusy(false, '');
  }
}

async function syncPaymentStatus(referenceId, silent) {
  if (!referenceId) return false;

  try {
    const data = await invokeFunction(FUNCTION_NAMES.paymentStatus, { referenceId });
    if (!data || !data.order) return false;

    const status = data.order.status;
    if (status === 'approved') {
      localStorage.removeItem(PAYMENT_STORAGE_KEY);
      clearFormAfterSuccess();
      await loadRaffleState(false);
      if (takenSet().size >= TOTAL && !drawDone) {
        window.setTimeout(() => {
          if (!drawDone) startDrawCountdown();
        }, 1200);
      }
      if (!silent) {
        showAlert('ok', `Pago confirmado. Tus numeros ${data.order.numbers.map(fmt).join(', ')} ya quedaron registrados.`);
      }
      setButtonBusy(false, '');
      return true;
    }

    if (status === 'pending') {
      if (!silent) showAlert('ok', 'Tu pago todavia figura pendiente. En cuanto Galio lo confirme, lo veras reflejado aqui.');
      setButtonBusy(false, '');
      return false;
    }

    if (!silent) {
      showAlert('err', data.order.error_message || 'El pago no pudo confirmarse.');
    }
    setButtonBusy(false, '');
    return false;
  } catch (error) {
    console.error(error);
    if (!silent) showAlert('err', 'No pudimos consultar el estado del pago en este momento.');
    setButtonBusy(false, '');
    return false;
  }
}

async function handlePaymentReturn() {
  const params = new URLSearchParams(window.location.search);
  const ref = params.get('ref') || params.get('referenceId') || localStorage.getItem(PAYMENT_STORAGE_KEY);
  const paymentMarker = params.get('payment');

  if (!ref) return;

  if (paymentMarker === 'failure') {
    showAlert('err', 'El pago fue cancelado o fallo. Puedes intentarlo de nuevo.');
    localStorage.removeItem(PAYMENT_STORAGE_KEY);
    return;
  }

  await syncPaymentStatus(ref, false);

  if (paymentMarker) {
    params.delete('payment');
    params.delete('ref');
    params.delete('referenceId');
    const next = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`;
    window.history.replaceState({}, '', next);
  }
}

function startDrawCountdown() {
  drawDone = true;
  const overlay = document.getElementById('countdownOverlay');
  const numEl = document.getElementById('countdownNum');
  overlay.classList.add('show');
  let countdown = 3;
  numEl.textContent = countdown;
  const interval = window.setInterval(() => {
    countdown -= 1;
    if (countdown > 0) {
      numEl.textContent = countdown;
      numEl.style.animation = 'none';
      void numEl.offsetWidth;
      numEl.style.animation = '';
      return;
    }
    window.clearInterval(interval);
    overlay.classList.remove('show');
    triggerDraw();
  }, 1000);
}

function triggerDraw() {
  document.getElementById('drawModal').classList.add('show');
  window.setTimeout(runDraw, 1700);
}

async function runDraw() {
  const drum = document.getElementById('drum');
  const progress = document.getElementById('drawProgress');
  const allArr = [...takenSet()];
  let count = 0;
  drum.classList.add('spinning');
  progress.textContent = 'Mezclando numeros...';

  const interval = window.setInterval(async () => {
    const randomNum = allArr[Math.floor(Math.random() * allArr.length)] || 1;
    drum.textContent = fmt(randomNum);
    count += 1;

    if (count === 40) progress.textContent = 'Buscando el numero ganador...';
    if (count < 95) return;

    window.clearInterval(interval);
    try {
      const data = await invokeFunction(FUNCTION_NAMES.drawWinner, { sorteoId });
      drum.classList.remove('spinning');
      progress.textContent = 'Ganador confirmado';
      drum.textContent = fmt(Number(data.winner.numero_ganador));
      window.setTimeout(() => revealWinner(data.winner), 900);
    } catch (error) {
      console.error(error);
      document.getElementById('drawModal').classList.remove('show');
      showAlert('err', 'No se pudo ejecutar el sorteo final.');
      drawDone = false;
    }
  }, 50);
}

function revealWinner(winner) {
  document.getElementById('drawModal').classList.remove('show');
  pendingWinner = winner;
  document.getElementById('wNum').textContent = fmt(Number(winner.numero_ganador || 0));
  document.getElementById('wName').textContent = winner.nombre;
  document.getElementById('wLoc').textContent = winner.localidad;
  document.getElementById('wPrize').textContent = fmtPrize(winner.premio || currentPrize);
  document.getElementById('adminCodeDisplay').textContent = currentSecretCode;
  document.getElementById('secretInput').value = '';
  document.getElementById('secretError').classList.remove('show');

  // Resaltar el número ganador en la grilla
  document.querySelectorAll('.nb').forEach(b => b.classList.remove('win-anim'));
  const numberButton = document.getElementById(`n${winner.numero_ganador}`);
  if (numberButton) {
    numberButton.classList.add('win-anim');
    numberButton.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  document.getElementById('winModal').classList.add('show');
  launchConfetti();
}

function verifySecretCode() {
  const input = document.getElementById('secretInput').value.trim().toUpperCase();
  const errEl = document.getElementById('secretError');
  if (!input) {
    errEl.textContent = 'Ingresa el codigo secreto.';
    errEl.classList.add('show');
    return;
  }
  errEl.classList.remove('show');
  confirmPrize(input);
}

async function confirmPrize(code) {
  if (!pendingWinner) return;
  const btn = document.querySelector('.btn-secret');
  const input = document.getElementById('secretInput');
  const errEl = document.getElementById('secretError');

  try {
    btn.disabled = true;
    btn.textContent = '⌛ Verificando...';
    
    const data = await invokeFunction(FUNCTION_NAMES.confirmWinner, { sorteoId, code });
    
    // Éxito: Mostrar mensaje en el modal antes de cerrar
    btn.style.background = 'var(--emerald)';
    btn.textContent = '✅ Confirmado';
    input.disabled = true;
    errEl.textContent = '¡Entrega confirmada! Iniciando próximo sorteo...';
    errEl.style.color = 'var(--emerald)';
    errEl.classList.add('show');

    // Aplicar el nuevo estado inmediatamente si viene en la respuesta
    if (data.raffle) {
      applyRaffleState(data);
    }

    window.setTimeout(() => {
      document.getElementById('winModal').classList.remove('show');
      startNextCountdown();
    }, 2000);

  } catch (error) {
    btn.disabled = false;
    btn.textContent = '✅ Verificar';
    errEl.textContent = error.message || 'No pudimos confirmar el premio.';
    errEl.style.color = 'var(--red)';
    errEl.classList.add('show');
  }
}

function startNextCountdown() {
  const durationMs = 10000; // Reducido a 10s para mejor flujo
  const startedAt = Date.now();
  const modal = document.getElementById('nextModal');
  const timer = document.getElementById('nextTimer');
  const bar = document.getElementById('nextBar');
  modal.classList.add('show');

  const interval = window.setInterval(async () => {
    const remaining = Math.max(0, durationMs - (Date.now() - startedAt));
    timer.textContent = `${Math.ceil(remaining / 1000)}s`;
    bar.style.width = `${(remaining / durationMs) * 100}%`;
    if (remaining > 0) return;

    window.clearInterval(interval);
    modal.classList.remove('show');
    // Ya no es estrictamente necesario llamar a loadRaffleState aquí si confirmPrize ya lo hizo,
    // pero lo dejamos por seguridad para asegurar que todo esté sincronizado.
    await loadRaffleState(false);
  }, 200);
}

function toggleFaq(el) {
  const item = el.closest('.faq-item');
  const isOpen = item.classList.contains('open');
  document.querySelectorAll('.faq-item.open').forEach((node) => node.classList.remove('open'));
  if (!isOpen) item.classList.add('open');
}

function launchConfetti() {
  const canvas = document.getElementById('ccanvas');
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const colors = ['#F0C040', '#8B5CF6', '#C4B5FD', '#00D97E', '#FF4D1C', '#FFFFFF'];
  const bits = Array.from({ length: 200 }, () => ({
    x: Math.random() * canvas.width,
    y: -20,
    size: Math.random() * 10 + 5,
    color: colors[Math.floor(Math.random() * colors.length)],
    vx: (Math.random() - 0.5) * 8,
    vy: Math.random() * 4 + 2,
    rot: Math.random() * 360,
    rv: (Math.random() - 0.5) * 10,
    opacity: 1,
  }));
  let frame = 0;

  (function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    bits.forEach((bit) => {
      ctx.save();
      ctx.translate(bit.x, bit.y);
      ctx.rotate((bit.rot * Math.PI) / 180);
      ctx.globalAlpha = bit.opacity;
      ctx.fillStyle = bit.color;
      ctx.fillRect(-bit.size / 2, -bit.size / 4, bit.size, bit.size / 2);
      ctx.restore();
      bit.x += bit.vx;
      bit.y += bit.vy;
      bit.rot += bit.rv;
      bit.vy += 0.08;
      if (bit.y > canvas.height - 60) bit.opacity = Math.max(0, bit.opacity - 0.02);
    });

    frame += 1;
    if (frame < 340) {
      window.requestAnimationFrame(draw);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  })();
}

function subscribeRealtime() {
  try {
    supabaseClient
      .channel('raffle-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'participantes' }, queueSync)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'numeros_asignados' }, queueSync)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ganadores' }, queueSync)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sorteos' }, queueSync)
      .subscribe();
  } catch (error) {
    console.warn('Realtime no disponible', error);
  }
}

function queueSync() {
  window.clearTimeout(syncTimer);
  syncTimer = window.setTimeout(() => {
    loadRaffleState(false).catch((error) => console.error(error));
  }, 800);
}

window.searchNum = searchNum;
window.toggleFaq = toggleFaq;
window.verifySecretCode = verifySecretCode;
window.registerParticipant = registerParticipant;

(async () => {
  try {
    await loadRaffleState(true);
    updateLiveCnt();
    subscribeRealtime();
    await handlePaymentReturn();
  } catch (error) {
    console.error(error);
    document.getElementById('loadingOverlay').classList.add('hidden');
    showAlert('err', 'No se pudo conectar la app con Supabase.');
  }
})();
