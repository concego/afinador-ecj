/**
 * app.js — Controlador principal do Afinador ECJ
 */

import { detectPitch } from './core/pitch.js';
import { INSTRUMENT as VIOLAO, matchString as matchViolao, statusText as statusViolao } from './instruments/violao.js';
import { INSTRUMENT as UKULELE, matchString as matchUkulele, statusText as statusUkulele } from './instruments/ukulele.js';

// --- Estado ---
let currentInstrument = null;
let audioContext = null;
let analyser = null;
let mediaStream = null;
let animationId = null;
let buffer = null;
let lastStatus = '';       // evita repetir o mesmo texto no aria-live
let tunedFrames = 0;       // quantos frames consecutivos a corda está afinada
const TUNED_CONFIRM = 10;  // frames necessários para confirmar afinação e tocar bip

// --- Referências DOM ---
const btnViolao    = document.getElementById('btn-violao');
const btnUkulele   = document.getElementById('btn-ukulele');
const tunerSection = document.getElementById('tuner-section');
const tunerTitle   = document.getElementById('tuner-title');
const stringsList  = document.getElementById('strings-list');
const btnStart     = document.getElementById('btn-start');
const btnStop      = document.getElementById('btn-stop');
const statusEl     = document.getElementById('status');
const centsBar     = document.getElementById('cents-bar');
const centsValue   = document.getElementById('cents-value');

// --- Mapa de instrumentos ---
const instruments = {
  violao:  { data: VIOLAO,  match: matchViolao,  text: statusViolao },
  ukulele: { data: UKULELE, match: matchUkulele, text: statusUkulele },
};

// --- Selecionar instrumento ---
btnViolao.addEventListener('click',  () => selectInstrument('violao'));
btnUkulele.addEventListener('click', () => selectInstrument('ukulele'));

function selectInstrument(key) {
  currentInstrument = key;

  // aria-pressed
  btnViolao.setAttribute('aria-pressed',  key === 'violao'  ? 'true' : 'false');
  btnUkulele.setAttribute('aria-pressed', key === 'ukulele' ? 'true' : 'false');

  const inst = instruments[key];
  tunerTitle.textContent = inst.data.name;
  tunerSection.hidden = false;

  // Renderizar lista de cordas
  stringsList.innerHTML = '';
  for (const string of inst.data.strings) {
    const li = document.createElement('div');
    li.role = 'listitem';
    li.className = 'string-item';
    li.innerHTML = `
      <span>${string.label}</span>
      <span class="note">${string.note}</span>
      <span class="freq">${string.freq.toFixed(2)} Hz</span>
    `;
    stringsList.appendChild(li);
  }

  // Reset status
  setStatus('Pressione "Iniciar afinação" e toque uma corda.', '');
  stopTuning();
}

// --- Iniciar / Parar ---
btnStart.addEventListener('click', startTuning);
btnStop.addEventListener('click',  stopTuning);

async function startTuning() {
  if (!currentInstrument) return;

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioContext = new AudioContext();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    buffer = new Float32Array(analyser.fftSize);

    const source = audioContext.createMediaStreamSource(mediaStream);
    source.connect(analyser);

    btnStart.hidden = true;
    btnStop.hidden  = false;
    lastStatus = '';
    tunedFrames = 0;
    setStatus('Ouvindo... toque uma corda.', '');

    loop();
  } catch (err) {
    setStatus('Não foi possível acessar o microfone. Verifique as permissões.', '');
    console.error(err);
  }
}

function stopTuning() {
  if (animationId) cancelAnimationFrame(animationId);
  if (mediaStream) mediaStream.getTracks().forEach(t => t.stop());
  if (audioContext) audioContext.close();
  animationId = null;
  mediaStream = null;
  audioContext = null;
  analyser = null;
  buffer = null;
  tunedFrames = 0;

  btnStart.hidden = false;
  btnStop.hidden  = true;
  centsBar.style.left = '50%';
  centsValue.textContent = '';
}

// --- Loop de detecção ---
function loop() {
  analyser.getFloatTimeDomainData(buffer);
  const freq = detectPitch(buffer, audioContext.sampleRate);

  if (freq && freq > 60 && freq < 1500) {
    const inst  = instruments[currentInstrument];
    const match = inst.match(freq);
    const text  = inst.text(match);
    const css   = match ? getCentsClass(match.cents) : '';

    // Só atualiza o aria-live se o status mudou (evita spam no leitor de tela)
    if (text !== lastStatus) {
      setStatus(text, css);
      lastStatus = text;
    } else {
      // Atualiza só a classe visual sem tocar o aria-live
      statusEl.className = css;
    }

    updateCentsBar(match ? match.cents : 0);

    // Contagem de frames afinados para confirmar e tocar bip
    if (match && Math.abs(match.cents) <= 5) {
      tunedFrames++;
      if (tunedFrames === TUNED_CONFIRM) {
        playConfirmBeep();
      }
    } else {
      tunedFrames = 0;
    }
  }

  animationId = requestAnimationFrame(loop);
}

// --- Bip de confirmação (corda afinada) ---
function playConfirmBeep() {
  // Cria um AudioContext isolado só para o bip, sem interferir na captura
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(880, ctx.currentTime);         // Lá5 — agradável e distinto
  gain.gain.setValueAtTime(0.4, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4); // fade out em 400ms

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.4);
  osc.onended = () => ctx.close();
}

// --- Helpers visuais ---
function getCentsClass(cents) {
  if (Math.abs(cents) <= 5) return 'tuned';
  return cents > 0 ? 'sharp' : 'flat';
}

function setStatus(text, cssClass) {
  statusEl.textContent = text;
  statusEl.className = cssClass;
}

function updateCentsBar(cents) {
  const clamped = Math.max(-50, Math.min(50, cents));
  const pct = 50 + clamped;
  centsBar.style.left = `${pct}%`;
  centsBar.className = getCentsClass(cents);
  centsValue.textContent = cents !== 0 ? `${cents > 0 ? '+' : ''}${cents} cents` : 'afinado';
}
