// ══════════════════════════════════════════
//  validate.js — shared validation helpers
// ══════════════════════════════════════════

// Tanzanian mobile numbers: +255XXXXXXXXX / 255XXXXXXXXX / 0XXXXXXXXX,
// where the first digit after the country/leading-zero code is 6 or 7.
function normalizePhone(raw) {
  if (!raw) return null;
  const cleaned = String(raw).replace(/\s+/g, '');
  const pattern = /^(\+255|255|0)[67]\d{8}$/;
  if (!pattern.test(cleaned)) return null;
  if (cleaned.startsWith('0')) return '+255' + cleaned.slice(1);
  if (cleaned.startsWith('255')) return '+' + cleaned;
  return cleaned; // already +255...
}

function isStrongEnoughPassword(pw) {
  return typeof pw === 'string' && pw.length >= 6;
}

function titleCase(s) {
  return String(s || '').trim().replace(/\s+/g, ' ')
    .split(' ')
    .map(w => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(' ');
}

module.exports = { normalizePhone, isStrongEnoughPassword, titleCase };
