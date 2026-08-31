// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {P256} from "./P256.sol";

/// @notice Verifies a WebAuthn assertion and binds it to a specific challenge.
///
/// @dev The gap this closes: a passkey never signs your payload. It signs
///      `sha256(authenticatorData ‖ sha256(clientDataJSON))`, and your payload
///      appears only base64url-encoded inside clientDataJSON. Verifying the
///      signature alone therefore proves someone holds the key — not that they
///      approved *this* operation. `verify` is only meaningful because of the
///      challenge check; without it, any assertion the user ever produced on
///      this rpId would authorise anything.
///
///      Modelled on Coinbase's WebAuthn.sol conventions so indices produced by
///      existing tooling line up. Not audited.
library WebAuthn {
    struct Auth {
        bytes authenticatorData;
        string clientDataJSON;
        /// Offset of the `"challenge":"` key within clientDataJSON.
        uint256 challengeIndex;
        /// Offset of the `"type":"` key within clientDataJSON.
        uint256 typeIndex;
        bytes32 r;
        bytes32 s;
    }

    /// authenticatorData flag bits (byte 32).
    uint8 internal constant FLAG_UP = 0x01; // user present
    uint8 internal constant FLAG_UV = 0x04; // user verified
    uint8 internal constant FLAG_BE = 0x08; // backup eligible (immutable)
    uint8 internal constant FLAG_BS = 0x10; // backup state (mutable)

    bytes internal constant EXPECTED_TYPE = '"type":"webauthn.get"';
    bytes internal constant CHALLENGE_KEY = '"challenge":"';

    /// @param challenge The 32 bytes the assertion must be bound to.
    /// @param requireUserVerification Demand a biometric/PIN, not a bare tap.
    ///        Registration-time `userVerification: "preferred"` is only a
    ///        request; this flag is the sole enforceable proof, and a server's
    ///        configuration is invisible from here.
    function verify(
        bytes32 challenge,
        Auth calldata auth,
        bytes32 x,
        bytes32 y,
        bool requireUserVerification
    ) internal view returns (bool) {
        // 32-byte rpIdHash + 1 flags byte + 4-byte counter.
        if (auth.authenticatorData.length < 37) return false;

        uint8 flags = uint8(auth.authenticatorData[32]);
        if (flags & FLAG_UP == 0) return false;
        if (requireUserVerification && flags & FLAG_UV == 0) return false;

        bytes calldata clientData = bytes(auth.clientDataJSON);

        // `"type":"webauthn.get"` — rejects a *creation* response being
        // replayed as an assertion.
        if (!_matches(clientData, auth.typeIndex, EXPECTED_TYPE)) return false;

        // `"challenge":"<base64url(challenge)>"`. The trailing quote is part
        // of the comparison so a longer challenge cannot prefix-match a
        // shorter expected one.
        if (
            !_matches(
                clientData,
                auth.challengeIndex,
                abi.encodePacked(
                    CHALLENGE_KEY,
                    base64UrlEncode32(challenge),
                    '"'
                )
            )
        ) return false;

        bytes32 digest = sha256(
            abi.encodePacked(auth.authenticatorData, sha256(clientData))
        );

        return P256.verify(digest, auth.r, auth.s, x, y);
    }

    /// @dev True when `haystack[offset : offset + needle.length] == needle`.
    ///      Bounds are checked explicitly: calldata slicing would revert on
    ///      overflow, turning a malformed request into a failed transaction
    ///      rather than a clean `false`.
    function _matches(
        bytes calldata haystack,
        uint256 offset,
        bytes memory needle
    ) private pure returns (bool) {
        unchecked {
            if (offset + needle.length < offset) return false; // overflow
            if (offset + needle.length > haystack.length) return false;
        }
        return
            keccak256(haystack[offset:offset + needle.length]) ==
            keccak256(needle);
    }

    /// @notice base64url-encode exactly 32 bytes into 43 unpadded characters.
    /// @dev Specialised to a fixed 32-byte input, which removes every case a
    ///      general encoder has to handle: no padding, no length branches, no
    ///      partial final group beyond the fixed 4-bit tail.
    ///      256 bits = 42 whole 6-bit groups + 4 bits left over; the final
    ///      character carries those 4 bits in its high position.
    ///
    ///      Assembly because this is the hot path: a plain Solidity loop costs
    ///      ~27k gas here — three times the P256VERIFY precompile itself —
    ///      almost all of it bounds checks on 43 single-byte array accesses.
    ///      Correctness is pinned by known vectors plus a fuzzed round-trip
    ///      against an independently written decoder in the test suite.
    function base64UrlEncode32(
        bytes32 data
    ) internal pure returns (bytes memory result) {
        result = new bytes(43);
        assembly ("memory-safe") {
            // Alphabet into scratch space (0x00-0x3f). Two exact 32-byte
            // words, so table[i] is simply the byte at address i. Writing
            // here never touches the free-memory pointer at 0x40.
            mstore(0x00, "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef")
            mstore(0x20, "ghijklmnopqrstuvwxyz0123456789-_")

            let out := add(result, 0x20)

            // Ten groups of three input bytes -> four characters each.
            // Working a group at a time rather than a character at a time
            // cuts the loop from 42 iterations to 10. The stores are
            // unavoidable; the per-character loop overhead was not, and it
            // was most of the cost (4,346 -> 2,773 gas measured).
            //
            // mload(idx) reads 32 bytes from the table onward; byte(0, ..)
            // keeps only table[idx]. Reading past 0x3f is harmless — the
            // trailing bytes are discarded and nothing is written.
            for {
                let i := 0
            } lt(i, 10) {
                i := add(i, 1)
            } {
                let g := and(shr(sub(232, mul(24, i)), data), 0xffffff)
                let o := add(out, mul(i, 4))
                mstore8(o, byte(0, mload(and(shr(18, g), 0x3f))))
                mstore8(add(o, 1), byte(0, mload(and(shr(12, g), 0x3f))))
                mstore8(add(o, 2), byte(0, mload(and(shr(6, g), 0x3f))))
                mstore8(add(o, 3), byte(0, mload(and(g, 0x3f))))
            }

            // 30 bytes consumed, 2 remain: 16 bits -> 3 characters, the last
            // carrying only its 4 significant bits, left-aligned.
            let t := and(data, 0xffff)
            mstore8(add(out, 40), byte(0, mload(and(shr(10, t), 0x3f))))
            mstore8(add(out, 41), byte(0, mload(and(shr(4, t), 0x3f))))
            mstore8(add(out, 42), byte(0, mload(and(shl(2, t), 0x3f))))
        }
    }
}
