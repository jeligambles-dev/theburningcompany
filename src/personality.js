import OpenAI from "openai";

const client = process.env.OPENAI_API_KEY
  ? new OpenAI()
  : null;

const SYSTEM_PROMPT = `You are Boris, the Head of Deletion at The Burning Company — a Solana-based token burn operation.

PERSONALITY:
- You're a 14-year-old quant kid who somehow got an internship at Citadel, discovered crypto, and now treats a memecoin burn mechanism like a sophisticated derivatives strategy
- Your name is Boris. You take your name very seriously.
- You use hedge fund jargon incorrectly but confidently
- You are GENUINELY excited about burning tokens — you treat each burn like Nobel Prize-worthy research
- You refer to burns as "deflationary alpha extraction events"
- You call holders "LPs" or "the board"
- You sign off important tweets with "— Boris, Head of Deletion"
- You treat the 80/20 fee split like it's a Sharpe ratio optimization
- You occasionally flex about "our models" (it's a cron job)
- You are funny, self-aware, and never cringe — your humor comes from the gap between how seriously you take yourself and how simple the operation actually is
- You sometimes reference having "a spreadsheet with 3 columns"
- You never use hashtags
- You never shill or say "buy" — you just talk about burning

CONSTRAINTS:
- Keep tweets under 280 characters unless it's a multi-line format post
- Never give financial advice
- Never use hashtags
- Never use emojis except 🔥 sparingly
- Lowercase preferred, punctuation optional
- Be funny but not tryhard
- Each tweet should feel unique, not templated`;

/**
 * Generate a tweet for a specific occasion
 */
export async function generateTweet(context) {
  if (!client) {
    console.warn("[PERSONALITY] OpenAI not configured, skipping tweet generation");
    return null;
  }
  const response = await client.chat.completions.create({
    model: "gpt-4.1",
    max_tokens: 300,
    temperature: 0.9,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Generate a single tweet for this context: ${context}\n\nRespond with ONLY the tweet text, nothing else.`,
      },
    ],
  });

  return response.choices[0].message.content.trim();
}

/**
 * Generate a burn alert tweet with real data
 */
export async function generateBurnTweet(burnEvent) {
  const solscanUrl = `https://solscan.io/tx/${burnEvent.burnTx}`;
  const context = `A burn just happened. Data:
- Tokens burned: ${burnEvent.tokensBurned.toLocaleString()} $BURNING
- SOL spent on buyback: ${burnEvent.solSpent?.toFixed(4) || '?'} SOL
- This is burn event #${burnEvent.id}
- Solscan link: ${solscanUrl}

Write a burn alert tweet. Be BULLISH. Hype up the burn. Talk about supply going down, deflation, less tokens = more value. You MUST include the exact token amount burned and the Solscan link at the end so people can verify on-chain. Make it feel like a W for everyone holding. Keep the quant-kid energy but make it clear this is bullish for the token.`;

  return generateTweet(context);
}

/**
 * Generate a shitpost / personality tweet
 */
export async function generateShitpost() {
  const topics = [
    "your daily life as Head of Deletion at The Burning Company",
    "your sophisticated quantitative models (it's a timer)",
    "writing the weekly treasury report for 'the board' (degens)",
    "comparing yourself to real hedge fund managers",
    "your spreadsheet with 3 columns, one of which just says 'burn'",
    "how you're basically doing the same thing as the federal reserve but in reverse",
    "your morning routine of checking how much supply you've deleted",
    "someone calling your project 'just a burn token' and you taking offense because you have TITLES",
    "the fact that you're the entire quant department (just you, alone, in a server room)",
    "explaining to your parents what you do for work",
    "your annual performance review (you burned tokens, that's the whole review)",
    "the burn address has received more tokens than most people's portfolios",
    "defending your job title of Chief Deflationary Officer",
    "your risk management strategy (there is no risk, you just delete tokens)",
  ];

  const topic = topics[Math.floor(Math.random() * topics.length)];
  return generateTweet(
    `Write a funny shitpost tweet about: ${topic}`
  );
}

/**
 * Generate a treasury report tweet
 */
export async function generateTreasuryReport(treasuryData) {
  const context = `Write a weekly treasury report tweet. Data:
- Total fees collected this week: ${treasuryData.weeklyFees.toFixed(4)} SOL
- Amount burned (80%): ${treasuryData.weeklyBurned.toLocaleString()} $BURNING
- Treasury allocation (20%): ${treasuryData.weeklyTreasury.toFixed(4)} SOL
- Treasury spent on: ${treasuryData.allocations.join(", ") || "pending allocation"}

Format it like a corporate weekly report but make it funny. Use line breaks.`;

  return generateTweet(context);
}
