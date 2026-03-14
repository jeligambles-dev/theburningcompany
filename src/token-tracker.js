import { Connection, PublicKey } from "@solana/web3.js";

const AGENT_PROGRAM_ID_STR = "AgenTMiC2hvxGebTsgmsD4HHBa8WEcqGFf87iwRRxLo7";
const SOL_MINT_STR = "So11111111111111111111111111111111111111112";

/**
 * Fetches real on-chain buy/sell/burn activity for a pump.fun token
 * by parsing token balance changes relative to the swap pool.
 */
export class TokenTracker {
  constructor() {
    const rpc = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
    const TOKEN_MINT = process.env.AGENT_TOKEN_MINT_ADDRESS;

    this.rpcUrl = rpc;
    this.connection = new Connection(rpc, "confirmed");
    this.tokenMintStr = TOKEN_MINT;
    this.poolAddress = null;
    this.ready = false;

    // Only initialize on-chain lookups if we have a mint address
    if (TOKEN_MINT) {
      const AGENT_PROGRAM_ID = new PublicKey(AGENT_PROGRAM_ID_STR);
      const SOL_MINT = new PublicKey(SOL_MINT_STR);

      this.tokenMint = new PublicKey(TOKEN_MINT);
      this.solMint = SOL_MINT;
      this.agentProgramId = AGENT_PROGRAM_ID;

      const [buybackAuthority] = PublicKey.findProgramAddressSync(
        [Buffer.from("buyback-authority"), this.tokenMint.toBuffer()],
        AGENT_PROGRAM_ID
      );
      this.buybackAuthorityPDA = buybackAuthority;

      const [tokenAgentPayments] = PublicKey.findProgramAddressSync(
        [Buffer.from("token-agent-payments"), this.tokenMint.toBuffer()],
        AGENT_PROGRAM_ID
      );
      this.tokenAgentPaymentsPDA = tokenAgentPayments;

      const [paymentInCurrency] = PublicKey.findProgramAddressSync(
        [Buffer.from("payment-in-currency"), this.tokenMint.toBuffer(), SOL_MINT.toBuffer()],
        AGENT_PROGRAM_ID
      );
      this.paymentInCurrencyPDA = paymentInCurrency;

      this.ready = true;
      console.log("[TOKEN TRACKER] Initialized for", TOKEN_MINT.slice(0, 8) + "...");
    } else {
      console.log("[TOKEN TRACKER] No mint address — running in standby mode");
    }

    // Cache
    this.activityCache = [];
    this.statsCache = null;
    this.agentStatsCache = null;
    this.agentStatsCacheTimestamp = 0;
    this.solPriceCache = 0;
    this.solPriceCacheTimestamp = 0;
    this.solPriceCacheTTL = 10_000; // 10 seconds
    this.activityCacheTimestamp = 0;
    this.statsCacheTimestamp = 0;
    this.activityCacheTTL = 15_000;
    this.statsCacheTTL = 30_000;
  }

  /**
   * Read pump.fun agent payment accounts for real revenue/buyback/pending data
   */
  /**
   * Fetch live SOL/USD price. Jupiter primary, CoinGecko fallback.
   */
  async getAgentStats() {
    if (!this.ready) return {};
    return this._getAgentStats();
  }

  async getTokenStats() {
    if (!this.ready) return { totalBurned: 0, supplyReduced: 0, initialSupply: 0, currentSupply: 0, pumpfun: null };
    return this._getTokenStats();
  }

  async getActivity(limit = 20) {
    if (!this.ready) return [];
    return this._getActivity(limit);
  }

  async getSolPrice() {
    if (Date.now() - this.solPriceCacheTimestamp < this.solPriceCacheTTL && this.solPriceCache > 0) {
      return this.solPriceCache;
    }

    // Jupiter Price API (native Solana, no rate limits)
    try {
      const res = await fetch(
        "https://api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112"
      );
      if (res.ok) {
        const data = await res.json();
        const price = parseFloat(data.data?.["So11111111111111111111111111111111111111112"]?.price || "0");
        if (price > 0) {
          this.solPriceCache = price;
          this.solPriceCacheTimestamp = Date.now();
          return price;
        }
      }
    } catch {}

    // Fallback: CoinGecko
    try {
      const res = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd"
      );
      if (res.ok) {
        const data = await res.json();
        const price = data.solana?.usd || 0;
        if (price > 0) {
          this.solPriceCache = price;
          this.solPriceCacheTimestamp = Date.now();
          return price;
        }
      }
    } catch {}

    return this.solPriceCache;
  }

  async _getAgentStats() {
    if (Date.now() - this.agentStatsCacheTimestamp < this.statsCacheTTL && this.agentStatsCache) {
      return this.agentStatsCache;
    }

    try {
      const [tapAcct, picAcct] = await Promise.all([
        this.connection.getAccountInfo(this.tokenAgentPaymentsPDA),
        this.connection.getAccountInfo(this.paymentInCurrencyPDA),
      ]);

      let agentData = { buybackBps: 0 };
      if (tapAcct) {
        const data = tapAcct.data;
        agentData.buybackBps = data.readUInt16LE(73);
        agentData.authority = new PublicKey(data.slice(41, 73)).toBase58();
      }

      let paymentData = {};
      if (picAcct) {
        const data = picAcct.data;
        const totalPayments = Number(data.readBigUInt64LE(72)) / 1e9;
        const totalBuyback = Number(data.readBigUInt64LE(80)) / 1e9;
        const totalWithdrawals = Number(data.readBigUInt64LE(88)) / 1e9;
        const tokensBurned = Number(data.readBigUInt64LE(96)) / 1e6;

        paymentData = {
          totalPaymentsSol: totalPayments,
          totalBuybackSol: totalBuyback,
          totalWithdrawalsSol: totalWithdrawals,
          tokensBurnedOnChain: tokensBurned,
          // Revenue = buybacks + withdrawals + pending in vault
          totalRevenueSol: totalBuyback + totalWithdrawals,
        };
      }

      // Get live SOL price
      const solPrice = await this.getSolPrice();

      // Check pending balance in the buyback vault
      let pendingSol = 0;
      try {
        const { getAssociatedTokenAddressSync } = await import("@solana/spl-token");
        const buybackVault = getAssociatedTokenAddressSync(
          this.solMint,
          this.buybackAuthorityPDA,
          true
        );
        const vaultBalance = await this.connection.getTokenAccountBalance(buybackVault);
        pendingSol = parseFloat(vaultBalance.value.uiAmountString || "0");
      } catch {
        // Vault may not exist or be empty
      }

      // Count buyback/burn events from buyback authority transactions
      let burnEventCount = 0;
      try {
        const sigs = await this.connection.getSignaturesForAddress(
          this.buybackAuthorityPDA,
          { limit: 1000 }
        );
        burnEventCount = sigs.filter((s) => s.err === null).length;
      } catch {}

      const stats = {
        ...agentData,
        ...paymentData,
        pendingSol,
        solPrice,
        burnEventCount,
        // USD values
        totalRevenueUsd: (paymentData.totalRevenueSol || 0) * solPrice + pendingSol * solPrice,
        totalBuybackUsd: (paymentData.totalBuybackSol || 0) * solPrice,
        pendingUsd: pendingSol * solPrice,
      };

      this.agentStatsCache = stats;
      this.agentStatsCacheTimestamp = Date.now();
      return stats;
    } catch (err) {
      console.error("[TOKEN TRACKER] Agent stats error:", err.message);
      return this.agentStatsCache || {};
    }
  }

  async _getTokenStats() {
    if (Date.now() - this.statsCacheTimestamp < this.statsCacheTTL && this.statsCache) {
      return this.statsCache;
    }

    try {
      // Get supply from RPC
      const supplyRes = await fetch(this.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getTokenSupply",
          params: [this.tokenMintStr],
        }),
      });
      const supplyData = await supplyRes.json();
      const supply = supplyData.result?.value;

      // Get pump.fun metadata
      let pumpData = null;
      try {
        const res = await fetch(
          `https://frontend-api-v3.pump.fun/coins/${this.tokenMintStr}`
        );
        if (res.ok) pumpData = await res.json();
      } catch {}

      // Cache pool address for tx classification
      if (pumpData?.pump_swap_pool) {
        this.poolAddress = pumpData.pump_swap_pool;
      }

      const initialSupply = 1_000_000_000;
      const currentSupply = supply
        ? Number(supply.amount) / Math.pow(10, supply.decimals)
        : initialSupply;
      const totalBurned = initialSupply - currentSupply;
      const supplyReduced = (totalBurned / initialSupply) * 100;

      const stats = {
        mint: this.tokenMintStr,
        initialSupply,
        currentSupply,
        totalBurned,
        supplyReduced,
        decimals: supply?.decimals || 6,
        pumpfun: pumpData
          ? {
              mint: this.tokenMintStr,
              name: pumpData.name,
              symbol: pumpData.symbol,
              imageUri: pumpData.image_uri,
              marketCap: pumpData.usd_market_cap,
              poolAddress: pumpData.pump_swap_pool,
              creator: pumpData.creator,
              twitter: pumpData.twitter,
              website: pumpData.website,
            }
          : null,
        fetchedAt: Date.now(),
      };

      this.statsCache = stats;
      this.statsCacheTimestamp = Date.now();
      return stats;
    } catch (err) {
      console.error("[TOKEN TRACKER] Stats error:", err.message);
      return this.statsCache || { error: err.message };
    }
  }

  async _getActivity(limit = 20) {
    if (
      Date.now() - this.activityCacheTimestamp < this.activityCacheTTL &&
      this.activityCache.length
    ) {
      return this.activityCache.slice(0, limit);
    }

    // Ensure we have pool address
    if (!this.poolAddress) {
      await this.getTokenStats();
    }

    try {
      // Get recent successful signatures
      const sigRes = await fetch(this.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getSignaturesForAddress",
          params: [this.tokenMintStr, { limit: 40 }],
        }),
      });
      const sigData = await sigRes.json();
      const signatures = (sigData.result || []).filter((s) => s.err === null);

      // Parse transactions in parallel batches
      const activity = [];
      const batchSize = 10;

      for (let i = 0; i < Math.min(signatures.length, 30); i += batchSize) {
        const batch = signatures.slice(i, i + batchSize);
        const results = await Promise.allSettled(
          batch.map((sig) => this.parseTransaction(sig.signature, sig.blockTime))
        );
        for (const r of results) {
          if (r.status === "fulfilled" && r.value) {
            activity.push(r.value);
          }
        }
      }

      activity.sort((a, b) => b.timestamp - a.timestamp);

      this.activityCache = activity;
      this.activityCacheTimestamp = Date.now();
      return activity.slice(0, limit);
    } catch (err) {
      console.error("[TOKEN TRACKER] Activity error:", err.message);
      return this.activityCache.slice(0, limit);
    }
  }

  async parseTransaction(signature, blockTime) {
    try {
      const res = await fetch(this.rpcUrl, {
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

      const timestamp = blockTime ? blockTime * 1000 : Date.now();
      const pre = tx.meta.preTokenBalances || [];
      const post = tx.meta.postTokenBalances || [];
      const signer =
        tx.transaction.message.accountKeys?.[0]?.pubkey ||
        tx.transaction.message.accountKeys?.[0];

      // Check for SPL burn instruction first
      if (this.hasBurnInstruction(tx)) {
        const burnAmount = this.getBurnAmount(tx);
        return {
          type: "burn",
          signature,
          timestamp,
          tokenAmount: burnAmount,
          wallet: signer,
        };
      }

      // Find token balance changes for $BURNING mint
      const changes = this.getBalanceChanges(pre, post, tx);
      if (!changes) return null;

      // Classify based on token flow relative to pool
      if (changes.poolChange > 0 && changes.walletChange < 0) {
        // Tokens moved from wallet to pool → SELL
        return {
          type: "sell",
          signature,
          timestamp,
          tokenAmount: Math.abs(changes.walletChange),
          solAmount: changes.solChange,
          wallet: changes.wallet,
        };
      } else if (changes.poolChange < 0 && changes.walletChange > 0) {
        // Tokens moved from pool to wallet → BUY
        return {
          type: "buy",
          signature,
          timestamp,
          tokenAmount: changes.walletChange,
          solAmount: changes.solChange,
          wallet: changes.wallet,
        };
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Get token balance changes, tracking pool vs non-pool wallets.
   * Also extracts SOL change from native balances.
   */
  getBalanceChanges(pre, post, tx) {
    // Build token balance maps for $BURNING
    const preMap = {};
    const postMap = {};

    for (const b of pre) {
      if (b.mint === this.tokenMintStr) {
        preMap[b.owner] = parseFloat(b.uiTokenAmount.uiAmountString || "0");
      }
    }
    for (const b of post) {
      if (b.mint === this.tokenMintStr) {
        postMap[b.owner] = parseFloat(b.uiTokenAmount.uiAmountString || "0");
      }
    }

    // Pool change
    const poolPre = preMap[this.poolAddress] || 0;
    const poolPost = postMap[this.poolAddress] || 0;
    const poolChange = poolPost - poolPre;

    // Find the non-pool wallet with the biggest token change
    const allOwners = new Set([...Object.keys(preMap), ...Object.keys(postMap)]);
    let bestWallet = null;
    let bestChange = 0;

    for (const owner of allOwners) {
      if (owner === this.poolAddress) continue;
      const diff = (postMap[owner] || 0) - (preMap[owner] || 0);
      if (diff !== 0 && Math.abs(diff) > Math.abs(bestChange)) {
        bestWallet = owner;
        bestChange = diff;
      }
    }

    if (!bestWallet) return null;

    // Get SOL change for the signer from native balances
    let solChange = 0;
    const accountKeys = tx.transaction.message.accountKeys || [];
    const signerIdx = accountKeys.findIndex(
      (k) => (k.pubkey || k) === (accountKeys[0]?.pubkey || accountKeys[0])
    );
    if (signerIdx >= 0 && tx.meta.preBalances && tx.meta.postBalances) {
      const preSol = tx.meta.preBalances[signerIdx] / 1e9;
      const postSol = tx.meta.postBalances[signerIdx] / 1e9;
      solChange = Math.abs(postSol - preSol);
    }

    return {
      wallet: bestWallet,
      walletChange: bestChange,
      poolChange,
      solChange,
    };
  }

  hasBurnInstruction(tx) {
    const check = (instructions) => {
      for (const ix of instructions || []) {
        if (ix.parsed?.type === "burn" || ix.parsed?.type === "burnChecked") {
          return true;
        }
      }
      return false;
    };

    if (check(tx.transaction.message.instructions)) return true;
    for (const inner of tx.meta.innerInstructions || []) {
      if (check(inner.instructions)) return true;
    }
    return false;
  }

  getBurnAmount(tx) {
    const find = (instructions) => {
      for (const ix of instructions || []) {
        if (ix.parsed?.type === "burn" || ix.parsed?.type === "burnChecked") {
          const amt = ix.parsed.info?.amount || ix.parsed.info?.tokenAmount?.amount;
          if (amt) return parseInt(amt) / 1e6; // 6 decimals
        }
      }
      return 0;
    };

    let amount = find(tx.transaction.message.instructions);
    if (amount) return amount;
    for (const inner of tx.meta.innerInstructions || []) {
      amount = find(inner.instructions);
      if (amount) return amount;
    }
    return 0;
  }
}
