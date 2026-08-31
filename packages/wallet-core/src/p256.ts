/**
 * P-256 (secp256r1) plumbing for on-chain WebAuthn verification.
 *
 * A passkey created with alg -7 (ES256) is a plain secp256r1 keypair,
 * which is exactly what a P256VERIFY precompile wants. Three things
 * stand between the browser's assertion and the precompile:
 *
 *   1. The assertion's `signature` is ASN.1 DER, not a flat (r, s)
 *      pair — and DER integers are variable-length and sign-padded.
 *   2. The signed message is not the challenge. WebAuthn signs
 *      sha256(authenticatorData ‖ sha256(clientDataJSON)); the
 *      challenge only appears *inside* clientDataJSON.
 *   3. The public key is stored as a COSE_Key, so x and y have to be
 *      decoded out of CBOR.
 *
 * Runs unchanged in a browser, in a Next route handler, and under Metro.
 * That portability is load-bearing, so this module deliberately avoids
 * `atob`/`btoa` (patchy in React Native) and `crypto.subtle` (absent), and
 * hand-rolls base64url instead. Nothing here is secret — an assertion and a
 * public key are both public data.
 */

import { sha256 } from "@noble/hashes/sha2.js";

/** Order of the secp256r1 group (n). */
export const P256_N =
  0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;

const P256_HALF_N = P256_N >> 1n;

/* ------------------------------------------------------------------ *
 * Byte / hex helpers
 * ------------------------------------------------------------------ */

export function toHex(bytes: Uint8Array): string {
  let out = "0x";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

/** Left-pads to a full 32-byte word — what the EVM/TVM ABI expects. */
export function toHex32(value: bigint): string {
  if (value < 0n) throw new Error("toHex32: negative value");
  const hex = value.toString(16);
  if (hex.length > 64) throw new Error("toHex32: value exceeds 32 bytes");
  return "0x" + hex.padStart(64, "0");
}

const B64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const B64URL_REVERSE: Record<string, number> = {};
for (let i = 0; i < B64URL.length; i++) B64URL_REVERSE[B64URL[i]!] = i;

export function base64UrlToBytes(input: string): Uint8Array {
  const clean = input.replace(/=+$/, "");
  const out = new Uint8Array(Math.floor((clean.length * 6) / 8));
  let acc = 0;
  let bits = 0;
  let index = 0;

  for (const char of clean) {
    const value = B64URL_REVERSE[char];
    if (value === undefined) {
      throw new Error(`Invalid base64url character "${char}"`);
    }
    acc = (acc << 6) | value;
    bits += 6;
    // Emit a byte as soon as eight bits have accumulated; any trailing
    // bits are the encoder's zero padding and are dropped.
    if (bits >= 8) {
      bits -= 8;
      out[index++] = (acc >> bits) & 0xff;
    }
  }

  return out;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let out = "";
  let acc = 0;
  let bits = 0;

  for (const byte of bytes) {
    acc = (acc << 8) | byte;
    bits += 8;
    while (bits >= 6) {
      bits -= 6;
      out += B64URL[(acc >> bits) & 0x3f];
    }
  }
  // Left-align whatever is left over, matching unpadded base64url.
  if (bits > 0) out += B64URL[(acc << (6 - bits)) & 0x3f];

  return out;
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error("hexToBytes: odd-length hex");
  if (!/^[0-9a-fA-F]*$/.test(clean)) {
    throw new Error("hexToBytes: non-hex characters");
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let out = 0n;
  for (const b of bytes) out = (out << 8n) | BigInt(b);
  return out;
}

/* ------------------------------------------------------------------ *
 * DER signature → (r, s)
 * ------------------------------------------------------------------ */

export interface Signature {
  r: bigint;
  s: bigint;
  /** True when `s` was flipped to n - s to satisfy the low-s rule. */
  normalized: boolean;
}

/**
 * Parse `SEQUENCE { INTEGER r, INTEGER s }`.
 *
 * DER INTEGERs are big-endian, minimally encoded, and gain a leading
 * 0x00 when the top bit would otherwise read as negative — so a
 * component can arrive as 31, 32, or 33 bytes. Slicing a fixed 32
 * bytes out of the middle is the classic way to get an
 * intermittently-invalid signature, hence the explicit walk.
 *
 * `normalizeS` (default true) folds s into the lower half of the
 * group. Both s and n - s are valid ECDSA signatures, but most on-chain
 * WebAuthn verifiers reject high-s to close off signature malleability.
 * The RIP-7212 precompile itself accepts either.
 */
export function parseDerSignature(
  der: Uint8Array,
  normalizeS = true,
): Signature {
  let offset = 0;

  const readByte = (what: string): number => {
    if (offset >= der.length) throw new Error(`DER: truncated before ${what}`);
    return der[offset++]!;
  };

  if (readByte("SEQUENCE tag") !== 0x30) {
    throw new Error("DER: expected a SEQUENCE tag (0x30)");
  }
  const seqLen = readByte("SEQUENCE length");
  // A P-256 signature is at most 72 bytes, so the length is always
  // short-form. Long-form here means this is not an ES256 signature.
  if (seqLen & 0x80) throw new Error("DER: unexpected long-form length");
  if (offset + seqLen !== der.length) {
    throw new Error(
      `DER: SEQUENCE length ${seqLen} does not match ${der.length - offset} remaining bytes`,
    );
  }

  const readInteger = (label: string): bigint => {
    if (readByte(`${label} tag`) !== 0x02) {
      throw new Error(`DER: expected an INTEGER tag for ${label}`);
    }
    const len = readByte(`${label} length`);
    if (len & 0x80) throw new Error(`DER: long-form length for ${label}`);
    if (len === 0) throw new Error(`DER: zero-length ${label}`);
    if (offset + len > der.length) throw new Error(`DER: truncated ${label}`);
    const raw = der.subarray(offset, offset + len);
    offset += len;
    // Strip the sign byte, then reject anything still too wide for the curve.
    const trimmed = raw[0] === 0x00 ? raw.subarray(1) : raw;
    if (trimmed.length > 32) {
      throw new Error(`DER: ${label} is ${trimmed.length} bytes, expected ≤ 32`);
    }
    return bytesToBigInt(trimmed);
  };

  const r = readInteger("r");
  const sRaw = readInteger("s");

  if (r === 0n || sRaw === 0n) throw new Error("DER: r or s is zero");
  if (r >= P256_N || sRaw >= P256_N) {
    throw new Error("DER: r or s is not less than the group order");
  }

  const high = sRaw > P256_HALF_N;
  return {
    r,
    s: normalizeS && high ? P256_N - sRaw : sRaw,
    normalized: normalizeS && high,
  };
}

/* ------------------------------------------------------------------ *
 * COSE_Key → (x, y)
 * ------------------------------------------------------------------ */

export interface PublicKey {
  x: bigint;
  y: bigint;
}

/**
 * Pull x and y out of a COSE_Key.
 *
 * An ES256 credential key is a 5-entry CBOR map:
 *   kty(1)=2 (EC2) · alg(3)=-7 · crv(-1)=1 (P-256) · x(-2) · y(-3)
 *
 * Only the shapes a P-256 credential key can actually take are
 * handled — small ints, negative small ints, and 32-byte strings.
 * Anything else means the key is not what we expect, and guessing
 * would produce a plausible-looking wrong answer.
 */
export function coseToPublicKey(cose: Uint8Array): PublicKey {
  let offset = 0;

  const readHeader = (): { major: number; value: number } => {
    if (offset >= cose.length) throw new Error("COSE: truncated");
    const byte = cose[offset++]!;
    const major = byte >> 5;
    const short = byte & 0x1f;
    if (short < 24) return { major, value: short };
    if (short === 24) {
      if (offset >= cose.length) throw new Error("COSE: truncated uint8");
      return { major, value: cose[offset++]! };
    }
    if (short === 25) {
      if (offset + 1 >= cose.length) throw new Error("COSE: truncated uint16");
      const v = (cose[offset]! << 8) | cose[offset + 1]!;
      offset += 2;
      return { major, value: v };
    }
    throw new Error(`COSE: unsupported additional info ${short}`);
  };

  const map = readHeader();
  if (map.major !== 5) throw new Error("COSE: expected a CBOR map");

  let x: Uint8Array | null = null;
  let y: Uint8Array | null = null;
  let crv: number | null = null;
  let kty: number | null = null;

  for (let i = 0; i < map.value; i++) {
    const keyHeader = readHeader();
    // Major 0 = unsigned, major 1 = negative (value n encodes -1 - n).
    let label: number;
    if (keyHeader.major === 0) label = keyHeader.value;
    else if (keyHeader.major === 1) label = -1 - keyHeader.value;
    else throw new Error("COSE: non-integer map label");

    const valueHeader = readHeader();
    if (valueHeader.major === 2) {
      const bytes = cose.subarray(offset, offset + valueHeader.value);
      if (bytes.length !== valueHeader.value) {
        throw new Error("COSE: truncated byte string");
      }
      offset += valueHeader.value;
      if (label === -2) x = bytes;
      else if (label === -3) y = bytes;
    } else if (valueHeader.major === 0 || valueHeader.major === 1) {
      const numeric =
        valueHeader.major === 0 ? valueHeader.value : -1 - valueHeader.value;
      if (label === 1) kty = numeric;
      else if (label === -1) crv = numeric;
    } else {
      throw new Error(`COSE: unsupported value type ${valueHeader.major}`);
    }
  }

  if (kty !== null && kty !== 2) {
    throw new Error(`COSE: kty ${kty} is not EC2 — not a P-256 key`);
  }
  if (crv !== null && crv !== 1) {
    throw new Error(`COSE: crv ${crv} is not P-256`);
  }
  if (!x || !y) throw new Error("COSE: missing x or y coordinate");
  if (x.length !== 32 || y.length !== 32) {
    throw new Error(
      `COSE: expected 32-byte coordinates, got x=${x.length} y=${y.length}`,
    );
  }

  return { x: bytesToBigInt(x), y: bytesToBigInt(y) };
}

/* ------------------------------------------------------------------ *
 * The signed digest
 * ------------------------------------------------------------------ */

/**
 * sha256(authenticatorData ‖ sha256(clientDataJSON)) — the digest the
 * authenticator actually signed, and the `hash` argument to P256VERIFY.
 *
 * Note the asymmetry: authenticatorData goes in raw, clientDataJSON
 * goes in hashed.
 *
 * Synchronous, because it hashes with @noble rather than `crypto.subtle`.
 * That is what lets the same function run under Metro.
 */
export function webauthnDigest(
  authenticatorData: Uint8Array,
  clientDataJSON: Uint8Array,
): Uint8Array {
  const clientHash = sha256(clientDataJSON);
  const message = new Uint8Array(authenticatorData.length + clientHash.length);
  message.set(authenticatorData, 0);
  message.set(clientHash, authenticatorData.length);
  return sha256(message);
}
