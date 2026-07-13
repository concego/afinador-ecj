/**
 * ukulele.js — Módulo de afinação para Ukulele (afinação padrão G — soprano/concerto/tenor)
 */

export const INSTRUMENT = {
  name: 'Ukulele',
  strings: [
    { label: '4ª corda — Sol', note: 'G4', freq: 392.00 },
    { label: '3ª corda — Dó', note: 'C4', freq: 261.63 },
    { label: '2ª corda — Mi', note: 'E4', freq: 329.63 },
    { label: '1ª corda — Lá', note: 'A4', freq: 440.00 },
  ],
};

/**
 * Identifica qual corda está sendo tocada com base na frequência detectada.
 * Retorna a corda mais próxima dentro de uma tolerância de ±50 cents.
 * @param {number} freq — Hz detectado
 * @returns {{ string: object, cents: number } | null}
 */
export function matchString(freq) {
  let best = null;
  let bestCents = Infinity;

  for (const string of INSTRUMENT.strings) {
    const cents = Math.round(1200 * Math.log2(freq / string.freq));
    if (Math.abs(cents) < Math.abs(bestCents)) {
      bestCents = cents;
      best = string;
    }
  }

  if (Math.abs(bestCents) > 50) return null;

  return { string: best, cents: bestCents };
}

/**
 * Gera o texto de status para leitura pelo screen reader.
 * @param {{ string: object, cents: number } | null} match
 * @returns {string}
 */
export function statusText(match) {
  if (!match) return 'Nenhuma corda identificada.';

  const { string, cents } = match;

  if (Math.abs(cents) <= 5) {
    return `${string.label}: afinada.`;
  } else if (cents > 0) {
    return `${string.label}: afrouxe a corda.`;
  } else {
    return `${string.label}: aperte a corda.`;
  }
}
