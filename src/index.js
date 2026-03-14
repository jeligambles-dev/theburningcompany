import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createApiRouter } from "./api.js";
import { TreasuryManager } from "./treasury.js";
import { TokenTracker } from "./token-tracker.js";
import { BurnMonitor } from "./burn-monitor.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3000;

// ---- Middleware ----
app.use(express.json());
app.use(express.static(path.join(__dirname, "../website")));

// ---- Initialize core services ----
const treasury = new TreasuryManager();
const tokenTracker = new TokenTracker();

// ---- Optional services (need API keys to activate) ----
let burnEngine = null;
let twitter = null;
let mentions = null;

async function initOptionalServices() {
  // Burn engine requires a wallet key
  if (process.env.AGENT_WALLET_PRIVATE_KEY) {
    const { BurnEngine } = await import("./burn-engine.js");
    burnEngine = new BurnEngine(treasury, twitter);
    burnEngine.start();
    console.log("[INIT] Burn engine active");
  } else {
    console.log("[INIT] Burn engine disabled (no wallet key)");
  }

  // Twitter requires API keys
  if (process.env.TWITTER_API_KEY) {
    const { TwitterBot } = await import("./twitter.js");
    twitter = new TwitterBot();
    twitter.startSchedule();
    console.log("[INIT] Twitter bot active");

    // Mentions listener requires twitter
    const { MentionsRewarder } = await import("./mentions.js");
    mentions = new MentionsRewarder(twitter);
    mentions.start();
    console.log("[INIT] Mentions rewarder active");
  } else {
    console.log("[INIT] Twitter bot disabled (no API keys)");
  }

  // Burn monitor always runs (tweets if twitter is available)
  if (process.env.HELIUS_API_KEY && process.env.AGENT_TOKEN_MINT_ADDRESS) {
    const burnMonitor = new BurnMonitor(twitter, tokenTracker);
    burnMonitor.start();
    console.log("[INIT] Burn monitor active");
  }
}

// ---- Stub services for API ----
const stubBurnEngine = {
  getStats: () => ({
    totalBurned: 0,
    totalBurnEvents: 0,
    burns: [],
    activity: [],
    running: false,
    walletAddress: null,
  }),
};

const stubMentions = {
  getStats: () => ({
    dailyRewardsSent: 0,
    maxDailyRewards: 0,
    maxRewardPerMention: 0,
    uniqueUsersRewarded: 0,
    totalTweetsRewarded: 0,
  }),
};

const stubTwitter = {
  fetchRecentTweets: async () => [],
};

// ---- API routes (use real services or stubs) ----
app.use(
  "/api",
  createApiRouter(
    { getStats: () => (burnEngine || stubBurnEngine).getStats() },
    treasury,
    { fetchRecentTweets: async (n) => (twitter || stubTwitter).fetchRecentTweets(n) },
    { getStats: () => (mentions || stubMentions).getStats() },
    tokenTracker
  )
);

// ---- SPA fallback ----
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "../website/index.html"));
});

// ---- Start ----
app.listen(PORT, async () => {
  console.log(`
  ╔══════════════════════════════════════╗
  ║     THE BURNING COMPANY             ║
  ║     "We don't print money.          ║
  ║      We delete it."                 ║
  ║                                     ║
  ║     Server running on port ${String(PORT).padEnd(5)}    ║
  ╚══════════════════════════════════════╝
  `);

  await initOptionalServices();
});
