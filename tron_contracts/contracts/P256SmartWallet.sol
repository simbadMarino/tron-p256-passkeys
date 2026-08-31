// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {WebAuthn} from "./WebAuthn.sol";

/// @notice Minimal single-passkey wallet. Not audited; do not use for real funds.
///
/// @dev Differs from a raw-P256 (Secure Enclave) wallet in exactly one place,
///      and it is the place that matters: the operation digest is not what
///      gets verified. A passkey signs
///      `sha256(authenticatorData ‖ sha256(clientDataJSON))`, so the digest
///      instead becomes the *challenge* that the assertion must be bound to.
///      `operationDigest` is otherwise unchanged in role and shape.
///
///      Known limits, named rather than hidden:
///        - one immutable key, so no rotation and no recovery. Losing the
///          passkey loses the wallet.
///        - a synced passkey (BE=1) means the key also lives in the provider's
///          cloud; this contract cannot tell that apart from a device-bound
///          one except via the BE flag, which it does not currently gate on.
contract P256SmartWallet {
    /// @dev keccak256, not sha256: the typehash only needs domain separation,
    ///      and sha256 in Solidity is a precompile call charged on every use.
    bytes32 public constant OPERATION_TYPEHASH =
        keccak256(
            "P256WalletOperation(address wallet,uint256 chainId,address to,uint256 value,bytes32 dataHash,uint256 nonce,uint256 deadline)"
        );

    bytes32 public immutable publicKeyX;
    bytes32 public immutable publicKeyY;

    /// @dev Requiring UV means a bare tap cannot move funds. Immutable so the
    ///      policy cannot be weakened after deployment.
    bool public immutable requireUserVerification;

    uint256 public nonce;

    error InvalidPublicKey();
    error InvalidNonce(uint256 expected, uint256 supplied);
    error OperationExpired(uint256 deadline, uint256 currentTimestamp);
    error InvalidSignature();
    error CallFailed(bytes returnData);

    event Executed(
        bytes32 indexed challenge,
        uint256 indexed nonce,
        address indexed destination,
        uint256 value,
        bytes data,
        bytes returnData
    );

    constructor(bytes32 x, bytes32 y, bool requireUv) {
        if (x == bytes32(0) || y == bytes32(0)) revert InvalidPublicKey();
        publicKeyX = x;
        publicKeyY = y;
        requireUserVerification = requireUv;
    }

    receive() external payable {}

    /// @notice The value a passkey must carry as its WebAuthn challenge.
    /// @dev Binds the operation to this wallet and this chain, so an assertion
    ///      cannot be replayed against another deployment of the same code.
    function operationDigest(
        address destination,
        uint256 value,
        bytes calldata data,
        uint256 operationNonce,
        uint256 deadline
    ) public view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    OPERATION_TYPEHASH,
                    address(this),
                    block.chainid,
                    destination,
                    value,
                    keccak256(data),
                    operationNonce,
                    deadline
                )
            );
    }

    function execute(
        address destination,
        uint256 value,
        bytes calldata data,
        uint256 operationNonce,
        uint256 deadline,
        WebAuthn.Auth calldata auth
    ) external returns (bytes memory returnData) {
        if (operationNonce != nonce) revert InvalidNonce(nonce, operationNonce);
        if (block.timestamp > deadline) {
            revert OperationExpired(deadline, block.timestamp);
        }

        bytes32 challenge = operationDigest(
            destination,
            value,
            data,
            operationNonce,
            deadline
        );

        if (
            !WebAuthn.verify(
                challenge,
                auth,
                publicKeyX,
                publicKeyY,
                requireUserVerification
            )
        ) revert InvalidSignature();

        // Consume the nonce before the external call. A revert unwinds it, and
        // a reentrant call would need a fresh assertion over nonce + 1, which
        // the caller cannot produce.
        nonce = operationNonce + 1;

        bool success;
        (success, returnData) = destination.call{value: value}(data);
        if (!success) revert CallFailed(returnData);

        emit Executed(
            challenge,
            operationNonce,
            destination,
            value,
            data,
            returnData
        );
    }
}
