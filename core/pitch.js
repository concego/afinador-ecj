/**
 * pitch.js — Detecção de pitch via algoritmo YIN
 * Compartilhado por todos os módulos de instrumento.
 */

export function detectPitch(buffer, sampleRate) {
  const bufferSize = buffer.length;
  const yinBuffer = new Float32Array(bufferSize / 2);

  // Passo 1: Diferença
  for (let t = 0; t < yinBuffer.length; t++) {
    yinBuffer[t] = 0;
    for (let i = 0; i < yinBuffer.length; i++) {
      const delta = buffer[i] - buffer[i + t];
      yinBuffer[t] += delta * delta;
    }
  }

  // Passo 2: Normalização cumulativa
  yinBuffer[0] = 1;
  let runningSum = 0;
  for (let t = 1; t < yinBuffer.length; t++) {
    runningSum += yinBuffer[t];
    yinBuffer[t] *= t / runningSum;
  }

  // Passo 3: Threshold absoluto
  const threshold = 0.1;
  let tau = -1;
  for (let t = 2; t < yinBuffer.length; t++) {
    if (yinBuffer[t] < threshold) {
      while (t + 1 < yinBuffer.length && yinBuffer[t + 1] < yinBuffer[t]) t++;
      tau = t;
      break;
    }
  }

  if (tau === -1) return null;

  // Passo 4: Interpolação parabólica
  const x0 = tau < 1 ? tau : tau - 1;
  const x2 = tau + 1 < yinBuffer.length ? tau + 1 : tau;
  if (x0 === tau) {
    return yinBuffer[tau] <= yinBuffer[x2] ? sampleRate / tau : sampleRate / x2;
  }
  if (x2 === tau) {
    return yinBuffer[tau] <= yinBuffer[x0] ? sampleRate / tau : sampleRate / x0;
  }
  const betterTau =
    tau + (yinBuffer[x2] - yinBuffer[x0]) / (2 * (2 * yinBuffer[tau] - yinBuffer[x2] - yinBuffer[x0]));

  return sampleRate / betterTau;
}

/**
 * Converte frequência em Hz para nome de nota + oitava + cents de desvio.
 * @param {number} freq — frequência detectada em Hz
 * @returns {{ note: string, octave: number, cents: number }}
 */
export function freqToNote(freq) {
  const noteNames = ['Dó', 'Dó#', 'Ré', 'Ré#', 'Mi', 'Fá', 'Fá#', 'Sol', 'Sol#', 'Lá', 'Lá#', 'Si'];
  const A4 = 440;
  const semitones = 12 * Math.log2(freq / A4);
  const rounded = Math.round(semitones);
  const cents = Math.round((semitones - rounded) * 100);
  const noteIndex = ((rounded % 12) + 12 + 9) % 12; // A4 = índice 9
  const octave = Math.floor((rounded + 57) / 12); // A4 = oitava 4
  return {
    note: noteNames[noteIndex],
    octave,
    cents,
  };
}

/**
 * Calcula desvio em cents entre frequência detectada e frequência alvo.
 * @param {number} detected — Hz detectado
 * @param {number} target — Hz da corda alvo
 * @returns {number} cents de desvio (negativo = baixo, positivo = alto)
 */
export function centsDiff(detected, target) {
  return Math.round(1200 * Math.log2(detected / target));
}
