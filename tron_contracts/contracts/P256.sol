// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice secp256r1 verification against the P256VERIFY precompile.
/// @dev Live on TRON Nile (getAllowTvmOsaka = 1). NOT on TRON mainnet at the
///      time of writing, where `0x100` has no code — see `verify` for why that
///      case fails closed rather than open.
library P256 {
    address internal constant PRECOMPILE = address(0x100);

    uint256 internal constant N =
        0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551;
    uint256 internal constant HALF_N =
        0x7fffffff800000007fffffffffffffffde737d56d38bcf4279dce5617e3192a8;

    /// @notice Verify `(r, s)` over `hash` for the public key `(x, y)`.
    /// @dev Rejects high-s. The precompile accepts both `s` and `n - s`
    ///      (verified empirically on Nile), so every signature has a valid
    ///      twin. Canonicalising here keeps a signature's identity unique,
    ///      which matters the moment anything keys on it off-chain.
    function verify(
        bytes32 hash,
        bytes32 r,
        bytes32 s,
        bytes32 x,
        bytes32 y
    ) internal view returns (bool) {
        uint256 rInt = uint256(r);
        uint256 sInt = uint256(s);
        if (rInt == 0 || sInt == 0 || rInt >= N || sInt >= N) return false;
        if (sInt > HALF_N) return false;

        (bool ok, bytes memory out) = PRECOMPILE.staticcall(
            abi.encodePacked(hash, r, s, x, y)
        );

        // A staticcall to a codeless address succeeds with empty returndata,
        // so a chain without the precompile would otherwise look like a
        // successful verification. The length check is what makes an absent
        // precompile reject every signature instead of accepting every one.
        return ok && out.length == 32 && abi.decode(out, (uint256)) == 1;
    }
}
