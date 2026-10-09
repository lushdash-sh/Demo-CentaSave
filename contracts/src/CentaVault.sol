// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract CentaVault {
    address public immutable owner;
    address public immutable relayer;

    // Policy parameters
    uint256 public constant MIN_SPEND_FLOOR = 5;      // Ignore transactions < ₹5
    uint256 public constant BASE_BRACKET_LIMIT = 25;   // Below ₹25 -> Round to ₹5, Above -> Round to ₹10

    // Gamification & Metrics
    uint256 public totalDepositsCount;
    uint256 public totalSavedAmount; // In native wei/MON
    uint256 public currentStreak;
    uint256 public lastDepositDay;
    uint256 public badgeTier; // 0: Rookie, 1: Tapri Regular, 2: Cutting Connoisseur, 3: Chai Sovereign

    // Events for UI indexing
    event MicroDepositExecuted(
        address indexed user,
        uint256 spendRupees,
        uint256 savedRupees,
        uint256 valueWei,
        uint256 streak,
        uint256 badgeTier,
        uint256 timestamp
    );
    event BadgeTierUnlocked(address indexed user, uint256 newTier, string title);
    event FundsWithdrawn(address indexed owner, uint256 amount);

    modifier onlyAuthorized() {
        require(msg.sender == owner || msg.sender == relayer, "Unauthorized");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    constructor(address _owner, address _relayer) {
        require(_owner != address(0), "Zero address owner");
        require(_relayer != address(0), "Zero address relayer");
        owner = _owner;
        relayer = _relayer;
        lastDepositDay = type(uint256).max;
    }

    /// @notice Calculates the required round-up in whole rupees
    /// @param spendRupees The original payment amount (e.g. ₹12)
    /// @return deltaRupees The amount of loose change to sweep (e.g. ₹3)
    function calculateRoundUp(uint256 spendRupees) public pure returns (uint256 deltaRupees) {
        if (spendRupees < MIN_SPEND_FLOOR) {
            return 0;
        }

        uint256 multiple = spendRupees <= BASE_BRACKET_LIMIT ? 5 : 10;
        uint256 remainder = spendRupees % multiple;

        if (remainder == 0) {
            return 0;
        }

        return multiple - remainder;
    }

    /// @notice Sweep micro-change into the vault
    /// @param spendRupees Original fiat spend amount for metrics calculation
    function depositRoundUp(uint256 spendRupees) external payable onlyAuthorized {
        require(msg.value > 0, "No value sent");

        uint256 deltaRupees = calculateRoundUp(spendRupees);
        totalSavedAmount += msg.value;
        totalDepositsCount += 1;

        // Daily Streak Evaluation (86400 seconds per day)
        uint256 today = block.timestamp / 1 days;
        if (lastDepositDay == type(uint256).max) {
            currentStreak = 1;
        } else if (today == lastDepositDay + 1) {
            currentStreak += 1;
        } else if (today > lastDepositDay + 1) {
            currentStreak = 1;
        }
        lastDepositDay = today;

        _updateBadgeTier();

        emit MicroDepositExecuted(
            owner,
            spendRupees,
            deltaRupees,
            msg.value,
            currentStreak,
            badgeTier,
            block.timestamp
        );
    }

    function _updateBadgeTier() internal {
        uint256 previousTier = badgeTier;

        if (currentStreak >= 14 || totalDepositsCount >= 30) {
            badgeTier = 3;
        } else if (currentStreak >= 7 || totalDepositsCount >= 15) {
            badgeTier = 2;
        } else if (currentStreak >= 3 || totalDepositsCount >= 5) {
            badgeTier = 1;
        }

        if (badgeTier > previousTier) {
            string memory title = badgeTier == 1 ? "Tapri Regular" : (badgeTier == 2 ? "Cutting Connoisseur" : "Chai Sovereign");
            emit BadgeTierUnlocked(owner, badgeTier, title);
        }
    }

    /// @notice Withdraw accumulated savings back to user wallet
    function withdraw() external onlyOwner {
        uint256 amount = address(this).balance;
        require(amount > 0, "Vault empty");

        // Checks-Effects-Interactions: Emit event BEFORE external value transfer
        emit FundsWithdrawn(owner, amount);

        (bool success, ) = payable(owner).call{value: amount}("");
        require(success, "Transfer failed");
    }

    receive() external payable {
        totalSavedAmount += msg.value;
    }
}