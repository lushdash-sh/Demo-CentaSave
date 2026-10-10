// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CentaVault} from "../src/CentaVault.sol";
import {CentaVaultFactory} from "../src/CentaVaultFactory.sol";
import {MockINR} from "../src/MockINR.sol";

contract CentaVaultTest is Test {
    CentaVault public vault;
    CentaVaultFactory public factory;
    MockINR public token;

    address public owner = address(0x1111);
    address public relayer = address(0x2222);
    address public attacker = address(0x3333);

    function setUp() public {
        factory = new CentaVaultFactory(relayer);
        token = MockINR(factory.mINR());

        token.mint(relayer, 1_000_000e18);
        token.mint(owner, 1_000_000e18);

        vm.prank(owner);
        address vaultAddress = factory.createVault();
        vault = CentaVault(payable(vaultAddress));
    }

    /* -------------------------------------------------------------------------- */
    /*                         1. ROUNDING ENGINE TESTS                           */
    /* -------------------------------------------------------------------------- */

    function test_RoundingCalculations() public view {
        // Floor Threshold (< 5 should be ignored)
        assertEq(vault.calculateRoundUp(2), 0, "Spend < 5 must yield 0 round-up");
        assertEq(vault.calculateRoundUp(4), 0, "Spend < 5 must yield 0 round-up");

        // Micro Bracket (<= 25 -> nearest 5)
        assertEq(vault.calculateRoundUp(12), 3, "12 should round to 15 (delta = 3)");
        assertEq(vault.calculateRoundUp(14), 1, "14 should round to 15 (delta = 1)");
        assertEq(vault.calculateRoundUp(20), 0, "20 exact multiple should yield 0");

        // Standard Bracket (> 25 -> nearest 10)
        assertEq(vault.calculateRoundUp(28), 2, "28 should round to 30 (delta = 2)");
        assertEq(vault.calculateRoundUp(64), 6, "64 should round to 70 (delta = 6)");
        assertEq(vault.calculateRoundUp(14423), 7, "14423 should round to 14430 (delta = 7)");
        assertEq(vault.calculateRoundUp(50), 0, "50 exact multiple should yield 0");
    }

    /* -------------------------------------------------------------------------- */
    /*                         2. DEPOSITS & STREAKS TESTS                        */
    /* -------------------------------------------------------------------------- */

    function test_DepositRecordsCorrectly() public {
        uint256 depositAmount = 3e18; // 12 rounds up by 3 mINR

        vm.prank(relayer);
        token.approve(address(vault), depositAmount);
        vm.prank(relayer);
        vault.depositRoundUp(12, depositAmount);

        assertEq(vault.totalSavedAmount(), depositAmount);
        assertEq(vault.totalDepositsCount(), 1);
        assertEq(vault.currentStreak(), 1);
        assertEq(vault.badgeTier(), 0); // Tier 0: Rookie
    }

    function test_StreakIncrementsAcrossConsecutiveDays() public {
        uint256 depositAmount = 3e18; // 12 rounds up by 3 mINR

        // Day 1
        vm.prank(relayer);
        token.approve(address(vault), depositAmount);
        vm.prank(relayer);
        vault.depositRoundUp(12, depositAmount);
        assertEq(vault.currentStreak(), 1);

        // Day 2 (Advance time by 1 day)
        vm.warp(block.timestamp + 1 days);
        vm.prank(relayer);
        token.approve(address(vault), depositAmount);
        vm.prank(relayer);
        vault.depositRoundUp(12, depositAmount);
        assertEq(vault.currentStreak(), 2);

        // Day 3
        vm.warp(block.timestamp + 1 days);
        vm.prank(relayer);
        token.approve(address(vault), depositAmount);
        vm.prank(relayer);
        vault.depositRoundUp(12, depositAmount);
        assertEq(vault.currentStreak(), 3);
        assertEq(vault.badgeTier(), 1, "3-day streak should unlock Tier 1: Tapri Regular");
    }

    function test_StreakResetsAfterMissedDay() public {
        uint256 depositAmount = 3e18; // 12 rounds up by 3 mINR

        // Day 1
        vm.prank(relayer);
        token.approve(address(vault), depositAmount);
        vm.prank(relayer);
        vault.depositRoundUp(12, depositAmount);

        // Fast forward 3 days without transactions
        vm.warp(block.timestamp + 3 days);

        // Next deposit resets streak to 1
        vm.prank(relayer);
        token.approve(address(vault), depositAmount);
        vm.prank(relayer);
        vault.depositRoundUp(12, depositAmount);
        assertEq(vault.currentStreak(), 1, "Streak must reset to 1 after missed days");
    }

    /* -------------------------------------------------------------------------- */
    /*                         3. SECURITY & WITHDRAWAL                           */
    /* -------------------------------------------------------------------------- */

    function test_OnlyOwnerCanWithdraw() public {
        uint256 depositAmount = 3e18; // 12 rounds up by 3 mINR

        vm.prank(relayer);
        token.approve(address(vault), depositAmount);
        vm.prank(relayer);
        vault.depositRoundUp(12, depositAmount);

        // Attacker attempts withdrawal
        vm.prank(attacker);
        vm.expectRevert("Only owner");
        vault.withdraw();

        // Legitimate owner withdraws
        uint256 balanceBefore = token.balanceOf(owner);
        vm.prank(owner);
        vault.withdraw();
        assertEq(token.balanceOf(owner), balanceBefore + depositAmount);
    }
}