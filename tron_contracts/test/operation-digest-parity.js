/**
 * Parity guard: wallet-op.ts vs P256SmartWallet.operationDigest.
 *
 * Two implementations of one encoding is a drift hazard — add a field on
 * one side and signatures start failing with the crypto looking blameless.
 * This replaces the Foundry test that was removed with that harness.
 *
 * The contract is the authority. The TypeScript is what has to agree.
 *
 * The digest is compared as the *contract computes it*, which means the
 * test cannot choose `wallet` or `chainId`: `operationDigest` takes them
 * from `address(this)` and `block.chainid`. Both are read back from the
 * chain and fed to the TS side, so the same test is meaningful on a local
 * TRE node and on Nile without edits.
 *
 * Run:
 *   docker run -d --name tron-tre -p 9090:9090 tronbox/tre   # once
 *   npm run test:contracts                                    # from repo root
 */

const path = require("path");

const P256SmartWallet = artifacts.require("P256SmartWallet");
const ChainContext = artifacts.require("ChainContext");

const BUILD = path.join(__dirname, "..", "..", "packages", "wallet-core", ".cjs-build");

let wc;
try {
  wc = require(BUILD);
} catch (err) {
  throw new Error(
    `Could not load the wallet-core CJS build from ${BUILD}.\n` +
      `Run 'npm run build:wallet-core:cjs' from the repo root first, or use ` +
      `'npm run test:contracts' which does it for you.\n\n` +
      `Original error: ${err.message}`,
  );
}

/** The constructor rejects a zero coordinate, so use arbitrary non-zero ones. */
const X = "0x" + "11".repeat(32);
const Y = "0x" + "22".repeat(32);

const MAX_UINT256 = (1n << 256n) - 1n;

/**
 * The 20-byte address Solidity hashes, from whatever form TronBox hands back.
 *
 * TronBox normalises contract addresses to hex, never base58: `at()` stores
 * `address.toHex(...)`, then `deployed()` rewrites it to `0x…` when TronWrap
 * is in ethers mode and `41…` when it is not. Both branches are live
 * depending on configuration, so handle either. A base58 `T…` still goes
 * through wallet-core, which validates the checksum and the `41` prefix.
 */
function toEvmAddress(address) {
  const value = String(address).trim();
  if (/^0x[0-9a-fA-F]{40}$/.test(value)) return value.toLowerCase();
  if (/^41[0-9a-fA-F]{40}$/.test(value)) return "0x" + value.slice(2).toLowerCase();
  return wc.base58ToEvmAddress(value);
}

/** bytes32 comes back in a few shapes depending on the decoder; normalise. */
function toHex32(value) {
  let hex;
  if (typeof value === "string") {
    hex = value.startsWith("0x") ? value.slice(2) : value;
  } else if (value && typeof value.toString === "function") {
    // BigNumber-like — base 16, left-padded.
    hex = BigInt(value.toString()).toString(16);
  } else {
    throw new Error(`Unexpected bytes32 return: ${String(value)}`);
  }
  return "0x" + hex.toLowerCase().padStart(64, "0");
}

/**
 * Vectors chosen for the ways this encoding actually breaks: field order,
 * a missing keccak over `data`, and short-word padding.
 */
function vectors(destinationBase58) {
  return [
    {
      name: "empty data, zero value, nonce 0",
      destination: destinationBase58,
      value: 0n,
      data: "0x",
      nonce: 0n,
      deadline: 1800000000n,
    },
    {
      name: "short data (under one word)",
      destination: destinationBase58,
      value: 1000000n,
      data: "0xa9059cbb",
      nonce: 1n,
      deadline: 1800000000n,
    },
    {
      name: "data spanning two words",
      destination: destinationBase58,
      value: 123456789n,
      data: "0x" + "ab".repeat(48),
      nonce: 7n,
      deadline: 1893456000n,
    },
    {
      name: "max uint256 value and deadline",
      destination: destinationBase58,
      value: MAX_UINT256,
      data: "0x",
      nonce: MAX_UINT256,
      deadline: MAX_UINT256,
    },
    {
      name: "leading-zero value (padding)",
      destination: destinationBase58,
      value: 1n,
      data: "0x00",
      nonce: 0n,
      deadline: 1n,
    },
  ];
}

contract("operationDigest parity", () => {
  let wallet;
  let walletEvmAddress;
  let chainId;

  before(async () => {
    wallet = await P256SmartWallet.new(X, Y, true);
    const probe = await ChainContext.new();

    // The digest hashes the 20 bytes Solidity sees, so whatever wrapper
    // TronBox puts around them has to come off first.
    walletEvmAddress = toEvmAddress(wallet.address);
    chainId = BigInt((await probe.chainId()).toString());
  });

  it("agrees on OPERATION_TYPEHASH", async () => {
    const onChain = toHex32(await wallet.OPERATION_TYPEHASH());
    const offChain =
      "0x" + Buffer.from(wc.operationTypehash()).toString("hex");

    assert.strictEqual(
      offChain,
      onChain,
      "OPERATION_TYPE_STRING in wallet-op.ts no longer matches the struct " +
        "string in P256SmartWallet.sol",
    );
  });

  it("agrees on the digest for every vector", async () => {
    for (const v of vectors(wallet.address)) {
      const onChain = toHex32(
        await wallet.operationDigest(
          v.destination,
          v.value.toString(),
          v.data,
          v.nonce.toString(),
          v.deadline.toString(),
        ),
      );

      const offChain = wc.operationDigestHex({
        wallet: walletEvmAddress,
        chainId,
        destination: toEvmAddress(v.destination),
        value: v.value,
        data: v.data,
        nonce: v.nonce,
        deadline: v.deadline,
      });

      assert.strictEqual(offChain, onChain, `digest mismatch — ${v.name}`);
    }
  });

  /**
   * Without this, a comparison that returned a constant on both sides — or
   * compared two `undefined`s — would pass every assertion above.
   */
  it("produces a different digest when a field changes", async () => {
    const base = vectors(wallet.address)[1];
    const changed = { ...base, nonce: base.nonce + 1n };

    const a = toHex32(
      await wallet.operationDigest(
        base.destination,
        base.value.toString(),
        base.data,
        base.nonce.toString(),
        base.deadline.toString(),
      ),
    );
    const b = toHex32(
      await wallet.operationDigest(
        changed.destination,
        changed.value.toString(),
        changed.data,
        changed.nonce.toString(),
        changed.deadline.toString(),
      ),
    );

    assert.notStrictEqual(a, b, "nonce is not reaching the digest");
    assert.notStrictEqual(
      wc.operationDigestHex({
        wallet: walletEvmAddress,
        chainId,
        destination: toEvmAddress(base.destination),
        value: base.value,
        data: base.data,
        nonce: base.nonce,
        deadline: base.deadline,
      }),
      wc.operationDigestHex({
        wallet: walletEvmAddress,
        chainId,
        destination: toEvmAddress(changed.destination),
        value: changed.value,
        data: changed.data,
        nonce: changed.nonce,
        deadline: changed.deadline,
      }),
      "nonce is not reaching the TypeScript digest",
    );
  });

  /**
   * `data` enters the digest as keccak256(data), not inline. Two payloads
   * of the same length must not collide, and the contract must not be
   * hashing the length or the offset instead.
   */
  it("binds the data payload, not just its length", async () => {
    const dest = wallet.address;
    const one = { value: 0n, data: "0x" + "01".repeat(32), nonce: 0n, deadline: 1n };
    const two = { value: 0n, data: "0x" + "02".repeat(32), nonce: 0n, deadline: 1n };

    const digestFor = async (v) =>
      toHex32(
        await wallet.operationDigest(
          dest,
          v.value.toString(),
          v.data,
          v.nonce.toString(),
          v.deadline.toString(),
        ),
      );

    assert.notStrictEqual(await digestFor(one), await digestFor(two));

    for (const v of [one, two]) {
      assert.strictEqual(
        wc.operationDigestHex({
          wallet: walletEvmAddress,
          chainId,
          destination: toEvmAddress(dest),
          value: v.value,
          data: v.data,
          nonce: v.nonce,
          deadline: v.deadline,
        }),
        await digestFor(v),
      );
    }
  });
});
