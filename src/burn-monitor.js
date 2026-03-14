import { Connection, PublicKey } from "@solana/web3.js";

const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
const AGENT_PROGRAM_ID = new PublicKey("AgenTMiC2hvxGebTsgmsD4HHBa8WEcqGFf87iwRRxLo7");
const TOKEN_MINT = new PublicKey(process.env.AGENT_TOKEN_MINT_ADDRESS);

/**
 * Monitors the buyback authority PDA for new burn transactions.
 * When pump.fun triggers a buyback + burn, it goes through this address.
 * We detect new txs and fire a tweet.
 */
export class BurnMonitor {
  constructor(twitter, tokenTracker) {
    this.twitter = twitter;
    this.tokenTracker = tokenTracker;
    this.connection = new Connection(HELIUS_RPC, "confirmed");

    // Derive the buyback authority PDA
    const [buybackAuth] = PublicKey.findProgramAddressSync(
      [Buffer.from("buyback-authority"), TOKEN_MINT.toBuffer()],
      AGENT_PROGRAM_ID
    );
    this.buybackAuthority = buybackAuth;

    // Track seen signatures so we don't double-tweet
    this.seenSignatures = new Set();
    this.initialized = false;
    this.intervalId = null;
    this.pollIntervalMs = parseInt(process.env.BURN_POLL_INTERVAL_MS || "30000");
  }

  /**
   * On first run, load existing signatures so we don't tweet old burns
   */
  async init() {
    try {
      const sigs = await this.connection.getSignaturesForAddress(
        this.buybackAuthority,
        { limit: 100 }
      );
      for (const sig of sigs) {
        this.seenSignatures.add(sig.signature);
      }
      this.initialized = true;
      console.log(
        `[BURN MONITOR] Initialized — ${this.seenSignatures.size} existing burns loaded, watching ${this.buybackAuthority.toBase58().slice(0, 8)}...`
      );
    } catch (err) {
      console.error("[BURN MONITOR] Init failed:", err.message);
    }
  }

  /**
   * Poll for new buyback/burn transactions
   */
  async poll() {
    if (!this.initialized) return;

    try {
      const sigs = await this.connection.getSignaturesForAddress(
        this.buybackAuthority,
        { limit: 10 }
      );

      const newBurns = sigs.filter(
        (s) => s.err === null && !this.seenSignatures.has(s.signature)
      );

      for (const sig of newBurns) {
        this.seenSignatures.add(sig.signature);

        // Parse the burn transaction for details
        const burnData = await this.parseBurnTx(sig.signature);
        if (!burnData) continue;

        console.log(
          `[BURN MONITOR] New burn detected: ${burnData.tokensBurned.toLocaleString()} tokens (tx: ${sig.signature.slice(0, 12)}...)`
        );

        // Tweet about it
        if (this.twitter) {
          await this.twitter.tweetBurnAlert({
            id: this.seenSignatures.size,
            tokensBurned: burnData.tokensBurned,
            solSpent: burnData.solSpent,
            burnTx: sig.signature,
            timestamp: sig.blockTime ? sig.blockTime * 1000 : Date.now(),
          });
        }
      }
    } catch (err) {
      console.error("[BURN MONITOR] Poll error:", err.message);
    }
  }

  /**
   * Parse a buyback trigger transaction to extract burn amount and SOL spent
   */
  async parseBurnTx(signature) {
    try {
      const res = await fetch(HELIUS_RPC, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getTransaction",
          params: [
            signature,
            { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
          ],
        }),
      });
      const data = await res.json();
      const tx = data.result;
      if (!tx) return null;

      const pre = tx.meta.preTokenBalances || [];
      const post = tx.meta.postTokenBalances || [];
      const mintStr = TOKEN_MINT.toBase58();

      // Find token balance change on the buyback authority (tokens bought then burned)
      // The burn authority's token balance goes up (buy) then down (burn) in same tx
      // Net result: look for burnChecked instruction amount
      let tokensBurned = 0;

      // Check inner instructions for burn amount
      for (const inner of tx.meta.innerInstructions || []) {
        for (const ix of inner.instructions || []) {
          if (
            ix.parsed?.type === "burn" ||
            ix.parsed?.type === "burnChecked"
          ) {
            const amt =
              ix.parsed.info?.amount ||
              ix.parsed.info?.tokenAmount?.amount;
            if (amt) {
              tokensBurned = parseInt(amt) / 1e6; // 6 decimals
            }
          }
        }
      }

      // Also check top-level
      for (const ix of tx.transaction.message.instructions || []) {
        if (ix.parsed?.type === "burn" || ix.parsed?.type === "burnChecked") {
          const amt =
            ix.parsed.info?.amount || ix.parsed.info?.tokenAmount?.amount;
          if (amt) {
            tokensBurned = parseInt(amt) / 1e6;
          }
        }
      }

      // Get SOL spent from native balance change on the buyback authority
      let solSpent = 0;
      const accountKeys = tx.transaction.message.accountKeys || [];
      const authIdx = accountKeys.findIndex(
        (k) => (k.pubkey || k) === this.buybackAuthority.toBase58()
      );
      if (authIdx >= 0 && tx.meta.preBalances && tx.meta.postBalances) {
        const diff = tx.meta.preBalances[authIdx] - tx.meta.postBalances[authIdx];
        if (diff > 0) solSpent = diff / 1e9;
      }

      if (tokensBurned === 0) {
        // Fallback: check token supply change
        // If we can't find the burn instruction, estimate from balance changes
        for (const b of pre) {
          if (b.mint === mintStr && b.owner === this.buybackAuthority.toBase58()) {
            const postBal = post.find(
              (p) => p.mint === mintStr && p.owner === this.buybackAuthority.toBase58()
            );
            const preAmt = parseFloat(b.uiTokenAmount.uiAmountString || "0");
            const postAmt = parseFloat(postBal?.uiTokenAmount?.uiAmountString || "0");
            if (preAmt > postAmt) {
              tokensBurned = preAmt - postAmt;
            }
          }
        }
      }

      return { tokensBurned, solSpent, signature };
    } catch (err) {
      console.error("[BURN MONITOR] Parse error:", err.message);
      return null;
    }
  }

  start() {
    this.init().then(() => {
      this.intervalId = setInterval(() => this.poll(), this.pollIntervalMs);
      console.log(
        `[BURN MONITOR] Polling every ${this.pollIntervalMs / 1000}s`
      );
    });
  }

  stop() {
    if (this.intervalId) clearInterval(this.intervalId);
    console.log("[BURN MONITOR] Stopped");
  }
}
