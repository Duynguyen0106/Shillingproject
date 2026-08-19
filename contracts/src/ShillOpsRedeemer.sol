// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title ShillOpsRedeemer
 * @notice Allows ShillOps point holders to redeem ERC-20 tokens using a
 *         server-generated ECDSA signature. The server signs a claim
 *         containing (claimer, token, amount, nonce) and this contract
 *         verifies the signature before transferring tokens.
 *
 * Deployment checklist:
 *   1. Deploy this contract with the signer address from CLAIM_SIGNER_KEY
 *   2. Transfer (or approve) tokens to this contract address
 *   3. Set contractAddress in the ShillOps community to this contract
 */
contract ShillOpsRedeemer is Ownable {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;
    using SafeERC20 for IERC20;

    /// @notice The trusted signer whose key the ShillOps API uses
    address public signer;

    /// @notice ERC-20 token distributed as rewards
    IERC20 public rewardToken;

    /// @notice Tracks used nonces to prevent replay attacks
    mapping(string => bool) public usedNonces;

    event Claimed(address indexed claimer, uint256 amount, string nonce);
    event SignerUpdated(address indexed newSigner);
    event TokenUpdated(address indexed newToken);

    error InvalidSignature();
    error NonceAlreadyUsed();
    error InsufficientContractBalance();

    constructor(address _signer, address _rewardToken) Ownable(msg.sender) {
        signer = _signer;
        rewardToken = IERC20(_rewardToken);
    }

    /**
     * @notice Claim reward tokens using a ShillOps-issued signature.
     * @param amount   Token amount in wei (18 decimals)
     * @param nonce    Unique nonce string from the ShillOps API
     * @param signature ECDSA signature from the ShillOps signer key
     */
    function claim(
        uint256 amount,
        string calldata nonce,
        bytes calldata signature
    ) external {
        if (usedNonces[nonce]) revert NonceAlreadyUsed();

        // Reconstruct the message the server signed:
        // keccak256(abi.encodePacked(claimer, token, amount, nonce))
        bytes32 msgHash = keccak256(
            abi.encodePacked(msg.sender, address(rewardToken), amount, nonce)
        );
        bytes32 ethHash = msgHash.toEthSignedMessageHash();
        address recovered = ethHash.recover(signature);

        if (recovered != signer) revert InvalidSignature();

        if (rewardToken.balanceOf(address(this)) < amount) {
            revert InsufficientContractBalance();
        }

        usedNonces[nonce] = true;
        rewardToken.safeTransfer(msg.sender, amount);

        emit Claimed(msg.sender, amount, nonce);
    }

    // ── Admin functions ──────────────────────────────────────────

    /// @notice Update the trusted signer address
    function setSigner(address _signer) external onlyOwner {
        signer = _signer;
        emit SignerUpdated(_signer);
    }

    /// @notice Update the reward token (e.g. after a token migration)
    function setRewardToken(address _token) external onlyOwner {
        rewardToken = IERC20(_token);
        emit TokenUpdated(_token);
    }

    /// @notice Withdraw any ERC-20 token from this contract (emergency)
    function withdrawTokens(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(owner(), amount);
    }

    /// @notice View: check if a nonce has been used
    function isNonceUsed(string calldata nonce) external view returns (bool) {
        return usedNonces[nonce];
    }
}
