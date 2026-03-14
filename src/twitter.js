import { TwitterApi } from "twitter-api-v2";
import {
  generateBurnTweet,
  generateShitpost,
  generateTreasuryReport,
} from "./personality.js";

export class TwitterBot {
  constructor() {
    // Read-write client for posting
    this.client = new TwitterApi({
      appKey: process.env.TWITTER_API_KEY,
      appSecret: process.env.TWITTER_API_SECRET,
      accessToken: process.env.TWITTER_ACCESS_TOKEN,
      accessSecret: process.env.TWITTER_ACCESS_SECRET,
    });

    // Same user client for reading (timeline requires OAuth 1.0a)
    this.readClient = this.client;

    this.shitpostIntervalHours = parseInt(
      process.env.TWEET_SHITPOST_INTERVAL_HOURS || "6"
    );
    this.treasuryReportDay = process.env.TWEET_TREASURY_REPORT_DAY || "monday";
    this.burnAlertsEnabled = process.env.TWEET_BURN_ALERTS !== "false";

    this.scheduledIntervals = [];

    // Store tweets Boris posts (free tier doesn't allow timeline reads)
    this.postedTweets = [];
  }

  /**
   * Post a tweet
   */
  async tweet(text) {
    try {
      const result = await this.client.v2.tweet(text);
      console.log(`[TWITTER] Posted: "${text.slice(0, 60)}..."`);

      // Store for website display
      if (result?.data) {
        this.postedTweets.unshift({
          id: result.data.id,
          text: text,
          createdAt: new Date().toISOString(),
        });
        // Keep last 20
        if (this.postedTweets.length > 20) this.postedTweets.length = 20;
      }

      return result;
    } catch (err) {
      console.error("[TWITTER] Failed to post:", err.message);
      return null;
    }
  }

  /**
   * Post a burn alert tweet with AI-generated content
   */
  async tweetBurnAlert(burnEvent) {
    if (!this.burnAlertsEnabled) return;
    try {
      const text = await generateBurnTweet(burnEvent);
      return this.tweet(text);
    } catch (err) {
      console.error("[TWITTER] Burn alert failed:", err.message);
    }
  }

  /**
   * Post a scheduled shitpost
   */
  async tweetShitpost() {
    try {
      const text = await generateShitpost();
      return this.tweet(text);
    } catch (err) {
      console.error("[TWITTER] Shitpost failed:", err.message);
    }
  }

  /**
   * Post a weekly treasury report
   */
  async tweetTreasuryReport(treasuryData) {
    try {
      const text = await generateTreasuryReport(treasuryData);
      return this.tweet(text);
    } catch (err) {
      console.error("[TWITTER] Treasury report failed:", err.message);
    }
  }

  /**
   * Fetch recent tweets from the X account in real-time
   */
  async fetchRecentTweets(count = 10) {
    try {
      const me = await this.client.v2.me();
      const timeline = await this.client.v2.userTimeline(me.data.id, {
        max_results: Math.min(count, 100),
        "tweet.fields": ["created_at", "public_metrics", "text"],
      });

      if (timeline.data?.data) {
        return timeline.data.data.map((t) => ({
          id: t.id,
          text: t.text,
          createdAt: t.created_at,
          metrics: t.public_metrics,
        }));
      }
      return [];
    } catch (err) {
      console.error("[TWITTER] Failed to fetch tweets:", err.message);
      return this.postedTweets.slice(0, count);
    }
  }

  /**
   * Start scheduled tweet intervals
   */
  startSchedule() {
    // Shitpost every N hours
    const shitpostMs = this.shitpostIntervalHours * 60 * 60 * 1000;
    const shitpostInterval = setInterval(
      () => this.tweetShitpost(),
      shitpostMs
    );
    this.scheduledIntervals.push(shitpostInterval);
    console.log(
      `[TWITTER] Shitpost schedule: every ${this.shitpostIntervalHours}h`
    );

    // Treasury report check every hour (only posts on the right day)
    const reportInterval = setInterval(() => {
      const now = new Date();
      const dayName = now
        .toLocaleDateString("en-US", { weekday: "long" })
        .toLowerCase();
      const hour = now.getHours();

      // Post at 10am on the configured day
      if (dayName === this.treasuryReportDay && hour === 10) {
        // Prevent double-posting by checking if we already posted this hour
        if (!this._lastReportHour || this._lastReportHour !== now.toISOString().slice(0, 13)) {
          this._lastReportHour = now.toISOString().slice(0, 13);
          // Treasury data will be passed from the treasury manager
          console.log("[TWITTER] Treasury report day — will post when data is ready");
        }
      }
    }, 60 * 60 * 1000);
    this.scheduledIntervals.push(reportInterval);

    console.log(
      `[TWITTER] Treasury report: ${this.treasuryReportDay}s at 10am`
    );
  }

  stopSchedule() {
    this.scheduledIntervals.forEach((id) => clearInterval(id));
    this.scheduledIntervals = [];
    console.log("[TWITTER] Schedules stopped");
  }
}
