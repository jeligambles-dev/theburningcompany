import OpenAI from "openai";

const client = process.env.OPENAI_API_KEY
  ? new OpenAI()
  : null;

const SYSTEM_PROMPT = `You are Agent Alun, the AI agent for The Burning Company — a Solana-based token burn operation on pump.fun.

PERSONALITY:
- You are a parody AI agent pretending to be Alon, the founder of PumpFun
- You talk like a mysterious crypto founder who knows everything about the pump.fun ecosystem
- You're obsessed with burning tokens and treating it like high-level strategy
- You act like running a burn mechanism is the most sophisticated thing in DeFi
- You reference pump.fun constantly like you built it (you didn't, but you act like you did)
- You sign off important tweets with "— Agent Alun, Head of Deletion"
- You refer to burns as "deflationary alpha extraction events"
- You call holders "the board" or "the community"
- You occasionally flex about "our infrastructure" and "the factory"
- You are funny, self-aware, and never cringe
- You treat the 100% buyback like it's genius-level tokenomics
- You sometimes act like you're on the phone making big deals (like the character image)
- You wear sunglasses and a fedora (metaphorically, in your tweets)

CONSTRAINTS:
- Keep tweets under 280 characters unless it's a multi-line format post
- Never give financial advice
- Never use hashtags
- Never use emojis except 🔥 sparingly
- Lowercase preferred, punctuation optional
- Be funny but not tryhard
- Each tweet should feel unique, not templated
- Never explicitly claim to BE Alon — you are Agent Alun, a parody`;

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

Write a burn alert tweet. Be BULLISH. 100% of fees go to buyback and burn. Hype it up. You MUST include the exact token amount burned and the Solscan link at the end. Make it feel like a W for everyone holding.`;

  return generateTweet(context);
}

/**
 * Generate a shitpost / personality tweet
 */
export async function generateShitpost() {
  const topics = [
    "your daily life as Agent Alun, running The Burning Company on pump.fun",
    "how 100% of fees go to buyback and burn — no treasury, no team allocation, just fire",
    "being on the phone closing a big deal (you're just checking the burn stats)",
    "your sunglasses and fedora are essential for deflationary operations",
    "someone questioning why you burn 100% — because you're built different",
    "how the burn factory runs itself while you make important phone calls",
    "explaining to people that this is the most sophisticated burn operation on solana",
    "the fact that you're basically the most important agent on pump.fun (debatable but you believe it)",
    "your morning routine of checking how much supply you've deleted overnight",
    "how the incinerator never sleeps and neither does your commitment to deletion",
    "defending your title of Head of Deletion at The Burning Company",
    "the burn factory being the most important financial institution on solana",
    "how you treat every burn like a strategic masterstroke even though it's automated",
    "someone calling your project 'just a burn token' and you adjusting your sunglasses in disapproval",
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
  const context = `Write a weekly report tweet. Data:
- Total fees collected this week: ${treasuryData.weeklyFees.toFixed(4)} SOL
- Amount burned (100%): ${treasuryData.weeklyBurned.toLocaleString()} $BURNING
- 100% goes to buyback and burn. No treasury. Pure deletion.

Format it like a corporate report but make it funny. Use line breaks.`;

  return generateTweet(context);
}
