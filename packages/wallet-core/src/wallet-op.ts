/**
 * The operation digest a P256SmartWallet expects as its WebAuthn challenge.
 *
 * This mirrors `P256SmartWallet.operationDigest` in Solidity. Two
 * implementations of one spec is a real drift hazard — add a field on one
 * side and signatures start failing with the crypto looking blameless.
 *
 * Nothing enforces agreement automatically any more (the Foundry parity
 * test was removed with the rest of that harness). The check that remains
 * is manual and worth doing after touching either side: call
 * `operationDigest` on the deployed wallet and confirm it returns the same
 * value this produces for the same inputs. The contract is the authority.
 *
 * Encoding note: every field in the struct is a static ABI type, so
 * `abi.encode` is just eight 32-byte words laid end to end. No ABI encoder
 * is needed, and there is no dynamic-offset arithmetic to get wrong.
 */

import { keccak_256 } from "@noble/hashes/sha3.js";

import { hexToBytes, toHex, toHex32 } from "./p256";

export const OPERATION_TYPE_STRING =
  "P256WalletOperation(address wallet,uint256 chainId,address to,uint256 value,bytes32 dataHash,uint256 nonce,uint256 deadline)";

export interface WalletOperation {
  /** The wallet contract that will execute this — binds the digest to it. */
  wallet: string;
  /** Must equal `block.chainid` at execution, or verification fails. */
  chainId: bigint;
  destination: string;
  /** In sun. */
  value: bigint;
  /** Calldata for the destination, as 0x-hex. */
  data: string;
  nonce: bigint;
  /** Unix seconds. */
  deadline: bigint;
}

export function keccak256(bytes: Uint8Array): Uint8Array {
  return keccak_256(bytes);
}

export function operationTypehash(): Uint8Array {
  return keccak256(new TextEncoder().encode(OPERATION_TYPE_STRING));
}

/** A 20-byte address as a left-padded 32-byte word. */
function addressWord(address: string): Uint8Array {
  const bytes = hexToBytes(address);
  if (bytes.length !== 20) {
    throw new Error(
      `Expected a 20-byte address, got ${bytes.length} bytes: ${address}`,
    );
  }
  const word = new Uint8Array(32);
  word.set(bytes, 12);
  return word;
}

/** A uint256 as a big-endian 32-byte word. */
function uintWord(value: bigint): Uint8Array {
  if (value < 0n) throw new Error(`Negative value in operation: ${value}`);
  return hexToBytes(toHex32(value));
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/**
 * @returns the 32-byte digest to pass as the passkey's WebAuthn challenge.
 */
export function operationDigest(op: WalletOperation): Uint8Array {
  const dataHash = keccak256(hexToBytes(op.data));

  return keccak256(
    concat([
      operationTypehash(),
      addressWord(op.wallet),
      uintWord(op.chainId),
      addressWord(op.destination),
      uintWord(op.value),
      dataHash,
      uintWord(op.nonce),
      uintWord(op.deadline),
    ]),
  );
}

export function operationDigestHex(op: WalletOperation): string {
  return toHex(operationDigest(op));
}
