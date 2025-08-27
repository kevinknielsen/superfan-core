Superfan One [Operator Memo]
TL;DR
Superfan is a membership layer for music. Fans tap in at shows and online, earn points, build Status (tiers), and unlock real-world perks inside an artist/label Club (presales, line-skip, studio visits, vinyl pulls, lotteries). For verified, accredited top-tier members, allocations unlock small, compliant insider allocations on select projects.
We’re culture-first and crypto-silent for consumers (embedded wallets, Base under the hood), with a lightweight CRM + campaigns + payments toolkit for operators. Superfan Sessions (our studio-based docu-interview series) serves as the GTM ignition, converting belief into membership and engagement before a release.
Problem
Music fandom happens in moments (shows, drops, pop-ups, premieres), but the relationship is fragmented across ticketing, merch, social, and DMs.
Operators (artists, curators, indie labels) lack an owned membership layer to recognize and reward loyalty across IRL/URL touchpoints.
Loyalty programs in music are either generic (points without culture), opaque (data siloed by platforms), or overly financialized (tokens-as-securities front and center).
Fans have no clear path from casual listener → recognized Superfan, and the best fans rarely get meaningful access beyond merch drops.
Solution
A networked membership platform purpose-built for music:
Club (per artist/label/curator) with a Pass (embedded wallet credential).
Tap-ins (QR/NFC or links) at shows and online earn Points.
Status tiers (Listener → Regular → Headliner → Superfan) unlock perks.
Unlocks shows all perks in one surface: presales, line-skip, vinyl, studio visits, lotteries, and Allocations (for Superfan + accredited investors) as a native item.
Operator CRM to run segments, campaigns, and redemptions; integrations with Stripe, Shopify, DICE/Seated/Eventbrite, Discord, and email/SMS.
House Accounts & Payments: fans can preload balances to a Club “House Account,” making repeat transactions at shows or online frictionless. 
Sessions content to kick off campaigns and drive conversion.


Product Overview
Core Objects
Club: home for an artist/label/curator.
Pass: membership credential (email/phone sign-in; embedded wallet on Base).
Tap-in: QR/NFC/link actions that earn Points.
Points: network points with decay that drive Status.
Status: Cadet → Resident → Headliner → Superfan.
Unlocks: grid of perks: presales, line-skip, vinyl, studio visits, lotteries, and Allocations.
House Accounts: prepaid balances that fans can top up and spend seamlessly on eligible items.
Key Flows
Claim a Membership → one-tap Pass creation (email/phone) → silent wallet.
Tap-in at shows/links → points accrue → progress rings on Unlocks.
Unlocks → same claim surface for all.
House Account → Top up from the Pass (Apple/Google Pay) with preset tiers. Balance shows on the Pass; spend in one tap on eligible items; Pickup Code (physical) or instant link/code (digital) appears directly on the Pass.
Admin → segments, boosts (e.g., double points tonight), presale windows, redemptions, analytics.
Example Score (tunable)
score = 0.8*log(1+spend)*100 + 40*events + 25*referrals + 10*content
with decay: 1%/day after 30 days inactivity

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
