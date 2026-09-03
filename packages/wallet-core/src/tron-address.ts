/**
 * TRON base58check address codec.
 *
 * A TRON address is three encodings of the same 20 bytes:
 *
 *   base58    TGJDgV9zs8Fpq3xFDncDyJsKUkFNUk2JgJ
 *
 * Solidity's `address` type is the 20-byte value; the `41` prefix and the
 * base58 wrapper are packaging. Anything that hashes an address — such as
 * `operationDigest` — must see the 20 bytes, so a stray `41` silently
 * produces a different digest and a signature that will not verify.
 *
 * The checksum is the point of base58check: a single mistyped character
 * fails to decode rather than resolving to a valid-looking wrong address.
 * Decoding here always verifies it.
 */

import { sha256 } from "@noble/hashes/sha2.js";

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const ALPHABET_MAP = new Map<string, bigint>(
  [...ALPHABET].map((c, i) => [c, BigInt(i)]),
);

/** TRON mainnet/testnet address prefix byte. */
const PREFIX = 0x41;

function base58Decode(input: string): Uint8Array {
  let num = 0n;
  for (const char of input) {
    const digit = ALPHABET_MAP.get(char);
    if (digit === undefined) {
      throw new Error(`Invalid base58 character "${char}" in address`);
    }
    num = num * 58n + digit;
  }

  const bytes: number[] = [];
  while (num > 0n) {
    bytes.unshift(Number(num & 0xffn));
    num >>= 8n;
  }

  // Each leading "1" encodes a leading zero byte.
  for (const char of input) {
    if (char !== "1") break;
    bytes.unshift(0);
  }

  return new Uint8Array(bytes);
}

function base58Encode(bytes: Uint8Array): string {
  let num = 0n;
  for (const byte of bytes) num = (num << 8n) | BigInt(byte);

  let out = "";
  while (num > 0n) {
    out = ALPHABET[Number(num % 58n)] + out;
    num /= 58n;
  }

  for (const byte of bytes) {
    if (byte !== 0) break;
    out = "1" + out;
  }

  return out;
}

/** First 4 bytes of sha256(sha256(payload)). */
function checksum(payload: Uint8Array): Uint8Array {
  return sha256(sha256(payload)).slice(0, 4);
}

/**
 * Base58 `T…` address to the 20-byte form Solidity sees.
 *
 * @throws if the checksum fails, the prefix is not 0x41, or the length is wrong.
 */
export function base58ToEvmAddress(address: string): string {
  const decoded = base58Decode(address.trim());

  if (decoded.length !== 25) {
    throw new Error(
      `Address decodes to ${decoded.length} bytes, expected 25 (1 prefix + 20 address + 4 checksum)`,
    );
  }

  const payload = decoded.subarray(0, 21);
  const expected = checksum(payload);
  const actual = decoded.subarray(21);
  for (let i = 0; i < 4; i++) {
    if (expected[i] !== actual[i]) {
      throw new Error(
        "Address checksum does not match — check for a mistyped character",
      );
    }
  }

  if (payload[0] !== PREFIX) {
    throw new Error(
      `Address prefix is 0x${payload[0]!.toString(16)}, expected 0x41`,
    );
  }

  let hex = "0x";
  for (const byte of payload.subarray(1)) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

/** The 20-byte form back to a base58 `T…` address. */
export function evmToBase58Address(hex: string): string {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (!/^[0-9a-fA-F]{40}$/.test(clean)) {
    throw new Error(`Expected a 20-byte hex address, got "${hex}"`);
  }

  const payload = new Uint8Array(21);
  payload[0] = PREFIX;
  for (let i = 0; i < 20; i++) {
    payload[i + 1] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }

  const full = new Uint8Array(25);
  full.set(payload, 0);
  full.set(checksum(payload), 21);
  return base58Encode(full);
}

/** True when `value` is a well-formed, checksum-valid TRON address. */
export function isValidTronAddress(value: string): boolean {
  try {
    base58ToEvmAddress(value);
    return true;
  } catch {
    return false;
  }
}
