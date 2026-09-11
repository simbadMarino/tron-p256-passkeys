// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Test-only probe. Not part of the wallet; never deploy it from a
///         migration.
///
/// @dev `P256SmartWallet.operationDigest` folds `block.chainid` into the
///      digest without exposing it, so an off-chain implementation has no
///      way to learn what the chain actually reported. Hardcoding a value
///      (3448148188 for Nile) would make the parity test pass on Nile and
///      silently compare the wrong number on a local TRE node, which is the
///      exact failure a parity test exists to catch. Reading it through the
///      same CHAINID opcode the wallet sees removes the guess.
contract ChainContext {
    function chainId() external view returns (uint256) {
        return block.chainid;
    }
}
