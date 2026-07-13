/**
 * app.js — Controlador principal do Afinador ECJ
 */

import { detectPitch } from './core/pitch.js';
import { INSTRUMENT as VIOLAO,  matchString as matchViolao,  statusText as statusViolao  } from './instruments/violao.js';
import { INSTRUMENT as UKULELE, matchString as matchUkulele, statusText as statusUkulele } from './instruments/ukulele.js';

// ─── Modos de afinação ───────────────────────────────────────────────────────
const MODE_AUTO     = 'auto';      // detecta a corda automaticamente
const MODE_STRING   = 'string';    // usuário trava numa corda
const MODE_CHROMATIC = 'chromatic'; // detecta qualquer nota

// ─── Estado ──────────────────────────────────────────────────────────────────
let currentInstrument = null;  // chave do instrumento selecionado
let currentMode       = MODE_AUTO;
let selectedString    = null;  // índice da corda travada (modo string)
let audioContext      = null;
let analyser          = null;
let mediaStream       = null;
let animationId       = null;
let buffer            = null;
let lastStatus        = '';
let tunedFrames       = 0;
const TUNED_CONFIRM   = 10;    // frames consecutivos para confirmar afinação
const BUFFER_SIZE     = 4096;  // buffer maior → melhor detecção de graves

// ─── Instrumentos registrados ─────────────────────────────────────────────────
const instruments = {
  violao:  { data: VIOLAO,  match: matchViolao,  text: statusViolao  },
  ukulele: { data: UKULELE, match: matchUkulele, text: statusUkulele },
};

// ─── Referências DOM ──────────────────────────────────────────────────────────
const tunerSection    = document.getElementById('tuner-section');
const tunerTitle      = document.getElementById('tuner-title');
const stringsList     = document.getElementById('strings-list');
const stringSelectorEl = document.getElementById('string-selector');
const stringButtonsEl = document.getElementById('string-buttons');
const btnPlayRef      = document.getElementById('btn-play-reference');
const btnStart        = document.getElementById('btn-start');
const btnStop         = document.getElementById('btn-stop');
const statusEl        = document.getElementById('status');
const centsNeedle     = document.getElementById('cents-needle');
const centsValue      = document.getElementById('cents-value');

// ─── Acordeão ────────────────────────────────────────────────────────────────
document.querySelectorAll('.accordion-toggle').forEach(btn => {
  btn.addEventListener('click', () => {
    const expanded = btn.getAttribute('aria-expanded') === 'true';
    const panel = document.getElementById(btn.getAttribute('aria-controls'));
    btn.setAttribute('aria-expanded', String(!expanded));
    panel.hidden = expanded;
  });
});

// ─── Cards de instrumento ─────────────────────────────────────────────────────
document.querySelectorAll('.instrument-card').forEach(card => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.instrument-card').forEach(c => c.setAttribute('aria-pressed', 'false'));
    card.setAttribute('aria-pressed', 'true');
    selectInstrument(card.dataset.instrument);
  });
});

function selectInstrument(key) {
  currentInstrument = key;
  selectedString = null;

  const inst = instruments[key];
  tunerTitle.textContent = inst.data.name;
  tunerSection.hidden = false;

  renderStringList(inst);
  renderStringButtons(inst);
  setMode(currentMode);
  setStatus('Pressione "Iniciar afinação" e toque uma corda.', '');
  stopTuning();
}

// ─── Renderização ─────────────────────────────────────────────────────────────
function renderStringList(inst) {
  stringsList.innerHTML = '';
  inst.data.strings.forEach(string => {
    const div = document.createElement('div');
    div.setAttribute('role', 'listitem');
    div.className = 'string-item';
    div.innerHTML = `
      <span>${string.label}</span>
      <span class="note">${string.note}</span>
      <span class="freq">${string.freq.toFixed(2)} Hz</span>
    `;
    stringsList.appendChild(div);
  });
}

function renderStringButtons(inst) {
  stringButtonsEl.innerHTML = '';
  inst.data.strings.forEach((string, i) => {
    const btn = document.createElement('button');
    btn.textContent = `${string.note} — ${string.label.split('—')[0].trim()}`;
    btn.setAttribute('aria-pressed', 'false');
    btn.addEventListener('click', () => {
      document.querySelectorAll('#string-buttons button').forEach(b => b.setAttribute('aria-pressed', 'false'));
      btn.setAttribute('aria-pressed', 'true');
      selectedString = i;
    });
    stringButtonsEl.appendChild(btn);
  });
}

// ─── Seletor de modo ──────────────────────────────────────────────────────────
document.getElementById('btn-mode-auto').addEventListener('click',      () => setMode(MODE_AUTO));
document.getElementById('btn-mode-string').addEventListener('click',    () => setMode(MODE_STRING));
document.getElementById('btn-mode-chromatic').addEventListener('click', () => setMode(MODE_CHROMATIC));

function setMode(mode) {
  currentMode = mode;

  document.getElementById('btn-mode-auto').setAttribute('aria-pressed',      mode === MODE_AUTO      ? 'true' : 'false');
  document.getElementById('btn-mode-string').setAttribute('aria-pressed',    mode === MODE_STRING    ? 'true' : 'false');
  document.getElementById('btn-mode-chromatic').setAttribute('aria-pressed', mode === MODE_CHROMATIC ? 'true' : 'false');

  // Visibilidade dos painéis
  stringSelectorEl.hidden = mode !== MODE_STRING;
  stringsList.hidden      = mode === MODE_STRING || mode === MODE_CHROMATIC;
}

// ─── Referência sonora (modo corda a corda) ───────────────────────────────────
btnPlayRef.addEventListener('click', () => {
  if (!currentInstrument || selectedString === null) return;
  const string = instruments[currentInstrument].data.strings[selectedString];
  playReferenceNote(string.freq);
});

function playReferenceNote(freq) {
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  gain.gain.setValueAtTime(0.5, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 1.5);
  osc.onended = () => ctx.close();
}

// ─── Iniciar / Parar ──────────────────────────────────────────────────────────
btnStart.addEventListener('click', startTuning);
btnStop.addEventListener('click',  stopTuning);

async function startTuning() {
  if (!currentInstrument) return;

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    audioContext = new AudioContext();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = BUFFER_SIZE; // buffer maior para graves
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
  if (animationId)  cancelAnimationFrame(animationId);
  if (mediaStream)  mediaStream.getTracks().forEach(t => t.stop());
  if (audioContext) audioContext.close();
  animationId = null;
  mediaStream = null;
  audioContext = null;
  analyser = null;
  buffer = null;
  tunedFrames = 0;

  btnStart.hidden = false;
  btnStop.hidden  = true;
  centsNeedle.style.left = '50%';
  centsValue.textContent = '';
}

// ─── Loop de detecção ─────────────────────────────────────────────────────────
function loop() {
  analyser.getFloatTimeDomainData(buffer);
  const freq = detectPitch(buffer, audioContext.sampleRate);

  if (freq && freq > 50 && freq < 2000) {
    let text, cents;

    if (currentMode === MODE_CHROMATIC) {
      // Modo cromático: qualquer nota
      const { note, octave, cents: c } = freqToNote(freq);
      cents = c;
      if (Math.abs(cents) <= 5) {
        text = `${note}${octave} — afinado.`;
      } else if (cents > 0) {
        text = `${note}${octave} — afrouxe a corda.`;
      } else {
        text = `${note}${octave} — aperte a corda.`;
      }

    } else if (currentMode === MODE_STRING && selectedString !== null) {
      // Modo corda a corda: trava na corda selecionada
      const inst = instruments[currentInstrument];
      const target = inst.data.strings[selectedString];
      cents = Math.round(1200 * Math.log2(freq / target.freq));
      if (Math.abs(cents) <= 5) {
        text = `${target.label}: afinada.`;
      } else if (cents > 0) {
        text = `${target.label}: afrouxe a corda.`;
      } else {
        text = `${target.label}: aperte a corda.`;
      }

    } else {
      // Modo automático: detecta a corda mais próxima
      const inst  = instruments[currentInstrument];
      const match = inst.match(freq);
      text  = inst.text(match);
      cents = match ? match.cents : 0;
    }

    // Atualiza aria-live só quando o texto muda
    if (text !== lastStatus) {
      setStatus(text, getCentsClass(cents));
      lastStatus = text;
    } else {
      statusEl.className = getCentsClass(cents);
    }

    updateCentsBar(cents);

    // Confirma afinação após N frames consecutivos
    if (Math.abs(cents) <= 5) {
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

// ─── Importa freqToNote (para modo cromático) ─────────────────────────────────
function freqToNote(freq) {
  const noteNames = ['Dó','Dó#','Ré','Ré#','Mi','Fá','Fá#','Sol','Sol#','Lá','Lá#','Si'];
  const semitones = 12 * Math.log2(freq / 440);
  const rounded   = Math.round(semitones);
  const cents      = Math.round((semitones - rounded) * 100);
  const noteIndex  = ((rounded % 12) + 12 + 9) % 12;
  const octave     = Math.floor((rounded + 57) / 12);
  return { note: noteNames[noteIndex], octave, cents };
}

// ─── Bip de confirmação ───────────────────────────────────────────────────────
function playConfirmBeep() {
  const ctx  = new AudioContext();
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(880, ctx.currentTime);
  gain.gain.setValueAtTime(0.4, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.4);
  osc.onended = () => ctx.close();
}

// ─── Helpers visuais ─────────────────────────────────────────────────────────
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
  centsNeedle.style.left = `${pct}%`;
  centsNeedle.className  = getCentsClass(cents);
  centsValue.textContent = Math.abs(cents) <= 5 ? 'afinado' : `${cents > 0 ? '+' : ''}${cents} cents`;
}
