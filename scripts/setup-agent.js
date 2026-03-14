/**
 * THE BURNING COMPANY — Pump.fun Tokenized Agent Setup
 *
 * Run this ONCE after deploying $BURNING on pump.fun.
 * It initializes the tokenized agent with the buyback percentage.
 *
 * Usage:
 *   node scripts/setup-agent.js
 *
 * Prerequisites:
 *   - Token already launched on pump.fun
 *   - AGENT_TOKEN_MINT_ADDRESS set in .env
 *   - AGENT_WALLET_PRIVATE_KEY set in .env (the token creator wallet)
 */

import "dotenv/config";
import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { PumpAgent } from "@pump-fun/agent-payments-sdk";
import bs58 from "bs58";

const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;

async function setup() {
  console.log("\n  === THE BURNING COMPANY — Agent Setup ===\n");

  // Validate env
  if (!process.env.AGENT_TOKEN_MINT_ADDRESS) {
    console.error("ERROR: Set AGENT_TOKEN_MINT_ADDRESS in .env first");
    process.exit(1);
  }
  if (!process.env.AGENT_WALLET_PRIVATE_KEY) {
    console.error("ERROR: Set AGENT_WALLET_PRIVATE_KEY in .env first");
    process.exit(1);
  }

  const connection = new Connection(HELIUS_RPC, "confirmed");
  const wallet = Keypair.fromSecretKey(
    bs58.decode(process.env.AGENT_WALLET_PRIVATE_KEY)
  );
  const mint = new PublicKey(process.env.AGENT_TOKEN_MINT_ADDRESS);

  // 80% buyback = 8000 BPS (basis points)
  // Change this to 10000 for 100% buyback
  const BUYBACK_BPS = parseInt(process.env.BUYBACK_BPS || "8000");

  console.log("  Token mint:", mint.toBase58());
  console.log("  Authority:", wallet.publicKey.toBase58());
  console.log("  Buyback %:", BUYBACK_BPS / 100 + "%");
  console.log("  RPC:", HELIUS_RPC.slice(0, 50) + "...");
  console.log();

  // Initialize the PumpAgent
  const agent = new PumpAgent(mint, "mainnet", connection);

  // Step 1: Initialize the tokenized agent
  console.log("  [1/2] Initializing tokenized agent...");
  try {
    const initIx = await agent.create({
      authority: wallet.publicKey,
      mint: mint,
      agentAuthority: wallet.publicKey,
      buybackBps: BUYBACK_BPS,
    });

    const tx = new Transaction().add(initIx);
    const sig = await sendAndConfirmTransaction(connection, tx, [wallet], {
      commitment: "confirmed",
    });
    console.log("  ✓ Agent initialized:", sig);
  } catch (err) {
    if (err.message?.includes("already in use") || err.message?.includes("already been processed")) {
      console.log("  ✓ Agent already initialized (skipping)");
    } else {
      console.error("  ✗ Init failed:", err.message);
      console.log("    (If the agent is already initialized on pump.fun, this is expected)");
    }
  }

  // Step 2: Verify setup by reading the on-chain account
  console.log("  [2/2] Verifying on-chain state...");
  try {
    const AGENT_PROGRAM_ID = new PublicKey("AgenTMiC2hvxGebTsgmsD4HHBa8WEcqGFf87iwRRxLo7");
    const [tokenAgentPayments] = PublicKey.findProgramAddressSync(
      [Buffer.from("token-agent-payments"), mint.toBuffer()],
      AGENT_PROGRAM_ID
    );

    const acct = await connection.getAccountInfo(tokenAgentPayments);
    if (acct) {
      const data = acct.data;
      const storedMint = new PublicKey(data.slice(9, 41));
      const authority = new PublicKey(data.slice(41, 73));
      const bps = data.readUInt16LE(73);

      console.log("  ✓ On-chain agent found:");
      console.log("    Mint:", storedMint.toBase58());
      console.log("    Authority:", authority.toBase58());
      console.log("    Buyback BPS:", bps, `(${bps / 100}%)`);
    } else {
      console.log("  ✗ Agent account not found — may need to initialize via pump.fun UI");
    }
  } catch (err) {
    console.error("  ✗ Verify failed:", err.message);
  }

  console.log("\n  === Setup Complete ===");
  console.log("  Pump.fun will now automatically:");
  console.log("  1. Collect fees from trades");
  console.log("  2. Split fees:", BUYBACK_BPS / 100 + "% buyback /", (10000 - BUYBACK_BPS) / 100 + "% withdraw");
  console.log("  3. Execute buyback + burn via their infrastructure");
  console.log("  4. Boris will tweet each burn automatically");
  console.log();

  process.exit(0);
}

setup().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
