/**
 * ABI-encodes the arguments to `P256SmartWallet.execute`.
 *
 *   execute(address,uint256,bytes,uint256,uint256,
 *           (bytes,string,uint256,uint256,bytes32,bytes32))
 *
 * Exists because pasting a struct into an IDE's tuple field is where this
 * flow keeps breaking: `clientDataJSON` contains quotes and commas, and if a
 * single character is altered in transit the contract still finds the
 * challenge substring but hashes a different string — so verification fails
 * with the digest apparently correct. Encoding here removes the IDE's
 * encoder, and its escaping rules, from the loop.
 *
 * The encoding was validated against `cast abi-encode` (structurally) and
 * `cast abi-decode` (round-trip, including a clientDataJSON containing
 * commas and quotes). Those checks were run by hand rather than wired into
 * a suite, so re-run them if you change the layout.
 */

import { hexToBytes, toHex, toHex32 } from "./p256";

const WORD = 32;

function padRight(bytes: Uint8Array): Uint8Array {
  const padded = new Uint8Array(Math.ceil(bytes.length / WORD) * WORD);
  padded.set(bytes, 0);
  return padded;
}

function word(value: bigint): Uint8Array {
  return hexToBytes(toHex32(value));
}

/** A dynamic `bytes`/`string`: length word, then right-padded content. */
function dynamicBlob(bytes: Uint8Array): Uint8Array {
  const length = word(BigInt(bytes.length));
  const body = padRight(bytes);
  const out = new Uint8Array(length.length + body.length);
  out.set(length, 0);
  out.set(body, length.length);
  return out;
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function addressWord(evmAddress: string): Uint8Array {
  const bytes = hexToBytes(evmAddress);
  if (bytes.length !== 20) {
    throw new Error(`Expected a 20-byte address, got ${bytes.length} bytes`);
  }
  const out = new Uint8Array(WORD);
  out.set(bytes, 12);
  return out;
}

export interface ExecuteArgs {
  /** 20-byte form — decode from base58 before calling. */
  destination: string;
  value: bigint;
  data: string;
  nonce: bigint;
  deadline: bigint;
  auth: {
    authenticatorData: string;
    clientDataJSON: string;
    challengeIndex: number;
    typeIndex: number;
    r: string;
    s: string;
  };
}

/**
 * The `WebAuthn.Auth` tuple. Dynamic, because it contains `bytes` and
 * `string`, so its internal offsets are relative to the tuple's own start —
 * not to the start of the whole argument block.
 */
function encodeAuth(auth: ExecuteArgs["auth"]): Uint8Array {
  const authenticatorData = dynamicBlob(hexToBytes(auth.authenticatorData));
  const clientDataJSON = dynamicBlob(
    new TextEncoder().encode(auth.clientDataJSON),
  );

  const headSize = 6 * WORD;
  const head = concat([
    word(BigInt(headSize)),
    word(BigInt(headSize + authenticatorData.length)),
    word(BigInt(auth.challengeIndex)),
    word(BigInt(auth.typeIndex)),
    hexToBytes(auth.r),
    hexToBytes(auth.s),
  ]);

  return concat([head, authenticatorData, clientDataJSON]);
}

/**
 * @returns hex of the encoded arguments, with no function selector — the
 *          shape TRON's `parameter` field wants alongside `function_selector`.
 */
export function encodeExecuteArgs(args: ExecuteArgs): string {
  const data = dynamicBlob(hexToBytes(args.data));
  const auth = encodeAuth(args.auth);

  const headSize = 6 * WORD;
  const head = concat([
    addressWord(args.destination),
    word(args.value),
    word(BigInt(headSize)), // -> data
    word(args.nonce),
    word(args.deadline),
    word(BigInt(headSize + data.length)), // -> auth
  ]);

  return toHex(concat([head, data, auth]));
}

export const EXECUTE_SIGNATURE =
  "execute(address,uint256,bytes,uint256,uint256,(bytes,string,uint256,uint256,bytes32,bytes32))";
