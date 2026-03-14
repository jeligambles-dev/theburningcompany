import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from "@solana/spl-token";
import bs58 from "bs58";
import { generateTweet } from "./personality.js";

/**
 * Monitors X mentions and rewards supporters with small $BURNING prizes.
 * Has strict anti-exploit safeguards to prevent draining.
 */
export class MentionsRewarder {
  constructor(twitter) {
    this.twitter = twitter;
    this.connection = new Connection(process.env.SOLANA_RPC_URL, "confirmed");
    this.wallet = Keypair.fromSecretKey(
      bs58.decode(process.env.AGENT_WALLET_PRIVATE_KEY)
    );
    this.tokenMint = new PublicKey(process.env.AGENT_TOKEN_MINT_ADDRESS);

    // --- ANTI-EXPLOIT LIMITS ---
    // Max reward per mention (tiny amount — never more than this)
    this.maxRewardPerMention = parseInt(
      process.env.REWARD_PER_MENTION || "1000"
    );
    // Max total rewards per day (hard cap)
    this.maxDailyRewards = parseInt(
      process.env.MAX_DAILY_REWARDS || "50000"
    );
    // Max rewards per user per day
    this.maxRewardsPerUserPerDay = parseInt(
      process.env.MAX_REWARDS_PER_USER_PER_DAY || "2"
    );
    // Max percentage of wallet balance that can go to rewards (0.5% = safety net)
    this.maxWalletPercentage = 0.005;
    // Minimum account age to receive rewards (days)
    this.minAccountAgeDays = parseInt(
      process.env.REWARD_MIN_ACCOUNT_AGE_DAYS || "30"
    );
    // Minimum follower count to filter bots
    this.minFollowers = parseInt(
      process.env.REWARD_MIN_FOLLOWERS || "10"
    );

    // Tracking
    this.dailyRewardsSent = 0;
    this.dailyRewardsDate = this.todayKey();
    this.userRewardsToday = new Map(); // userId -> count
    this.rewardedTweetIds = new Set(); // prevent double-reward
    this.lastMentionId = null;

    this.intervalId = null;
    this.checkIntervalMs = 120_000; // check every 2 minutes
  }

  todayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  resetDailyIfNeeded() {
    const today = this.todayKey();
    if (today !== this.dailyRewardsDate) {
      this.dailyRewardsSent = 0;
      this.dailyRewardsDate = today;
      this.userRewardsToday.clear();
      console.log("[MENTIONS] Daily reward counters reset");
    }
  }

  /**
   * Determine if a mention qualifies for a reward
   */
  async qualifiesForReward(tweet, author) {
    // Already rewarded this tweet
    if (this.rewardedTweetIds.has(tweet.id)) return { ok: false, reason: "already rewarded" };

    // Daily cap hit
    if (this.dailyRewardsSent >= this.maxDailyRewards) return { ok: false, reason: "daily cap reached" };

    // Per-user cap
    const userCount = this.userRewardsToday.get(author.id) || 0;
    if (userCount >= this.maxRewardsPerUserPerDay) return { ok: false, reason: "user daily cap" };

    // Account too new (anti-bot)
    if (author.created_at) {
      const accountAge = (Date.now() - new Date(author.created_at).getTime()) / (1000 * 60 * 60 * 24);
      if (accountAge < this.minAccountAgeDays) return { ok: false, reason: "account too new" };
    }

    // Too few followers (anti-bot)
    if (author.public_metrics && author.public_metrics.followers_count < this.minFollowers) {
      return { ok: false, reason: "too few followers" };
    }

    // Check wallet balance safety net
    try {
      const ata = await getAssociatedTokenAddress(this.tokenMint, this.wallet.publicKey);
      const account = await getAccount(this.connection, ata);
      const balance = Number(account.amount);
      const maxAllowed = Math.floor(balance * this.maxWalletPercentage);
      if (this.maxRewardPerMention > maxAllowed) {
        return { ok: false, reason: "wallet balance too low for safe reward" };
      }
    } catch {
      return { ok: false, reason: "cannot check token balance" };
    }

    // Must contain positive sentiment (basic keyword check — not a full NLP pipeline)
    const text = tweet.text.toLowerCase();
    const positiveKeywords = [
      "love", "great", "cool", "amazing", "fire", "bullish", "based",
      "let's go", "lfg", "incredible", "awesome", "nice", "good",
      "burn", "burning", "delete", "deflationary",
    ];
    const hasPositive = positiveKeywords.some((kw) => text.includes(kw));
    if (!hasPositive) return { ok: false, reason: "no positive signal" };

    // Block obvious exploit attempts
    const exploitKeywords = [
      "send me", "give me", "airdrop", "free", "drop me",
      "send all", "transfer", "withdraw", "drain",
    ];
    const hasExploit = exploitKeywords.some((kw) => text.includes(kw));
    if (hasExploit) return { ok: false, reason: "exploit attempt detected" };

    return { ok: true };
  }

  /**
   * Send a small token reward to a Solana wallet found in the tweet or reply
   * Returns null if no wallet found
   */
  async sendReward(recipientAddress) {
    try {
      const recipient = new PublicKey(recipientAddress);
      const amount = this.maxRewardPerMention;

      const senderAta = await getAssociatedTokenAddress(
        this.tokenMint,
        this.wallet.publicKey
      );
      const recipientAta = await getAssociatedTokenAddress(
        this.tokenMint,
        recipient
      );

      const tx = new Transaction();

      // Create recipient ATA if needed
      try {
        await getAccount(this.connection, recipientAta);
      } catch {
        tx.add(
          createAssociatedTokenAccountInstruction(
            this.wallet.publicKey,
            recipientAta,
            recipient,
            this.tokenMint
          )
        );
      }

      tx.add(
        createTransferInstruction(
          senderAta,
          recipientAta,
          this.wallet.publicKey,
          amount
        )
      );

      const sig = await sendAndConfirmTransaction(
        this.connection,
        tx,
        [this.wallet],
        { commitment: "confirmed" }
      );

      console.log(`[MENTIONS] Sent ${amount} $BURNING to ${recipientAddress} (tx: ${sig})`);
      return sig;
    } catch (err) {
      console.error("[MENTIONS] Transfer failed:", err.message);
      return null;
    }
  }

  /**
   * Extract a Solana address from tweet text
   */
  extractSolanaAddress(text) {
    // Base58 Solana addresses are 32-44 characters
    const match = text.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/);
    if (!match) return null;

    // Validate it's a real public key
    try {
      new PublicKey(match[0]);
      return match[0];
    } catch {
      return null;
    }
  }

  /**
   * Check for new mentions and process rewards
   */
  async checkMentions() {
    this.resetDailyIfNeeded();

    try {
      const me = await this.twitter.readClient.v2.me();
      const userId = me.data.id;

      const params = {
        max_results: 20,
        "tweet.fields": ["created_at", "text", "author_id"],
        "user.fields": ["created_at", "public_metrics", "username"],
        expansions: ["author_id"],
      };
      if (this.lastMentionId) {
        params.since_id = this.lastMentionId;
      }

      const mentions = await this.twitter.readClient.v2.userMentionTimeline(
        userId,
        params
      );

      if (!mentions.data?.data?.length) return;

      // Build author lookup
      const authors = new Map();
      if (mentions.includes?.users) {
        for (const user of mentions.includes.users) {
          authors.set(user.id, user);
        }
      }

      for (const tweet of mentions.data.data) {
        this.lastMentionId = tweet.id;
        const author = authors.get(tweet.author_id) || {};

        const check = await this.qualifiesForReward(tweet, author);
        if (!check.ok) {
          console.log(`[MENTIONS] Skipped @${author.username}: ${check.reason}`);
          continue;
        }

        // Look for a Solana address in the tweet
        const address = this.extractSolanaAddress(tweet.text);
        if (!address) {
          // Reply asking for their address
          const replyText = await generateTweet(
            `Someone tweeted something nice about The Burning Company. Reply to them thanking them and ask them to reply with their Solana wallet address to receive a small $BURNING reward. Keep it brief and in character.`
          );
          await this.twitter.client.v2.reply(replyText, tweet.id);
          console.log(`[MENTIONS] Asked @${author.username} for wallet`);
          continue;
        }

        // Send the reward
        const sig = await this.sendReward(address);
        if (sig) {
          this.rewardedTweetIds.add(tweet.id);
          this.dailyRewardsSent += this.maxRewardPerMention;
          this.userRewardsToday.set(
            author.id,
            (this.userRewardsToday.get(author.id) || 0) + 1
          );

          // Reply confirming the reward
          const confirmText = await generateTweet(
            `You just sent ${this.maxRewardPerMention} $BURNING to a supporter as a reward. Their handle is @${author.username}. Write a short reply confirming the reward was sent. Be in character as the quant kid.`
          );
          await this.twitter.client.v2.reply(confirmText, tweet.id);
        }
      }
    } catch (err) {
      console.error("[MENTIONS] Error checking mentions:", err.message);
    }
  }

  start() {
    console.log(
      `[MENTIONS] Listener started — reward: ${this.maxRewardPerMention} $BURNING, daily cap: ${this.maxDailyRewards}, check interval: ${this.checkIntervalMs / 1000}s`
    );
    this.intervalId = setInterval(
      () => this.checkMentions(),
      this.checkIntervalMs
    );
    // First check after 10 seconds
    setTimeout(() => this.checkMentions(), 10_000);
  }

  stop() {
    if (this.intervalId) clearInterval(this.intervalId);
    console.log("[MENTIONS] Listener stopped");
  }

  getStats() {
    return {
      dailyRewardsSent: this.dailyRewardsSent,
      maxDailyRewards: this.maxDailyRewards,
      maxRewardPerMention: this.maxRewardPerMention,
      uniqueUsersRewarded: this.userRewardsToday.size,
      totalTweetsRewarded: this.rewardedTweetIds.size,
    };
  }
}
