import crypto from "crypto";

// No 0/o/1/l/i so passwords survive being read off a phone screen or an email.
const ALPHABET = `abcdefghjkmnpqrstuvwxyz23456789`;

/** e.g. `k7mq-x3vp-9tzr` (~59 bits). */
function generatePassword(groups = 3, size = 4) {
  return Array.from({ length: groups }, () =>
    Array.from({ length: size }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join(``),
  ).join(`-`);
}

export { generatePassword };
