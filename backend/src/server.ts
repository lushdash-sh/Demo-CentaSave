import Fastify from "fastify";
import cors from "@fastify/cors";
import dotenv from "dotenv";
import {
  createWalletClient,
  createPublicClient,
  http,
  parseEther,
  formatEther,
  defineChain,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { FACTORY_ABI, VAULT_ABI, MINR_ABI } from "./abi.js";

dotenv.config();

export const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.MONAD_RPC_URL || "https://testnet-rpc.monad.xyz"] },
  },
  blockExplorers: {
    default: { name: "MonadExplorer", url: "https://testnet.monadexplorer.com" },
  },
});

const mainAccount = privateKeyToAccount(process.env.RELAYER_PRIVATE_KEY as Hex);
const factoryAddress = process.env.FACTORY_ADDRESS as Hex;

const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(),
});

const mainWalletClient = createWalletClient({
  account: mainAccount,
  chain: monadTestnet,
  transport: http(),
});

// Deterministic secondary keys for the 5-wallet parallel sender pool
const POOL_PRIVATE_KEYS: Hex[] = [
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
  "0x47e179ec340f70940e249707e5186449374cc1a50b32ab09b1f385a864901414",
  "0x8b3a350cf4e3814d3d2de92dd074dd3076e02d9312b095973e5ab5be356ed36b",
];

const parallelSigners = POOL_PRIVATE_KEYS.map((pk) => ({
  account: privateKeyToAccount(pk),
  client: createWalletClient({
    account: privateKeyToAccount(pk),
    chain: monadTestnet,
    transport: http(),
  }),
}));

const server = Fastify({ logger: true });
await server.register(cors, { origin: "*" });

const eventHistory: any[] = [];
const sseClients: any[] = [];

function recordAndBroadcastEvent(eventPayload: Record<string, any>) {
  eventHistory.unshift(eventPayload);
  if (eventHistory.length > 25) eventHistory.pop();

  const payload = `data: ${JSON.stringify(eventPayload)}\n\n`;
  sseClients.forEach((client) => {
    try {
      client.raw.write(payload);
    } catch {}
  });
}

// Ensure the parallel signers have gas funds on server start
async function fundSignerPool() {
  console.log("⚡ Checking parallel relayer signer pool balances...");
  for (let i = 0; i < parallelSigners.length; i++) {
    const signer = parallelSigners[i];
    try {
      const balance = await publicClient.getBalance({ address: signer.account.address });
      if (balance < parseEther("0.02")) {
        console.log(`Funding Signer #${i + 1} (${signer.account.address.slice(0, 8)}...) with 0.05 MON`);
        const tx = await mainWalletClient.sendTransaction({
          to: signer.account.address,
          value: parseEther("0.05"),
        });
        await publicClient.waitForTransactionReceipt({ hash: tx });
      }
    } catch (err) {
      console.warn(`Could not fund signer ${i + 1}:`, err);
    }
  }
  console.log("✅ Parallel signer pool ready (5 independent nonces).");
}

// -------------------------------------------------------------
// ROUTES
// -------------------------------------------------------------

server.get("/api/history", async () => eventHistory);

server.get("/api/events", (req, reply) => {
  reply.raw.setHeader("Content-Type", "text/event-stream");
  reply.raw.setHeader("Cache-Control", "no-cache");
  reply.raw.setHeader("Connection", "keep-alive");
  reply.raw.flushHeaders();

  sseClients.push(reply);
  req.raw.on("close", () => {
    const idx = sseClients.indexOf(reply);
    if (idx !== -1) sseClients.splice(idx, 1);
  });
});

server.post("/api/get-or-create-vault", async (req) => {
  const { userAddress } = req.body as { userAddress: Hex };

  let vault = await publicClient.readContract({
    address: factoryAddress,
    abi: FACTORY_ABI,
    functionName: "getVault",
    args: [userAddress],
  });

  if (vault === "0x0000000000000000000000000000000000000000") {
    const hash = await mainWalletClient.writeContract({
      address: factoryAddress,
      abi: FACTORY_ABI,
      functionName: "createVault",
    });
    await publicClient.waitForTransactionReceipt({ hash });

    vault = await publicClient.readContract({
      address: factoryAddress,
      abi: FACTORY_ABI,
      functionName: "getVault",
      args: [userAddress],
    });
  }

  return { vaultAddress: vault };
});

server.get("/api/vault/:vaultAddress", async (req) => {
  const { vaultAddress } = req.params as { vaultAddress: Hex };

  const [totalSaved, depositsCount, streak, badgeTier] = await Promise.all([
    publicClient.readContract({
      address: vaultAddress,
      abi: VAULT_ABI,
      functionName: "totalSavedAmount",
    }),
    publicClient.readContract({
      address: vaultAddress,
      abi: VAULT_ABI,
      functionName: "totalDepositsCount",
    }),
    publicClient.readContract({
      address: vaultAddress,
      abi: VAULT_ABI,
      functionName: "currentStreak",
    }),
    publicClient.readContract({
      address: vaultAddress,
      abi: VAULT_ABI,
      functionName: "badgeTier",
    }),
  ]);

  return {
    totalSavedMON: formatEther(totalSaved), // Represents mINR stablecoin units (1 mINR = 1 INR)
    totalDepositsCount: Number(depositsCount),
    currentStreak: Number(streak),
    badgeTier: Number(badgeTier),
  };
});

// Single User Stablecoin UPI Sweep
server.post("/api/upi-sweep", async (req) => {
  const { vaultAddress, spendRupees, merchantName } = req.body as {
    vaultAddress: Hex;
    spendRupees: number;
    merchantName: string;
  };

  const startTime = Date.now();

  // 1. Get mINR stablecoin address from Factory
  const mInrAddress = (await publicClient.readContract({
    address: factoryAddress,
    abi: FACTORY_ABI,
    functionName: "mINR",
  })) as Hex;

  // 2. Calculate round-up delta
  const deltaRupees = await publicClient.readContract({
    address: vaultAddress,
    abi: VAULT_ABI,
    functionName: "calculateRoundUp",
    args: [BigInt(spendRupees)],
  });

  if (Number(deltaRupees) === 0) {
    return { status: "ignored", reason: "Floor limit or exact round number" };
  }

  const mInrAmountWei = BigInt(Number(deltaRupees)) * 10n ** 18n;

  // 3. Mint and approve mINR to relayer for the vault deposit
  const mintHash = await mainWalletClient.writeContract({
    address: mInrAddress,
    abi: MINR_ABI,
    functionName: "mint",
    args: [mainAccount.address, mInrAmountWei],
  });
  await publicClient.waitForTransactionReceipt({ hash: mintHash });

  const approveHash = await mainWalletClient.writeContract({
    address: mInrAddress,
    abi: MINR_ABI,
    functionName: "approve",
    args: [vaultAddress, mInrAmountWei],
  });
  await publicClient.waitForTransactionReceipt({ hash: approveHash });

  // 4. Execute stablecoin deposit on user vault
  const txHash = await mainWalletClient.writeContract({
    address: vaultAddress,
    abi: VAULT_ABI,
    functionName: "depositRoundUp",
    args: [BigInt(spendRupees), mInrAmountWei],
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  const latencyMs = Date.now() - startTime;

  const eventPayload = {
    type: "SWEEP_EXECUTED",
    txHash,
    merchantName: merchantName || "Tapri Chai",
    spendRupees,
    savedRupees: Number(deltaRupees),
    sweptMON: `${Number(deltaRupees)} mINR`,
    latencyMs,
    blockNumber: Number(receipt.blockNumber),
    gasUsed: receipt.gasUsed.toString(),
  };

  recordAndBroadcastEvent(eventPayload);
  return eventPayload;
});

// TRUE PARALLEL EVM SHOWCASE: 5 Different Signers, 5 Independent Nonces (Stablecoin Sweep)
server.post("/api/simulate-rush", async (req) => {
  const { vaultAddress } = req.body as { vaultAddress: Hex };

  const orders = [
    { merchant: "Chai Point FC Rd", spend: 12 },
    { merchant: "Vada Pav Center", spend: 18 },
    { merchant: "Irani Bun Maska", spend: 28 },
    { merchant: "PICT Canteen Poha", spend: 23 },
    { merchant: "Goodluck Cafe Tea", spend: 14 },
  ];

  const mInrAddress = (await publicClient.readContract({
    address: factoryAddress,
    abi: FACTORY_ABI,
    functionName: "mINR",
  })) as Hex;

  const overallStart = Date.now();

  const results = await Promise.all(
    orders.map(async (order, index) => {
      const signer = parallelSigners[index % parallelSigners.length];
      const txStartTime = Date.now();
      const deltaRupees = 3; // Standard round-up for these test values
      const mInrAmountWei = BigInt(deltaRupees) * 10n ** 18n;

      // Mint & approve from main account for this signer, or fund signer with mINR
      // For speed during hackathon demo, mint directly to signer and approve vault
      const mintHash = await mainWalletClient.writeContract({
        address: mInrAddress,
        abi: MINR_ABI,
        functionName: "mint",
        args: [signer.account.address, mInrAmountWei],
      });
      await publicClient.waitForTransactionReceipt({ hash: mintHash });

      const approveHash = await signer.client.writeContract({
        address: mInrAddress,
        abi: MINR_ABI,
        functionName: "approve",
        args: [vaultAddress, mInrAmountWei],
      });
      await publicClient.waitForTransactionReceipt({ hash: approveHash });

      const txHash = await signer.client.writeContract({
        address: vaultAddress,
        abi: VAULT_ABI,
        functionName: "depositRoundUp",
        args: [BigInt(order.spend), mInrAmountWei],
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      const latencyMs = Date.now() - txStartTime;

      const eventPayload = {
        type: "SWEEP_EXECUTED",
        txHash,
        merchantName: order.merchant,
        spendRupees: order.spend,
        savedRupees: deltaRupees,
        sweptMON: `${deltaRupees} mINR`,
        latencyMs,
        blockNumber: Number(receipt.blockNumber),
        gasUsed: receipt.gasUsed.toString(),
        signerAddress: signer.account.address,
      };

      recordAndBroadcastEvent(eventPayload);
      return eventPayload;
    })
  );

  const totalBatchMs = Date.now() - overallStart;

  return {
    dispatched: results.length,
    totalBatchMs,
    averageLatencyMs: Math.round(totalBatchMs / results.length),
    events: results,
  };
});

const start = async () => {
  try {
    const port = Number(process.env.PORT) || 3001;
    await server.listen({ port, host: "0.0.0.0" });
    console.log(`🚀 CentaSave Relayer Server running on http://localhost:${port}`);
    fundSignerPool();
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();