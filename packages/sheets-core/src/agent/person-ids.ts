/**
 * The ids the engine knows people by. The engine takes a person in a cell (a person chip) only with an id of its own
 * shape: `u_` and 22 letters or digits (anything else is `userIdNotWellFormed`). The server names people otherwise (the
 * owner, a guest of a share), so wherever the page hears of a person (the viewer, the authors of edits and versions,
 * the people it may name), it hears `personId(id)`: the server's id encoded into that shape, and back (`serverIdOf`).
 * The same id gives the same person id on every page and every run, so a chip written today names the same person
 * tomorrow; what the server keeps is unchanged.
 *
 * The encoding: the id's UTF-8 bytes (at most 15) after a byte that counts them, padded with zeros to 16 bytes, as one
 * 128-bit number in base 62 (22 digits hold it). A longer id is passed through as it is: the page still names that
 * person, only a chip of them is refused.
 */

const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const LENGTH = 22;
const MAX_BYTES = 15;
const PERSON_ID = /^u_[0-9A-Za-z]{22}$/;

/** The engine's id for a person the server names `id`. */
export function personId(id: string): string {
  const bytes = new TextEncoder().encode(id);
  if (bytes.length === 0 || bytes.length > MAX_BYTES) return id;
  let n = BigInt(bytes.length);
  for (let i = 0; i < MAX_BYTES; i++) n = (n << 8n) | BigInt(bytes[i] ?? 0);
  let digits = '';
  for (let i = 0; i < LENGTH; i++) {
    digits = DIGITS[Number(n % 62n)] + digits;
    n /= 62n;
  }
  return `u_${digits}`;
}

/** The server's id of a person the engine names `id` (an id that is not one of ours comes back as it is). */
export function serverIdOf(id: string): string {
  if (!PERSON_ID.test(id)) return id;
  let n = 0n;
  for (const digit of id.slice(2)) n = n * 62n + BigInt(DIGITS.indexOf(digit));
  if (n >> 128n !== 0n) return id;
  const bytes: number[] = [];
  for (let i = 0; i < 16; i++) {
    bytes.unshift(Number(n & 0xffn));
    n >>= 8n;
  }
  const count = bytes[0]!;
  if (count === 0 || count > MAX_BYTES || bytes.slice(1 + count).some((b) => b !== 0)) return id;
  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes.slice(1, 1 + count)));
    return personId(decoded) === id ? decoded : id;
  } catch {
    return id;
  }
}
