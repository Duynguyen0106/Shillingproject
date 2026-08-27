// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/ShillOpsRedeemer.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Minimal ERC-20 token for testing
contract MockToken is ERC20 {
    constructor() ERC20("Mock", "MOCK") {
        _mint(msg.sender, 1_000_000 ether);
    }
}

contract ShillOpsRedeemerTest is Test {
    ShillOpsRedeemer redeemer;
    MockToken token;

    uint256 signerPk = 0xDEADBEEF;
    address signer;
    address claimer = address(0xBEEF);

    function setUp() public {
        signer = vm.addr(signerPk);
        token = new MockToken();
        redeemer = new ShillOpsRedeemer(signer, address(token));
        // Fund the redeemer
        token.transfer(address(redeemer), 100_000 ether);
    }

    function _sign(address _claimer, uint256 amount, string memory nonce) internal view returns (bytes memory) {
        bytes32 msgHash = keccak256(abi.encodePacked(_claimer, address(token), amount, nonce));
        bytes32 ethHash = MessageHashUtils.toEthSignedMessageHash(msgHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, ethHash);
        return abi.encodePacked(r, s, v);
    }

    function test_claim_success() public {
        uint256 amount = 500 ether;
        string memory nonce = "test-nonce-001";
        bytes memory sig = _sign(claimer, amount, nonce);

        vm.prank(claimer);
        redeemer.claim(amount, nonce, sig);

        assertEq(token.balanceOf(claimer), amount);
        assertTrue(redeemer.isNonceUsed(nonce));
    }

    function test_claim_replay_reverts() public {
        uint256 amount = 100 ether;
        string memory nonce = "replay-nonce";
        bytes memory sig = _sign(claimer, amount, nonce);

        vm.prank(claimer);
        redeemer.claim(amount, nonce, sig);

        vm.prank(claimer);
        vm.expectRevert(ShillOpsRedeemer.NonceAlreadyUsed.selector);
        redeemer.claim(amount, nonce, sig);
    }

    function test_claim_invalid_sig_reverts() public {
        uint256 amount = 100 ether;
        string memory nonce = "bad-sig-nonce";
        bytes memory badSig = _sign(address(0x1234), amount, nonce); // signed for wrong address

        vm.prank(claimer);
        vm.expectRevert(ShillOpsRedeemer.InvalidSignature.selector);
        redeemer.claim(amount, nonce, badSig);
    }

    function test_claim_tampered_amount_reverts() public {
        string memory nonce = "tamper-nonce";
        bytes memory sig = _sign(claimer, 100 ether, nonce);

        vm.prank(claimer);
        vm.expectRevert(ShillOpsRedeemer.InvalidSignature.selector);
        redeemer.claim(999 ether, nonce, sig); // tampered amount
    }

    function test_insufficient_balance_reverts() public {
        uint256 amount = 200_000 ether; // more than funded
        string memory nonce = "big-claim";
        bytes memory sig = _sign(claimer, amount, nonce);

        vm.prank(claimer);
        vm.expectRevert(ShillOpsRedeemer.InsufficientContractBalance.selector);
        redeemer.claim(amount, nonce, sig);
    }

    function test_owner_can_withdraw() public {
        uint256 before = token.balanceOf(address(this));
        redeemer.withdrawTokens(address(token), 1000 ether);
        assertEq(token.balanceOf(address(this)), before + 1000 ether);
    }

    function test_owner_can_update_signer() public {
        address newSigner = address(0xABCD);
        redeemer.setSigner(newSigner);
        assertEq(redeemer.signer(), newSigner);
    }
}
