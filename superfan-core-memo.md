Superfan One [Operator Memo] - UPDATED WITH UNIFIED ECONOMY
TL;DR
Superfan is a revolutionary artist economy platform. Fans tap in at shows and online, earn points, build Status (tiers), and unlock real-world perks inside artist/label Clubs. BREAKTHROUGH: Points are now universal currency - earned through engagement AND purchasable with USD, creating the first platform where fan engagement has direct economic value. Fans can spend points on perks while protecting their social status.

NEXT: Pre-order escrow system where fans commit points to vinyl/merch campaigns. Risk-free demand validation - only produce what's pre-sold. Automatic fulfillment when MOQ reached.

We're culture-first and crypto-silent for consumers (embedded wallets, Base under the hood), with a revolutionary points economy + campaigns + payments toolkit for operators.
Problem
Music fandom happens in moments (shows, drops, pop-ups, premieres), but the relationship is fragmented across ticketing, merch, social, and DMs.
Operators (artists, curators, indie labels) lack an owned membership layer to recognize and reward loyalty across IRL/URL touchpoints.
Loyalty programs in music are either generic (points without culture), opaque (data siloed by platforms), or overly financialized (tokens-as-securities front and center).
Fans have no clear path from casual listener → recognized Superfan, and the best fans rarely get meaningful access beyond merch drops.
Solution - EVOLVED WITH UNIFIED ECONOMY
A revolutionary artist economy platform purpose-built for music:
Club (per artist/label/curator) with a Pass (embedded wallet credential).
Tap-ins (QR/NFC or links) at shows and online earn Points.
BREAKTHROUGH: Points are universal currency - earned through engagement AND purchasable with USD.
Status tiers (Cadet → Resident → Headliner → Superfan) unlock perks, calculated from earned points only.
Smart spending: purchased points first, then earned points, with status protection to prevent tier drops.

NEXT: Pre-order escrow MVP - fans commit points to vinyl campaigns. Risk-free demand validation with automatic fulfillment when MOQ reached. Proves revolutionary concept where engagement funds product development.

Unlocks shows core perks: presales, line-skip, vinyl campaigns (MVP focus).
Operator tools: campaign creation, commitment tracking, manual fulfillment (manufacturing integration post-MVP).


Product Overview - UPDATED FOR UNIFIED ECONOMY
Core Objects
Club: home for an artist/label/curator.
Pass: membership credential (email/phone sign-in; embedded wallet on Base).
Tap-in: QR/NFC/link actions that earn Points.
Points: REVOLUTIONARY - universal currency earned through engagement AND purchasable with USD.
Status: Cadet → Resident → Headliner → Superfan (earned points only, protected during spending).
Unlocks: grid of perks: presales, line-skip, vinyl campaigns (MVP focus).
Escrow Campaigns: fans commit points to pre-orders, risk-free demand validation for artists.
Key Flows - UPDATED FOR UNIFIED ECONOMY
Claim a Membership → one-tap Pass creation (email/phone) → silent wallet.
Tap-in at shows/links → points accrue → progress rings on Status.
Buy Points → Stripe checkout ($1 for 1000 points) → instant balance update.
Spend Points → status protection toggle → smart spending (purchased first, then earned).
Commit to Campaign → points held in escrow → auto-refund or fulfillment based on MOQ.
Admin → campaign creation, commitment tracking, manual resolution (MVP).
Example Score (simplified for MVP)
Status based purely on earned points: Cadet (0) → Resident (500) → Headliner (1500) → Superfan (4000)
No decay system in MVP - keep it simple

Business Model
Primary revenue streams (v1):
SaaS: per Club/month, tiered by MAU and features.
Payments Take: A % on processed transactions (tickets/merch run through embedded flows or webhooks), plus small redemption fees on Unlocks.
Allocation Fee: on eligible Allocation unlocks. Optional carry only when appropriate to the structure and jurisdiction.
No fan-side subscription required in v1; Clubs may later introduce paid tiers if desired.
Unit Economics (Illustrative)
Club SaaS: $99–$399/mo depending on MAU and features.
Payments Take: 1–2% on processed volume through our flows + $0.50 redemption fee where applicable.
Contribution Margin: infra costs low (embedded wallet + storage + notifications). Customer support & success are the main variable costs.
Example: A mid-size Club with 2k members, 600 monthly Tap-ins, $15k/mo in merch/ticket volume via our flows:
SaaS: $199
Payments Take @1.5%: $225
Redemption fees (400 redemptions): $200
Monthly revenue from Club ≈ $624 (excl. any Allocation admin fee events).
Traction (to date)
Product: Auth (Privy), embedded wallets, KYC/acc gating scaffolding, QR Tap-ins, drop UX foundations in place.
Sessions: first live shoot scheduled (Sep 10) to pilot Join the Club funnel → premiere → show Tap-ins.
Pipeline: initial Clubs in discussion for Cohort One pilots (artists/curators in NYC and LA); venue/label partners in conversations.
Note: We’ve intentionally scoped v1 to loyalty + access, with Allocation unlocks as a gated extension for top-tier accredited members.
Technology & Compliance
Stack: Next.js + Tailwind, Supabase (auth/data/storage), Privy (auth + embedded wallets), Base (onchain rails), Stripe, Shopify, ticketing APIs (DICE/Seated/Eventbrite), Discord, Resend/Klaviyo for messaging.
Compliance posture: V1 is access/loyalty only. Allocation unlocks require (a) Status threshold, (b) KYC + accreditation, with separate SPV/SAFT docs and clear disclosures. No general solicitation to ineligible users.





KPIs (Operator & Network)
Operator-level
Active Members (30d)
Tap-ins / DAU & IRL: URL mix
Unlocks Redeemed & mix (presale/line-skip/vinyl/studio/lottery/allocation)
CAC → LTV for each Club; campaign ROAS
Allocation funnel (eligible → view → pledge → settle) when used
Network-level
Clubs live / monthly retention
Cross-Club membership overlap
Points distribution & decay
Sessions → Join conversion rate; Tap-in rate at premiere/show
Appendix A — Minimal Data Model
users(id, email, wallet, cred, last_seen, kyc_status, accreditation_status)
clubs(id, owner_id, name, city)
memberships(user_id, club_id, status, join_date)
tapins(id, user_id, club_id, source, points, ts, geo)
ledger(id, user_id, club_id, delta, reason, ts)
perks(id, club_id, type: 'perk' | 'lottery' | 'allocation', title, copy, cost_points, stock, rules_json)
rules_json: {min_status, requires_accreditation, window_start/end, caps}
redemptions(id, user_id, perk_id, status, ts, meta_json) — includes allocation reservations
allocation_docs(id, perk_id, docs_url, terms_checksum)
allocation_pledges(id, perk_id, user_id, amount, payment_method, status, ts)
Appendix B — Example: PHAT PASS
Tap-ins: trailer (+20), premiere chat (+40), show entry (+100), merch (+50), pre-save (+40)
Tiers: Cadet (0) → Resident (500) → Headliner (1500) → Superfan (4000)
Unlocks: presale, line-skip, studio visit, vinyl lottery, Allocation (locked until Superfan + accredited). Time-boxed $10k cap, $250–$1k tickets.
