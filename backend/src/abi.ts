export const FACTORY_ABI = [
  {
    type: "function",
    name: "createVault",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getVault",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "totalVaultsCount",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

export const VAULT_ABI = [
  {
    type: "function",
    name: "depositRoundUp",
    inputs: [{ name: "spendRupees", type: "uint256" }],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "calculateRoundUp",
    inputs: [{ name: "spendRupees", type: "uint256" }],
    outputs: [{ name: "deltaRupees", type: "uint256" }],
    stateMutability: "pure",
  },
  {
    type: "function",
    name: "totalSavedAmount",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "totalDepositsCount",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "currentStreak",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "badgeTier",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;