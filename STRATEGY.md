# Strategy & Go-to-Market

> Living doc. Started 2026-05-19 from a brainstorming session with
> Edouard. Captures B2C+B2B dual-track strategy, target audience, brand
> positioning, cagnotte feature scope, and what's still open.
>
> **Sibling docs:** `PUBLIC_LAUNCH.md` is the engineering roadmap to
> launch. `EVENTS_M2.md` is the historical narrative of the Events
> redesign. `ARCHITECTURE.md` is the data model. This doc is the
> business/positioning layer that sits above all of them.

---

## TL;DR

- Product is feature-complete and live at `ratlist.app` (Phase 1A/1B/1C
  all shipped); see `PUBLIC_LAUNCH.md` for what's left engineering-side
- **Strategic pivot 2026-05-19:** stop treating this as a private
  friend tool. Two parallel revenue tracks: B2C-affiliate (EN+FR
  consumer) and B2B-license (French enterprise via cagnotte hook)
- **Audience pivot:** RU deprioritised (not affiliate-monetisable);
  **EN first, FR second**
- **Brand:** keep "Rat List" name; **rats become mascot, not identity**
  (Ratatouille / Mailchimp model). RU tagline «вишлист для крысят»
  retired for EN+FR copy
- **Cagnotte feature** added to scope and **gates the public launch** —
  it's the single biggest differentiator and the B2B-hook
- **No rush to launch:** finish cagnotte + re-brand + FR locale first,
  then hit ProductHunt / HN / French startup channels
- **Team:** Edouard solo + Claude for most ops; warm-intro relationships
  via friend (Product Owner at Danone) and manager (La Poste)

---

## Audience — decided 2026-05-19

| Tier | Locale | Reasoning |
| ---- | ------ | --------- |
| Primary | EN | ProductHunt / HN / design community lives here; affiliate ecosystem (Amazon Associates et al.) is EN-first |
| Secondary | FR | Native angle for B2B cagnotte hook; Edouard's network is FR; under-served by current English-only wishlist players |
| Deprioritised | RU | Not affiliate-monetisable; payment friction; existing TG group «Крысиное» remains internal beta cohort, not a launch channel |

**Implications:**
- All marketing copy lives in EN + FR. RU UI stays in the product
  (toggle still works) but is not a marketing surface
- FR must be **native-quality**, not Google-Translate. Edouard +
  Claude + ChatGPT will pair on translation
- Buy `ratlist.fr` (~5€/yr) for the FR-locale landing
- `Accept-Language` header drives default locale on first visit

---

## Brand — partially decided

**Decided:**
- Name **"Rat List"** stays
- **Rats are mascot, not identity.** Hand-drawn doodles in margins
  remain (visual asset); but no "join the rats" / "wishlist for the
  rats" copy in EN/FR
- Cultural reading by locale informs how aggressive we can be:
  - **EN:** "rat" largely negative ("don't be a rat", "rat race",
    "snitches and rats"). Works only as cute character, never as
    identity. Reference points that work: Ratatouille (Remy), Master
    Splinter, lab/gym/studio rat
  - **FR:** much better — Ratatouille is a national-pride film,
    "petit rat de l'Opéra" historically refers to young Paris Opera
    ballerinas (prestigious). The mascot reads as charming-parisian
  - **RU:** neutral-to-positive for the under-30 crowd ("крысиное"
    as friendly gossip); irrelevant for the EN+FR audience we now target

**Open:**
- **New EN+FR taglines** — three candidates, untested:
  - "A small, secret wishlist app."
  - "Where your wishes are safe — even from you."
  - "Your wishes, kept under wraps."
  - To test on 5-10 friends each before committing
- **Copy rewrite** across landing, OG-image text, transactional email
  subjects, onboarding screens, empty-state copy — currently lean
  identity-mode, needs mascot-mode
- **OG-image** — currently the WOFF Latin-only Newsreader works; FR
  works fine, just verify text-length wrap for the new tagline

---

## Strategy — dual-track

```
                ┌─────────────────────────────────────────────┐
                │            Rat List (one product)           │
                └─────────────────────────────────────────────┘
                          │                              │
                          ▼                              ▼
        ┌────────────────────────┐         ┌──────────────────────────┐
        │  B2C — ratlist.app     │         │  B2B — ratlist.app/teams │
        │  EN-first, FR-second   │         │  FR-first (cagnotte hook)│
        │  Affiliate revenue     │         │  License revenue         │
        │  PH / HN / FR startup  │         │  Warm intros via friends │
        │  Volume, low ARPU      │         │  Few customers, high ARPU│
        └────────────────────────┘         └──────────────────────────┘
```

### B2C track

- **Revenue model:** affiliate. Mostly EN-affiliate networks (Amazon
  Associates after traffic threshold, eBay Partner Network, Awin) and
  FR-side (Awin France, Effiliation)
- **Channels:** ProductHunt, Hacker News, IndieHackers (EN + FR),
  BetaList, BetaList.fr, design-twitter, FR-startup newsletters
  (FrenchTech, MaddyNess)
- **Seasonal peak:** Nov-Dec (Secret Santa) — predictable launch window
- **Differentiation:**
  - Privacy (RLS-enforced claim hiding — actually rare; Elfster/Giftster
    leak this to the owner)
  - Editorial design (paper / ink / Newsreader / Caveat — anti-SaaS look)
  - Native Secret Santa with exclusions + reveal
  - Events-first UX model (vs static list paradigm)
  - PWA, no install friction

### B2B track

- **Revenue model:** per-seat or flat-fee licensing
  - Indicative: €2-4/employee/year per-seat → a Danone-France-scale
    pilot (6k employees) = €12-24k ARR for a single deal
  - Or flat tiers: SMB €500/yr, Mid €5k/yr, Enterprise €25k+/yr
- **Channels: warm intros only**, no outbound at start
  - Edouard's friend at **Danone** — Product Owner in a transformation
    team. Decent position, likely able to intro into HR / internal-comms
  - Edouard's manager at **La Poste** — "пробивной", potentially intros
    inside La Poste (but see [IP caveat](#la-poste--ip--employment-caveat))
  - First pilot → public case study → second cold-warm intro easier
- **Hook: cagnotte.** French companies routinely run "cagnotte des
  collègues" for birthdays / departures / parental leave / retirement.
  Today they use Leetchi / Le Pot Commun for the **payment** side, and
  someone separately asks the recipient "what would you want?". **No
  current player integrates wishlist + cagnotte** — that's the gap

### Why these two don't conflict

- Same product, two SKUs / landings
- B2C runs through **automated channels** (PH/HN/SEO/content) —
  Claude routines do most of the operations
- B2B runs through **human relationships** — Edouard + friends + manager
- B2C output (design awards, PH ranking, user case studies) feeds B2B
  credibility
- B2B revenue subsidises the B2C ramp-up while affiliate traffic builds

---

## Cagnotte — feature scope

**Decision (2026-05-19):** **ship before public launch.** Reasoning:
easier to demo a finished product to enterprise than to promise a
feature; cagnotte turns the product from "wishlist" to "wishlist +
collective gifting" — a unique combo on FR market.

### Two depths to choose from

| Depth | What | Effort | When |
| ----- | ---- | ------ | ---- |
| **Light** | Collective claim: N people commit €X each toward one item. Coordinator collects offline. Tracking + email notifications | 2-3 days | Ship to everyone, public launch |
| **Full** | Real payments via Mangopay or Stripe Connect → escrow → payout to coordinator. KYC/AML for large coordinators | 2-3 weeks + compliance review | B2B-tier only initially (compliance burden justified by license revenue, not affiliate) |

**Recommendation:** start with Light for B2C, build Full as a B2B-tier
feature. Open question — see [Open questions](#open-questions-for-the-next-session).

### Schema readiness

- `claims.share` (numeric, default 1.0) already exists in schema — no UI
- For Light: add `claims.amount` (numeric, nullable) + `claims.currency`
  (text, default 'EUR'). Add an aggregate computed view for "how much of
  this item is funded"
- For Full: also add `claims.payment_intent_id` and a coordinator-claim
  marker; possibly a new `claim_payouts` table
- Engineering spec lives in `PUBLIC_LAUNCH.md` when it's drafted, not
  here

### Payments provider — open

- **Mangopay:** FR-native, owns Leetchi, specialises in pot-common
  patterns, regulated as e-money institution. Probably fastest path
  for the FR pilot
- **Stripe Connect:** global, better dev-DX, harder to do EU
  split-payments / pots without custom plumbing
- Pick after the Light feature is live + first B2B discovery call

---

## Team and automation

| Role | Owner |
| ---- | ----- |
| Product / dev | Edouard + Claude |
| FR enterprise outreach | Friend at Danone (Product Owner, transformation team) |
| Cross-functional FR enterprise | Manager at La Poste (potentially, IP caveat applies) |
| Payments / backend on cagnotte | Friend at La Poste (dev), if time available |
| Copy + EN→FR translation | Claude + ChatGPT (native quality target) |
| Marketing assets | Claude routines |
| Content / SEO | Claude routines (weekly post draft, FR + EN long-tail) |
| Analytics review | Claude routine, weekly digest |

### Cron-routines to set up (Claude Cloud)

- **Weekly digest:** Plausible numbers + Sentry issues + new signups +
  retention cohort + sales-pipeline status (if B2B starts)
- **Daily check:** Vercel deploy status + Supabase health + UptimeRobot
- **Weekly content:** one FR + one EN blog-post draft on
  cagnotte-/wishlist-related SEO queries
- **Pre-Santa-peak (Sept-Oct):** ramp SEO content to two posts per
  language per week

---

## La Poste — IP / employment caveat

Edouard is currently employed at La Poste. **Before pitching Rat List
to La Poste or any subsidiary**:

1. **Verify the employment contract for IP clauses.** French employment
   contracts can claim ownership of side-projects when they relate to
   the employer's business. Even if the contract is permissive,
   internal politics around a founder selling to their own employer is
   messy
2. If pitching: do it through the manager **openly, not as a side-deal**
3. **Strategic preference:** pitch other French corporates first (Danone
   via friend, then 1-2 more via case-study warm-intros), establish
   an independent IP track record, then approach La Poste from a
   position of strength
4. Worst case: La Poste IP-claim risk → never pitch them, treat them
   as future-distant-target

This applies only to Rat List → La Poste sales. Edouard's day-job is
unaffected.

---

## Competitive landscape — research TODO

Open work-item. Compile a matrix before launch. Approximate effort:
8-15 hours of structured research, output is a separate `COMPETITORS.md`
or appended section here.

### Categories to cover

**B2C wishlist:**
- Amazon Wishlist (global default, but locked to Amazon catalogue)
- MyWishList.com / WishList.com / Wishfinity / Wishtender
- Throne (creator-focused; Patreon-adjacent)
- Giftster (family-focused, US/CA)
- Elfster (Secret Santa focus; biggest US player here)
- FR-specific: are there native FR wishlist players? (Look for any
  ".fr" wishlist names; suspect the market is empty)

**FR cagnotte (the B2B-track competitors):**
- **Leetchi** (Mangopay subsidiary, market leader; €1B+ collected)
- **Le Pot Commun** (Crédit Mutuel Arkéa)
- **Lydia / Sumeria** (mobile-first; "Cagnotte Lydia")
- **Papayoux** (free, donation-oriented)
- **PayPal Pools** — closed 2021, freed market share

**EN collective gifting:**
- Honeyfund (wedding-focused)
- Plumfund (general)
- GoFundMe + variants
- Splitwise (adjacent — bill-split, not gifts)

**Wedding / baby registry (adjacent vertical to map for later):**
- Babylist, Zola, MyRegistry, The Knot

### For each competitor, extract

- Pricing model
- UX strengths and weaknesses
- Payment integrations
- Branding / positioning / tagline
- Whether they integrate wishlist + cagnotte (expectation: nobody does;
  this is the gap)
- Geo footprint (especially FR coverage)

### Output

A short matrix + 1-2 paragraph positioning statement against each. Goal:
ammunition for the public-launch copy ("we do X, where Leetchi can't, by
Y mechanism") and the B2B one-pager.

---

## Launch sequence — sequenced, dates TBD

Each phase blocks the next. Dates depend on Edouard's available time
(reasonably elastic per his own statement).

| Phase | What | Notes |
| ----- | ---- | ----- |
| **A** | Finish `PUBLIC_LAUNCH.md` backlog | Rate limits, notification prefs, 2 emails, Lighthouse re-pass |
| **B** | Cagnotte feature (Light depth) | Spec → schema → UI → email touchpoints |
| **C** | Re-brand copy (mascot mode) | New EN+FR taglines tested → landing rewrite → OG image refresh → email tone alignment |
| **D** | FR locale + `ratlist.fr` | Native-quality FR strings + legal pages + emails; buy domain; FR prerender variant |
| **E** | Competitive research | Compile `COMPETITORS.md` or section here |
| **F** | Marketing assets | Demo video EN + FR; press kit; PH gallery; B2B one-pager |
| **G** | Soft launch | TG «Крысиное» + personal-network beta. Goal: 50-100 early users, surface UX surprises |
| **H** | Hard launch | ProductHunt (Tuesday 00:01 PT) + HN Show HN + BetaList.fr + FR newsletters + Reddit /r/SideProject /r/InternetIsBeautiful |
| **I** | B2B in parallel | Discovery-call with Danone friend → warm intro → first pitch → free 3-month pilot. Target: one closed pilot in 6 months from public launch |
| **J** | Sustain | Q3-Q4: SEO content engine spinning up for Santa-peak. Nov-Dec: Santa campaign + micro-influencer outreach. Q1: review affiliate revenue + B2B pilot → decide on premium tier |

### Phasing principle

B2C-launch and B2B-pilot run **in parallel from phase H onward**, not
sequentially. They share the product but not the channels or the
selling motion.

---

## Open questions for the next session

These need explicit decisions before the related phase can start.

1. **Cagnotte depth:** Light only initially, or Light for B2C +
   Full-track in parallel for B2B?
2. **Payments provider if Full:** Mangopay vs Stripe Connect?
3. **Taglines:** which of the three candidates, or a fourth? Need a
   friends-test before committing
4. **Domain layout:** `ratlist.app` as canonical with `ratlist.fr` →
   301 redirect to `/fr`, or `ratlist.fr` as a separate prerendered
   FR-locale entry point? SEO-implications differ
5. **B2B SKU naming:** `/teams`, `/business`, `/pro`, `/enterprise`?
   Sets price expectation
6. **Friend at Danone — discovery call:** 5-7 question list to prepare
   before warm intro. Specifically: who runs cagnotte at Danone today?
   What tool? What's the pain? Who's decision-maker for adopting an
   alternative?
7. **La Poste IP check:** how/when to review the employment contract
   for IP clauses
8. **Competitive matrix:** ship as separate `COMPETITORS.md` or extend
   this section?

---

## What we deliberately won't do (yet)

- **Native iOS/Android apps** — PWA is enough; Capacitor-wrapped iOS
  app is on the table only if the App Store discovery channel matters
- **Public discovery feed** — privacy regression, off-brand
- **Premium consumer tier** — needs PMF signal first; affiliate
  is the right starter model
- **Chat / DMs inside the app** — friends share lists via Telegram /
  iMessage; the product doesn't need to host that conversation
- **Custom user domains** (`gabriel.ratlist.app`) — feature for a
  premium tier later, not v1

---

## Pickup tips for the next agent

- This is the **strategy doc**. Engineering roadmap = `PUBLIC_LAUNCH.md`.
  Historical narrative of the M2 redesign = `EVENTS_M2.md`. Data model =
  `ARCHITECTURE.md`. CLAUDE.md indexes them
- When strategic decisions land, update the section here AND move open
  questions to a closed-decisions section as they get resolved
- Don't break editorial-design constraints (paper / ink / accent /
  hand-drawn rats in margins) — that's a brand pillar, not a fashion
  choice. The B2B-tier UX must still feel like Rat List, not like
  enterprise SaaS
- Privacy invariants from CLAUDE.md remain non-negotiable in either
  track (including B2B). HR may want "visibility for admins" — refuse
  on the claims table specifically; admin can see participation, never
  who claimed what
- Be honest with Edouard about pacing — he's said "time is not the
  constraint", but if any phase looks like it's blocking another, raise
  it explicitly. The launch order matters more than speed
