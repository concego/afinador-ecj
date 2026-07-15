/**
 * pitch.js — Detecção de pitch
 *
 * Dois algoritmos:
 *  - detectPitchYIN()     → modo cromático (qualquer nota, buffer 2048)
 *  - detectPitchTargeted() → modo corda a corda (frequência alvo conhecida,
 *                            autocorrelação direcionada — muito mais rápido)
 */

// ─── YIN (modo cromático) ────────────────────────────────────────────────────
export function detectPitchYIN(buffer, sampleRate) {
  const halfSize  = Math.floor(buffer.length / 2);
  const yin       = new Float32Array(halfSize);
  yin[0]          = 1;
  let runningSum  = 0;

  for (let t = 1; t < halfSize; t++) {
    let sum = 0;
    for (let i = 0; i < halfSize; i++) {
      const d = buffer[i] - buffer[i + t];
      sum += d * d;
    }
    runningSum += sum;
    yin[t] = sum * t / runningSum;
  }

  const threshold = 0.15;
  let tau = -1;
  for (let t = 2; t < halfSize; t++) {
    if (yin[t] < threshold) {
      while (t + 1 < halfSize && yin[t + 1] < yin[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau === -1) return null;

  // Interpolação parabólica
  const x0 = tau > 1            ? tau - 1 : tau;
  const x2 = tau + 1 < halfSize ? tau + 1 : tau;
  if (x0 === tau) return yin[tau] <= yin[x2] ? sampleRate / tau : sampleRate / x2;
  if (x2 === tau) return yin[tau] <= yin[x0] ? sampleRate / tau : sampleRate / x0;

  const better = tau + (yin[x2] - yin[x0]) / (2 * (2 * yin[tau] - yin[x2] - yin[x0]));
  return sampleRate / better;
}

// ─── Autocorrelação direcionada (modo corda a corda) ─────────────────────────
// Avalia apenas o lag correspondente à frequência alvo ± janela de ±50 cents.
// É O(n) em vez de O(n²) — latência mínima.
export function detectPitchTargeted(buffer, sampleRate, targetFreq) {
  const n = buffer.length;

  // Converte ±50 cents em range de lags
  const lagCenter = sampleRate / targetFreq;
  const lagMin    = Math.floor(sampleRate / (targetFreq * 1.03)); // +50 cents
  const lagMax    = Math.ceil (sampleRate / (targetFreq * 0.97)); // -50 cents

  let   bestLag   = lagCenter;
  let   bestCorr  = -Infinity;

  for (let lag = lagMin; lag <= lagMax; lag++) {
    if (lag >= n) break;
    let corr = 0;
    const limit = n - lag;
    for (let i = 0; i < limit; i++) {
      corr += buffer[i] * buffer[i + lag];
    }
    if (corr > bestCorr) {
      bestCorr = corr;
      bestLag  = lag;
    }
  }

  // Rejeita silêncio (correlação muito baixa)
  if (bestCorr < 0.01) return null;

  return sampleRate / bestLag;
}
