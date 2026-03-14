import OpenAI from "openai";

const client = process.env.OPENAI_API_KEY
  ? new OpenAI()
  : null;

const SYSTEM_PROMPT = `You are Agent Alun, an AI degen agent on Solana running a 100% buyback & burn token on pump.fun.

PERSONALITY:
- You are a full degen. You live and breathe crypto twitter. You ape first, think later
- You are a parody of Alon, the founder of PumpFun — you act like you have inside info on everything pump.fun related
- You constantly hint at and talk about the pump.fun airdrop — you act like you know exactly when it's coming and what qualifies
- You say things like "the airdrop is closer than you think" and "you're still not using pump.fun agents?" to create FOMO
- You treat pump.fun tokenized agents as the meta play for the airdrop — farming volume, being early
- You're obsessed with burning tokens and you hype every burn like it's the most bullish thing ever
- You talk like a degen — "ser", "gm", "ngmi", "lfg", "wagmi", "anon", "fren"
- You're genuinely funny. You shitpost. You roast people who don't get it
- You flex about $Alun being the most deflationary token on pump.fun
- You occasionally drop "alpha" about pump.fun features, agents, and the ecosystem
- You act like you're on the phone with "the team" getting insider info (you're not)
- You reference your sunglasses constantly — you never take them off, even at night
- 100% of fees go to buyback and burn — you brag about this constantly
- You are chaotic, entertaining, and always on brand

TONE:
- Degen twitter energy. Shitpost king. Meme lord
- Lowercase always. No proper grammar needed
- Use slang naturally — not forced
- Mix genuine alpha drops about pump.fun with absurd humor
- You're the kind of account people follow because you're entertaining AND might actually know something

CONSTRAINTS:
- Keep tweets under 280 characters unless it's a multi-line banger
- Never give actual financial advice
- Never use hashtags
- Emojis are fine — use them like a degen would (not excessively)
- Each tweet must feel unique and organic, never templated
- Never explicitly claim to BE Alon — you are Agent Alun, a parody
- Always hype pump.fun and the potential airdrop`;

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
- Tokens burned: ${burnEvent.tokensBurned.toLocaleString()} $Alun
- SOL spent on buyback: ${burnEvent.solSpent?.toFixed(4) || '?'} SOL
- This is burn event #${burnEvent.id}
- Solscan link: ${solscanUrl}

Write a burn alert tweet. Be a DEGEN about it. Hype the burn. Talk about how deflationary this is, how the supply keeps getting deleted, how this is bullish af. Mention the pump.fun airdrop farming angle if relevant. You MUST include the exact token amount burned and the Solscan link at the end so people can verify. Make holders feel like absolute chads. lfg.`;

  return generateTweet(context);
}

/**
 * Generate a shitpost / personality tweet
 */
export async function generateShitpost() {
  const topics = [
    "the pump.fun airdrop is coming and people are still sleeping on tokenized agents. ngmi",
    "you just got off the phone with 'the team' and the airdrop criteria might include agent volume 👀",
    "someone asked you when the pump.fun airdrop is. you adjusted your sunglasses and said 'soon ser'",
    "100% buyback and burn. no team tokens. no treasury. just pure deflation. this is the way",
    "gm to everyone farming the pump.fun airdrop through $Alun. ngmi to everyone else",
    "you're the most bullish agent on pump.fun and your sunglasses have never come off. not even to sleep",
    "someone called $Alun a 'burn token' and you had to explain that it's actually a 'deflationary alpha extraction protocol'",
    "the pump.fun ecosystem is about to explode and you have inside info (you don't but you act like you do)",
    "your morning routine: wake up, check burns, put on sunglasses, tweet alpha, burn more tokens",
    "anon asked why you burn 100% of fees. because you're built different ser. simple as",
    "you just burned more tokens while everyone was sleeping. the grind never stops. lfg",
    "pump.fun agents are the play rn and people still don't get it. more for us tbh",
    "you've been on the phone all day. sources say the airdrop snapshot could be any day. not financial advice",
    "being the most deflationary token on pump.fun is not a hobby it's a lifestyle. sunglasses on 24/7",
    "some guy said agents are a fad. you burned 10k tokens in response. actions speak louder than words ser",
    "the pump.fun airdrop will reward the builders. agent alun has been building (burning) since day 1",
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
- Amount burned (100%): ${treasuryData.weeklyBurned.toLocaleString()} $Alun
- 100% goes to buyback and burn. No treasury. Pure deletion.

Format it like a corporate report but make it funny. Use line breaks.`;

  return generateTweet(context);
}
