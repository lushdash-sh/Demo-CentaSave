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
import { FACTORY_ABI, VAULT_ABI } from "./abi.js";

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

const account = privateKeyToAccount(process.env.RELAYER_PRIVATE_KEY as Hex);
const factoryAddress = process.env.FACTORY_ADDRESS as Hex;

const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(),
});

const walletClient = createWalletClient({
  account,
  chain: monadTestnet,
  transport: http(),
});

const server = Fastify({ logger: true });
await server.register(cors, { origin: "*" });

// Keep recent transaction history in memory so reloads don't wipe the UI
const eventHistory: any[] = [];
const sseClients: any[] = [];

function recordAndBroadcastEvent(eventPayload: Record<string, any>) {
  eventHistory.unshift(eventPayload);
  if (eventHistory.length > 20) eventHistory.pop();

  const payload = `data: ${JSON.stringify(eventPayload)}\n\n`;
  sseClients.forEach((client) => {
    try {
      client.raw.write(payload);
    } catch {}
  });
}

// -------------------------------------------------------------
// ROUTES
// -------------------------------------------------------------

// Return transaction history on page load
server.get("/api/history", async () => {
  return eventHistory;
});

// SSE Stream
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

// Get or Create user vault
server.post("/api/get-or-create-vault", async (req, reply) => {
  const { userAddress } = req.body as { userAddress: Hex };

  let vault = await publicClient.readContract({
    address: factoryAddress,
    abi: FACTORY_ABI,
    functionName: "getVault",
    args: [userAddress],
  });

  if (vault === "0x0000000000000000000000000000000000000000") {
    const hash = await walletClient.writeContract({
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

// Read Vault Status
server.get("/api/vault/:vaultAddress", async (req, reply) => {
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
    totalSavedMON: formatEther(totalSaved),
    totalDepositsCount: Number(depositsCount),
    currentStreak: Number(streak),
    badgeTier: Number(badgeTier),
  };
});

// UPI Sweep Trigger
server.post("/api/upi-sweep", async (req, reply) => {
  const { vaultAddress, spendRupees, merchantName } = req.body as {
    vaultAddress: Hex;
    spendRupees: number;
    merchantName: string;
  };

  const startTime = Date.now();

  const deltaRupees = await publicClient.readContract({
    address: vaultAddress,
    abi: VAULT_ABI,
    functionName: "calculateRoundUp",
    args: [BigInt(spendRupees)],
  });

  if (Number(deltaRupees) === 0) {
    return { status: "ignored", reason: "Floor limit or exact round number" };
  }

  const monToSweep = (Number(deltaRupees) * 0.0001).toFixed(6);

  const txHash = await walletClient.writeContract({
    address: vaultAddress,
    abi: VAULT_ABI,
    functionName: "depositRoundUp",
    args: [BigInt(spendRupees)] as const,
    value: parseEther(monToSweep),
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  const latencyMs = Date.now() - startTime;

  const eventPayload = {
    type: "SWEEP_EXECUTED",
    txHash,
    merchantName: merchantName || "Tapri Chai",
    spendRupees,
    savedRupees: Number(deltaRupees),
    sweptMON: monToSweep,
    latencyMs,
    blockNumber: Number(receipt.blockNumber),
    gasUsed: receipt.gasUsed.toString(),
  };

  recordAndBroadcastEvent(eventPayload);
  return eventPayload;
});

// Stress Test: Simulate "Pune Campus Rush"
server.post("/api/simulate-rush", async (req, reply) => {
  const { vaultAddress } = req.body as { vaultAddress: Hex };

  const orders = [
    { merchant: "Chai Point", spend: 12 },
    { merchant: "FC Road Poha", spend: 23 },
    { merchant: "Irani Bun Maska", spend: 28 },
    { merchant: "Vada Pav Stall", spend: 18 },
    { merchant: "Cold Coffee Corner", spend: 32 },
  ];

  const results = await Promise.all(
    orders.map(async (order) => {
      const startTime = Date.now();
      const monToSweep = "0.0003";
      const txHash = await walletClient.writeContract({
        address: vaultAddress,
        abi: VAULT_ABI,
        functionName: "depositRoundUp",
        args: [BigInt(order.spend)],
        value: parseEther(monToSweep),
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      const latencyMs = Date.now() - startTime;

      const eventPayload = {
        type: "SWEEP_EXECUTED",
        txHash,
        merchantName: order.merchant,
        spendRupees: order.spend,
        savedRupees: 3,
        sweptMON: monToSweep,
        latencyMs,
        blockNumber: Number(receipt.blockNumber),
        gasUsed: receipt.gasUsed.toString(),
      };

      recordAndBroadcastEvent(eventPayload);
      return eventPayload;
    })
  );

  return { dispatched: results.length, events: results };
});

const start = async () => {
  try {
    const port = Number(process.env.PORT) || 3001;
    await server.listen({ port, host: "0.0.0.0" });
    console.log(`🚀 CentaSave Relayer Server running on http://localhost:${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();