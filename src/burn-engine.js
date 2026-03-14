import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createBurnInstruction,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from "@solana/spl-token";
import { PumpAgent } from "@pump-fun/agent-payments-sdk";
import bs58 from "bs58";

export class BurnEngine {
  constructor(treasury, twitter) {
    this.treasury = treasury;
    this.twitter = twitter;
    this.connection = new Connection(process.env.SOLANA_RPC_URL, "confirmed");
    this.wallet = Keypair.fromSecretKey(
      bs58.decode(process.env.AGENT_WALLET_PRIVATE_KEY)
    );
    this.tokenMint = new PublicKey(process.env.AGENT_TOKEN_MINT_ADDRESS);
    this.currencyMint = new PublicKey(process.env.CURRENCY_MINT);
    this.burnAddress = new PublicKey(process.env.BURN_ADDRESS);
    this.burnPercentage = parseInt(process.env.BURN_PERCENTAGE || "80") / 100;
    this.treasuryPercentage =
      parseInt(process.env.TREASURY_PERCENTAGE || "20") / 100;
    this.thresholdSol = parseFloat(process.env.BURN_THRESHOLD_SOL || "0.5");
    this.checkInterval = parseInt(
      process.env.BURN_CHECK_INTERVAL_MS || "60000"
    );
    this.slippageBps = parseInt(
      process.env.JUPITER_SWAP_SLIPPAGE_BPS || "100"
    );

    // Pump.fun agent SDK
    this.pumpAgent = new PumpAgent(this.tokenMint, "mainnet", this.connection);

    // Activity feed: both "buy" and "burn" events
    this.activity = [];
    this.burns = [];
    this.totalBurned = 0;
    this.totalBurnEvents = 0;

    this.running = false;
    this.intervalId = null;
  }

  start() {
    if (this.running) return;
    this.running = true;
    console.log(
      `[BURN ENGINE] Started — checking every ${this.checkInterval / 1000}s, threshold: ${this.thresholdSol} SOL`
    );
    this.intervalId = setInterval(() => this.checkAndBurn(), this.checkInterval);
    // Run once immediately
    this.checkAndBurn();
  }

  stop() {
    this.running = false;
    if (this.intervalId) clearInterval(this.intervalId);
    console.log("[BURN ENGINE] Stopped");
  }

  async getWalletBalanceSol() {
    const lamports = await this.connection.getBalance(this.wallet.publicKey);
    return lamports / 1e9;
  }

  async getTokenBalance() {
    try {
      const ata = await getAssociatedTokenAddress(
        this.tokenMint,
        this.wallet.publicKey
      );
      const account = await getAccount(this.connection, ata);
      return Number(account.amount);
    } catch {
      return 0;
    }
  }

  /**
   * Swap SOL for $BURNING via Jupiter Aggregator
   */
  async swapSolForToken(solAmount) {
    const lamports = Math.floor(solAmount * 1e9);

    // Get Jupiter quote
    const quoteUrl = new URL("https://quote-api.jup.ag/v6/quote");
    quoteUrl.searchParams.set(
      "inputMint",
      "So11111111111111111111111111111111111111112"
    );
    quoteUrl.searchParams.set("outputMint", this.tokenMint.toBase58());
    quoteUrl.searchParams.set("amount", lamports.toString());
    quoteUrl.searchParams.set("slippageBps", this.slippageBps.toString());

    const quoteRes = await fetch(quoteUrl);
    if (!quoteRes.ok) {
      throw new Error(`Jupiter quote failed: ${quoteRes.statusText}`);
    }
    const quote = await quoteRes.json();

    // Get swap transaction
    const swapRes = await fetch("https://quote-api.jup.ag/v6/swap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: this.wallet.publicKey.toBase58(),
        wrapAndUnwrapSol: true,
      }),
    });

    if (!swapRes.ok) {
      throw new Error(`Jupiter swap failed: ${swapRes.statusText}`);
    }

    const { swapTransaction } = await swapRes.json();
    const txBuf = Buffer.from(swapTransaction, "base64");
    const tx = Transaction.from(txBuf);
    tx.sign(this.wallet);

    const signature = await this.connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });

    const latestBlockhash =
      await this.connection.getLatestBlockhash("confirmed");
    await this.connection.confirmTransaction(
      { signature, ...latestBlockhash },
      "confirmed"
    );

    const tokensReceived = parseInt(quote.outAmount);
    console.log(
      `[BURN ENGINE] Swapped ${solAmount} SOL → ${tokensReceived} $BURNING (tx: ${signature})`
    );

    return { signature, tokensReceived, quote };
  }

  /**
   * Burn tokens by sending to the incinerator address
   */
  async burnTokens(amount) {
    const ata = await getAssociatedTokenAddress(
      this.tokenMint,
      this.wallet.publicKey
    );

    const burnIx = createBurnInstruction(
      ata,
      this.tokenMint,
      this.wallet.publicKey,
      amount
    );

    const tx = new Transaction().add(burnIx);
    const signature = await sendAndConfirmTransaction(
      this.connection,
      tx,
      [this.wallet],
      { commitment: "confirmed" }
    );

    console.log(
      `[BURN ENGINE] Burned ${amount} $BURNING (tx: ${signature})`
    );
    return signature;
  }

  /**
   * Main loop: check balance, split fees, buy & burn
   */
  async checkAndBurn() {
    try {
      const balanceSol = await this.getWalletBalanceSol();
      console.log(`[BURN ENGINE] Wallet balance: ${balanceSol.toFixed(4)} SOL`);

      // Keep a minimum SOL reserve for gas
      const reserve = 0.05;
      const available = balanceSol - reserve;

      if (available < this.thresholdSol) {
        console.log(
          `[BURN ENGINE] Below threshold (${this.thresholdSol} SOL), skipping`
        );
        return null;
      }

      // 80/20 split
      const burnAmount = available * this.burnPercentage;
      const treasuryAmount = available * this.treasuryPercentage;

      console.log(
        `[BURN ENGINE] Splitting ${available.toFixed(4)} SOL → Burn: ${burnAmount.toFixed(4)} SOL | Treasury: ${treasuryAmount.toFixed(4)} SOL`
      );

      // Track treasury allocation
      this.treasury.addAllocation(treasuryAmount);

      // Execute market buy
      const { signature: swapSig, tokensReceived, quote } =
        await this.swapSolForToken(burnAmount);

      // Log the BUY event (green on website)
      this.activity.unshift({
        id: this.activity.length + 1,
        type: "buy",
        timestamp: Date.now(),
        solSpent: burnAmount,
        tokensReceived,
        tx: swapSig,
      });

      // Burn the purchased tokens
      const burnSig = await this.burnTokens(tokensReceived);

      // Log the BURN event (red on website)
      this.activity.unshift({
        id: this.activity.length + 1,
        type: "burn",
        timestamp: Date.now(),
        tokensBurned: tokensReceived,
        tx: burnSig,
      });

      // Record combined burn event for tweets/stats
      const burnEvent = {
        id: this.burns.length + 1,
        timestamp: Date.now(),
        solSpent: burnAmount,
        tokensBurned: tokensReceived,
        swapTx: swapSig,
        burnTx: burnSig,
        treasuryAllocation: treasuryAmount,
      };

      this.burns.unshift(burnEvent);
      this.totalBurned += tokensReceived;
      this.totalBurnEvents++;

      // Keep only last 100 in memory
      if (this.burns.length > 100) this.burns.length = 100;
      if (this.activity.length > 200) this.activity.length = 200;

      console.log(
        `[BURN ENGINE] === BURN EVENT #${this.totalBurnEvents} === ${tokensReceived.toLocaleString()} $BURNING deleted`
      );

      // Tweet about it
      await this.twitter.tweetBurnAlert(burnEvent);

      return burnEvent;
    } catch (err) {
      console.error("[BURN ENGINE] Error:", err.message);
      return null;
    }
  }

  getStats() {
    return {
      totalBurned: this.totalBurned,
      totalBurnEvents: this.totalBurnEvents,
      burns: this.burns.slice(0, 20),
      activity: this.activity.slice(0, 30),
      running: this.running,
      thresholdSol: this.thresholdSol,
      burnPercentage: this.burnPercentage * 100,
      treasuryPercentage: this.treasuryPercentage * 100,
      walletAddress: this.wallet.publicKey.toBase58(),
    };
  }
}
