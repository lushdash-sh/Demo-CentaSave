// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {CentaYieldVault} from "./CentaYieldVault.sol";

contract CentaVault {
    address public owner;
    address public relayer;
    IERC20 public mINR;
    CentaYieldVault public yieldVault;

    uint256 public totalSavedAmount;
    uint256 public totalDepositsCount;
    uint256 public currentStreak;
    uint256 public lastDepositDay;
    uint256 public badgeTier; // 0: Rookie, 1: Tapri Regular, 2: Connoisseur, 3: Sovereign

    event RoundUpDeposited(address indexed user, uint256 spendRupees, uint256 savedRupees, uint256 timestamp);
    event Withdrawn(address indexed user, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier onlyRelayer() {
        require(msg.sender == relayer || msg.sender == owner, "Only relayer or owner");
        _;
    }

    constructor(address _owner, address _relayer, address _mINR, address _yieldVault) {
        owner = _owner;
        relayer = _relayer;
        mINR = IERC20(_mINR);
        yieldVault = CentaYieldVault(_yieldVault);
        lastDepositDay = type(uint256).max;
    }

    // Dynamic Round-up Calculation Engine
    function calculateRoundUp(uint256 spendRupees) public pure returns (uint256 deltaRupees) {
        if (spendRupees < 5) return 0; // Floor threshold

        uint256 roundMultiple = (spendRupees <= 25) ? 5 : 10;
        uint256 remainder = spendRupees % roundMultiple;

        if (remainder == 0) return 0;
        return roundMultiple - remainder;
    }

    // Deposit Round-up using mINR stablecoin
    function depositRoundUp(uint256 spendRupees, uint256 amountMlnr) external onlyRelayer {
        uint256 delta = calculateRoundUp(spendRupees);
        require(delta > 0, "No round-up required");
        require(amountMlnr >= delta * 10 ** 18, "Insufficient mINR attached");

        // Pull mINR from relayer / user allowance
        bool success = mINR.transferFrom(msg.sender, address(this), amountMlnr);
        require(success, "mINR transfer failed");

        // Approve and deposit into yield vault
        mINR.approve(address(yieldVault), amountMlnr);
        yieldVault.deposit(amountMlnr, address(this));

        totalSavedAmount += amountMlnr;
        totalDepositsCount += 1;

        // Streak & Badge Logic
        uint256 today = block.timestamp / 1 days;
        if (lastDepositDay == type(uint256).max) {
            currentStreak = 1;
        } else if (today == lastDepositDay + 1) {
            currentStreak += 1;
        } else if (today > lastDepositDay + 1) {
            currentStreak = 1; // Reset streak if day missed
        }
        lastDepositDay = today;

        // Update Badge Tier
        if (currentStreak >= 14 || totalDepositsCount >= 30) {
            badgeTier = 3; // Chai Sovereign
        } else if (currentStreak >= 7 || totalDepositsCount >= 15) {
            badgeTier = 2; // Cutting Connoisseur
        } else if (currentStreak >= 3 || totalDepositsCount >= 5) {
            badgeTier = 1; // Tapri Regular
        } else {
            badgeTier = 0; // Rookie
        }

        emit RoundUpDeposited(owner, spendRupees, delta, block.timestamp);
    }

    // Non-custodial withdrawal back to owner
    function withdraw() external onlyOwner {
        uint256 shares = yieldVault.balanceOf(address(this));
        require(shares > 0, "No balance to withdraw");
        
        // Redeem shares for underlying mINR from yield vault
        yieldVault.redeem(shares, owner, address(this));
        
        emit Withdrawn(owner, totalSavedAmount);
        totalSavedAmount = 0;
    }
}