/**
 * Shared, platform-free building blocks for a P256 passkey wallet.
 *
 * Each app supplies its own signing ceremony and imports everything else
 * from here, so `operationDigest` exists exactly once in the repo.
 */

export * from "./p256";
export * from "./assertion";
export * from "./tron-address";
export * from "./wallet-op";
export * from "./execute-calldata";
