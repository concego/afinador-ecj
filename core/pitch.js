/**
 * pitch.js — Detecção de pitch via algoritmo YIN
 * Compartilhado por todos os módulos de instrumento.
 *
 * Buffer de 4096 amostras (definido no app.js) para melhor detecção de graves.
 */

export function detectPitch(buffer, sampleRate) {
  const bufferSize = buffer.length;
  const halfSize   = Math.floor(bufferSize / 2);
  const yinBuffer  = new Float32Array(halfSize);

  // Passo 1: Função de diferença
  yinBuffer[0] = 1;
  let runningSum = 0;
  for (let t = 1; t < halfSize; t++) {
    let sum = 0;
    for (let i = 0; i < halfSize; i++) {
      const delta = buffer[i] - buffer[i + t];
      sum += delta * delta;
    }
    yinBuffer[t] = sum;
    runningSum += sum;
    // Normalização cumulativa inline
    yinBuffer[t] *= t / runningSum;
  }

  // Passo 2: Threshold absoluto — 0.15 é mais tolerante para graves
  const threshold = 0.15;
  let tau = -1;
  for (let t = 2; t < halfSize; t++) {
    if (yinBuffer[t] < threshold) {
      while (t + 1 < halfSize && yinBuffer[t + 1] < yinBuffer[t]) t++;
      tau = t;
      break;
    }
  }

  if (tau === -1) return null;

  // Passo 3: Interpolação parabólica para maior precisão
  const x0 = tau > 1       ? tau - 1 : tau;
  const x2 = tau + 1 < halfSize ? tau + 1 : tau;

  if (x0 === tau) {
    return yinBuffer[tau] <= yinBuffer[x2]
      ? sampleRate / tau
      : sampleRate / x2;
  }
  if (x2 === tau) {
    return yinBuffer[tau] <= yinBuffer[x0]
      ? sampleRate / tau
      : sampleRate / x0;
  }

  const betterTau = tau +
    (yinBuffer[x2] - yinBuffer[x0]) /
    (2 * (2 * yinBuffer[tau] - yinBuffer[x2] - yinBuffer[x0]));

  return sampleRate / betterTau;
}
