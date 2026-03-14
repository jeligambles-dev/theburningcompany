import express from "express";

export function createApiRouter(burnEngine, treasury, twitter, mentions, tokenTracker) {
  const router = express.Router();

  /**
   * GET /api/stats
   * Real-time stats from on-chain data (supply burned, etc.)
   */
  router.get("/stats", async (_req, res) => {
    try {
      const [tokenStats, agentStats] = await Promise.all([
        tokenTracker.getTokenStats(),
        tokenTracker.getAgentStats(),
      ]);
      const burnStats = burnEngine.getStats();

      const totalBurned = tokenStats.totalBurned || burnStats.totalBurned;
      const supplyReduced = tokenStats.supplyReduced || 0;

      res.json({
        totalBurned,
        totalBurnEvents: agentStats.burnEventCount || 0,
        supplyReduced: parseFloat(supplyReduced.toFixed(4)),
        currentSupply: tokenStats.currentSupply,
        initialSupply: tokenStats.initialSupply,
        running: burnStats.running,
        walletAddress: burnStats.walletAddress,
        token: tokenStats.pumpfun || null,
        agent: {
          buybackBps: agentStats.buybackBps,
          totalRevenueSol: agentStats.totalRevenueSol,
          totalRevenueUsd: agentStats.totalRevenueUsd,
          totalBuybackSol: agentStats.totalBuybackSol,
          totalBuybackUsd: agentStats.totalBuybackUsd,
          pendingSol: agentStats.pendingSol,
          pendingUsd: agentStats.pendingUsd,
          tokensBurnedOnChain: agentStats.tokensBurnedOnChain,
          solPrice: agentStats.solPrice,
        },
        treasury: {
          totalAllocated: treasury.getStats().totalAllocated,
          weeklyAllocated: treasury.getStats().weeklyAllocated,
        },
        rewards: mentions.getStats(),
      });
    } catch (err) {
      console.error("[API] Stats error:", err.message);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  /**
   * GET /api/activity
   * Live on-chain buy/sell/burn feed (buy=green, burn=red)
   */
  router.get("/activity", async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit || "20"), 50);
      const activity = await tokenTracker.getActivity(limit);
      res.json({ activity });
    } catch (err) {
      console.error("[API] Activity error:", err.message);
      res.status(500).json({ error: "Failed to fetch activity" });
    }
  });

  /**
   * GET /api/burns
   * Only burn events from on-chain data
   */
  router.get("/burns", async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit || "20"), 50);
      const activity = await tokenTracker.getActivity(50);
      const burns = activity.filter((a) => a.type === "burn").slice(0, limit);
      res.json({ burns });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch burns" });
    }
  });

  /**
   * GET /api/tweets
   * Fetch recent tweets from the X account in real-time
   */
  router.get("/tweets", async (_req, res) => {
    try {
      const tweets = await twitter.fetchRecentTweets(10);
      res.json({ tweets });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch tweets" });
    }
  });

  /**
   * GET /api/treasury
   * Treasury allocation data
   */
  router.get("/treasury", (_req, res) => {
    res.json(treasury.getStats());
  });

  /**
   * GET /api/token
   * On-chain token data (supply, pump.fun info)
   */
  router.get("/token", async (_req, res) => {
    try {
      const data = await tokenTracker.getTokenStats();
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch token data" });
    }
  });

  /**
   * GET /api/health
   * Health check for Railway
   */
  router.get("/health", (_req, res) => {
    res.json({
      status: "operational",
      service: "Agent Alun",
      burnEngine: burnEngine.running ? "running" : "stopped",
      uptime: process.uptime(),
    });
  });

  return router;
}
