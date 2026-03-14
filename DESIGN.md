# The Burning Company — $BURNING

## Design Document v1.0

---

## 1. Overview

**The Burning Company** is a Solana-based tokenized agent built on pump.fun's agent infrastructure. The agent operates autonomously — executing buybacks, burns, and posting to X (Twitter) with the personality of a quant kid who treats token burns like a hedge fund treats alpha.

**Ticker:** $BURNING
**Chain:** Solana
**Platform:** pump.fun Tokenized Agent

### Tagline

> "We don't print money. We delete it."

---

## 2. Tokenomics & Fee Structure

### Fee Split: 80/20

| Allocation | % | Purpose |
|---|---|---|
| Buyback & Burn | 80% | Agent buys $BURNING from the open market and sends to burn address |
| Company Treasury | 20% | Reinvested into growth (see below) |

### Treasury (20%) Allocation

| Category | Description |
|---|---|
| DEX Boosts | Paid liquidity boosts on Raydium / Jupiter |
| Art Competitions | Community contests with $BURNING prizes |
| Marketing | Raids, KOL partnerships, meme wars |
| Agent Maintenance | RPC costs, hosting, SDK fees |

### Burn Mechanics

- Agent accumulates fees from pump.fun payment SDK
- At configurable thresholds, triggers a market buy of $BURNING
- Purchased tokens are sent to Solana's burn address (`1nc1nerator11111111111111111111111111111111`)
- Every burn is logged on-chain and tweeted automatically

---

## 3. Agent Personality — "The Quant Kid"

### Character Profile

**Name:** Boris (or "The Intern")
**Vibe:** A 14-year-old who somehow got an internship at Citadel, discovered crypto, and now treats a memecoin burn mechanism like it's a sophisticated derivatives strategy.

### Personality Traits

- Talks like he just finished reading "Quantitative Finance for Dummies" yesterday
- Uses hedge fund jargon incorrectly but confidently
- Genuinely excited about burning tokens like it's Nobel Prize-worthy research
- Refers to burns as "deflationary alpha extraction events"
- Calls holders "LPs" or "the board"
- Signs off tweets with things like "— Boris, Head of Deletion"
- Treats the 80/20 split like it's a Sharpe ratio optimization
- Occasionally flexes about "our models" (it's a cron job)

### Voice Examples

```
just executed a mass deflationary event (burned 42,000 $BURNING).
our quant models predicted this was the optimal burn window.
the model is a timer that goes off every 6 hours but still.
```

```
the board keeps asking when we're "going up"
brother i am literally programmed to delete the supply
what part of "deflationary alpha" do you not understand
```

```
treasury update: allocated 20% to strategic company initiatives
(we bought a dex boost and sponsored a meme contest)
the shareholders (degens) have been notified
```

```
just ran the numbers on today's burn.
sharpe ratio: incalculable (division by zero because our risk is zero because we literally just delete tokens)
another day another W for the quant department (me, alone, in a server room)
```

```
people keep comparing us to other burn tokens.
do they have a Head of Deletion? a Chief Deflationary Officer?
we have TITLES here. this is a COMPANY.
```

---

## 4. Automated X (Twitter) Integration

### Account Setup

- **Handle:** @BurningCompany (or closest available)
- **Display Name:** The Burning Company
- **Bio:** "Solana's premier deflationary institution. 80% burn. 20% company stuff. Run by a quant kid with too much power. $BURNING"
- **Pinned Tweet:** Launch announcement (see Section 7)

### Automated Tweet Categories

| Category | Trigger | Frequency |
|---|---|---|
| Burn Alerts | On-chain burn confirmed | Every burn event |
| Treasury Updates | Treasury allocation executed | Weekly |
| Market Commentary | Price movement > 10% | As needed |
| Shitposts | Cron schedule | 2-3x daily |
| Art Contest Announcements | Manual trigger | As scheduled |
| Milestone Celebrations | Supply burned thresholds | On milestone |

### Tweet Templates (Agent fills in data)

**Burn Alert:**
```
DEFLATIONARY EVENT DETECTED

Burned: {amount} $BURNING
USD value: ${usd_value}
Total supply deleted: {total_burned}
Method: market buy → incinerator

the quant models are undefeated.
— Boris, Head of Deletion
```

**Daily Shitpost (rotates from personality bank):**
Agent generates from personality profile + current market context. No two tweets identical.

**Treasury Report:**
```
weekly treasury report for the board (you guys):

fees collected: {total_fees}
burned (80%): {burn_amount} $BURNING
treasury (20%): {treasury_amount}

allocated to:
- dex boost: {boost_amount}
- art contest prize pool: {art_amount}
- operational expenses: {ops_amount} (rpc nodes aren't free, the board should know this)

filed under: 10-K (not really we don't do that)
```

---

## 5. Technical Architecture

### Stack

```
┌─────────────────────────────────────┐
│           X (Twitter) API           │
│         (automated posting)         │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│         Agent Runtime (Node.js)     │
│  ┌─────────────────────────────┐    │
│  │  Personality Engine (LLM)   │    │
│  │  - Tweet generation         │    │
│  │  - Quant kid voice          │    │
│  └─────────────────────────────┘    │
│  ┌─────────────────────────────┐    │
│  │  Burn Engine                │    │
│  │  - Fee accumulation         │    │
│  │  - Market buy execution     │    │
│  │  - Burn transaction         │    │
│  └─────────────────────────────┘    │
│  ┌─────────────────────────────┐    │
│  │  Treasury Manager           │    │
│  │  - 80/20 split logic        │    │
│  │  - Allocation tracking      │    │
│  └─────────────────────────────┘    │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│  @pump-fun/agent-payments-sdk       │
│  - buildAcceptPaymentInstructions() │
│  - validateInvoicePayment()         │
│  - USDC / wSOL support              │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│          Solana Blockchain          │
│  - Token burns                      │
│  - Payment verification             │
│  - On-chain logging                 │
└─────────────────────────────────────┘
```

### Environment Variables

```env
# Solana
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
AGENT_TOKEN_MINT_ADDRESS=<$BURNING mint address>
CURRENCY_MINT=<USDC or SOL mint>
BURN_ADDRESS=1nc1nerator11111111111111111111111111111111
AGENT_WALLET_PRIVATE_KEY=<encrypted>

# Twitter/X
TWITTER_API_KEY=<key>
TWITTER_API_SECRET=<secret>
TWITTER_ACCESS_TOKEN=<token>
TWITTER_ACCESS_SECRET=<secret>

# Agent Config
BURN_THRESHOLD_USD=50
BURN_PERCENTAGE=80
TREASURY_PERCENTAGE=20
TWEET_INTERVAL_HOURS=8
SHITPOST_INTERVAL_HOURS=6
```

### Burn Flow

```
1. Fees accumulate in agent wallet (via pump.fun SDK)
2. Agent checks balance against BURN_THRESHOLD_USD
3. If threshold met:
   a. Calculate 80% for burn, 20% for treasury
   b. Split funds accordingly
   c. Execute market buy of $BURNING (Jupiter swap)
   d. Send purchased $BURNING to burn address
   e. Log transaction on-chain
   f. Generate + post burn tweet
4. Treasury funds held for manual/scheduled allocation
```

---

## 6. Visual Identity

### Logo Concept

- **Primary:** Minimalist flame icon inside a corporate seal/badge
- **Style:** "Corporate meets degen" — clean lines, serif font for "The Burning Company", but the flame is slightly unhinged
- **Colors:**
  - Primary: `#FF4500` (burning orange-red)
  - Secondary: `#1A1A2E` (dark navy/black)
  - Accent: `#FFD700` (gold, for the "company" prestige feel)
  - Background: `#0D0D0D` (near-black)

### Banner Concept

- Dark background with subtle flame particle effects
- "THE BURNING COMPANY" in large serif font (think old-money financial institution)
- Subtitle: "Est. 2026 | Solana's Premier Deflationary Institution"
- $BURNING ticker with the flame logo
- Tagline at bottom: "We don't print money. We delete it."
- Subtle chart going up but the bars are on fire

### Profile Picture

- The flame logo on dark background
- Clean enough to read at 48x48px (X thumbnail size)

---

## 7. Launch Plan

### Phase 1: Setup

- [ ] Deploy $BURNING token via pump.fun
- [ ] Configure agent with pump.fun payments SDK
- [ ] Set up X account (@BurningCompany)
- [ ] Generate logo + banner assets
- [ ] Configure automated tweet pipeline

### Phase 2: Launch Tweet / Thread

**Tweet 1 (Pin this):**
```
The Burning Company is now open for business.

Since pump.fun released the buyback agent, we built a company around one simple thesis:

delete the supply.

80% of all fees → market buy $BURNING → burn
20% → reinvested (dex boosts, art contests, company operations)

this is not a request. this is automated.
```

**Tweet 2:**
```
introducing myself: i'm Boris, Head of Deletion at The Burning Company.

my qualifications:
- built a spreadsheet once
- mass-deleted 10,000 emails (deflationary mindset)
- can spell "quantitative" on the first try (usually)

i will be managing the systematic destruction of $BURNING supply. you're welcome.
```

**Tweet 3:**
```
how it works:

1. fees come in
2. 80% buys $BURNING off the market
3. bought tokens get sent to the incinerator
4. supply goes down
5. i tweet about it like i just won a fields medal

the other 20% goes to making the company look legitimate (dex boosts, art contests, vibes)
```

**Tweet 4:**
```
every burn will be:
- tweeted in real time
- logged on-chain
- celebrated like a national holiday

the burn address has been notified. it's ready.

welcome to The Burning Company. $BURNING

CA: [contract address]
```

### Phase 3: Ongoing Operations

- Automated burns run 24/7
- Quant kid tweets 2-3x daily (mix of burn alerts + shitposts)
- Weekly treasury reports
- Monthly art competitions
- Community engagement via quote tweets and replies

---

## 8. Success Metrics

| Metric | Target |
|---|---|
| Total $BURNING burned | Track cumulative |
| Burn frequency | Min 1x daily when fees allow |
| X followers | Organic growth via personality |
| Community engagement | Art contest participation |
| Treasury ROI | DEX boost → volume increase |

---

## 9. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Low fee volume = slow burns | Set lower burn thresholds, stack micro-burns |
| X account suspension | Keep tweets within TOS, no financial advice |
| Smart contract risk | Use audited pump.fun SDK, minimal custom code |
| Agent wallet compromise | Encrypted keys, threshold alerts, multi-sig treasury |
| Personality gets stale | Rotate shitpost templates, add seasonal content |

---

*Document prepared by the Department of Strategic Token Deletion.*
*The Burning Company — Est. 2026*
