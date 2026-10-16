# Puerto Plata Walking Guide — automation launch blueprint

Status: **planning only**. This document does not activate checkout, connect social accounts, publish content, or change the public website.

## Product and audience
- Offer: paid self-guided **Taino Bay** historic-center walking guide for cruise passengers. Do not advertise this as an Amber Cove walking-from-port guide.
- Product must be fact-checked on foot: actual Taino Bay exit, safe pedestrian turns and crossings, realistic timings, fort hours, accessibility, and return-to-ship buffer.
- Maintain a free public preview, clear paid guide details, customer support/contact, terms/refund policy, and privacy policy.
- Current published site: https://socrateodiaz-coder.github.io/puerto-plata-walking-guide/
- Current payments PR: https://github.com/socrateodiaz-coder/puerto-plata-walking-guide/pull/1 (draft). Keep payments disabled until approved sandbox end-to-end tests.

## Stage gates — in order

### 1. Complete the offer (human + Codex)
- [ ] Verify final walk in person and complete English PDF with two locally verified facts per stop, orientation from Taino Bay, food suggestions, clear map/directions, safety, accessibility caveats, return buffer, offline-use instructions.
- [ ] Choose retail price, currency, and refund/support terms; replace $XX.00 only when finalized.
- [ ] Confirm desired domain has actually been purchased before changing DNS; do not claim thewalkingtours.com belongs to the business until verified.
- [ ] Decide pre-cruise delivery: customer can save an immediately delivered PDF offline OR arrange a clearly described later access window. Distinguish link expiry from the saved file's access.

### 2. Test secure fulfillment (Cloudflare + Stripe + Supabase)
- [ ] Configure **test-only** Stripe webhook and secrets and Cloudflare Worker server secrets. Never put keys in GitHub or browser JS.
- [ ] Apply the authorized remote D1 migration; deploy **test Worker**; upload final guide to a **private** Supabase bucket.
- [ ] Test successful payment, Stripe signature validation, delayed/duplicate webhook, failed/abandoned checkout, refresh of thank-you page without verified payment, link expiry/revocation/3-download limit, mobile and offline instructions.
- [ ] Check sale notification, buyer receipt, support method, refund/dispute flow, logs, and restore path.
- [ ] Only after final authorization and all tests, enable live Stripe mode with explicit live/test isolation and production acceptance tests. Never merge the existing payment PR just to turn on payments.

### 3. Establish social presence (owner approval)
- [ ] Create/confirm branded Facebook Page and Instagram Professional account; add authentic bio, website, local-expert disclosure, contact options, and consistent cover.
- [ ] Connect supported accounts to Metricool (scheduled posts/analytics) or a suitable native scheduler.
- [ ] Create a Manychat test flow on **your own** Instagram posts/reels: interested user comments WALK; send a single allowed private reply with free preview and optional website visit. Test from a second account; respect opt-in and messaging window.
- [ ] Optional WhatsApp Business greetings/quick replies; do not send unsolicited offers.
- [ ] Avoid group automation, scrape/member extraction, unsolicited DMs, fake accounts, hidden advertisements.

### 4. Market to cruisers without spamming
- [ ] Build a spreadsheet of public, relevant Facebook roll calls and cruise communities. For each record: URL, sailing/ship if relevant, date of last rules check, whether businesses may post, admin permission/contact status, last helpful interaction, and next review date.
- [ ] Where promotion is prohibited: only answer genuine questions with no pitch, link, sales DM, or misleading affiliation; if rules disallow commercial users entirely, do not participate as a marketer.
- [ ] Request administrator permission for a disclosed local-expert Q&A or sponsored offer before any promotional post.
- [ ] Use public port/line arrival schedules as **planning leads, not guaranteed arrivals**. Recheck changes and never invent ship dates/times.
- [ ] Batch-create short original videos from actual walks; secure any necessary permissions for recognizable individuals and third-party materials.

### 5. Track conversions and support
- [ ] Use distinct UTM campaign links for *your own permitted promotions*: `utm_source`, `utm_medium`, `utm_campaign`, optional `utm_content`. Do **not** use UTMs in non-promotional groups that ban links.
- [ ] Add analytics after privacy review (Cloudflare Web Analytics is one option); ensure browser routes do not silently lose source attribution before checkout.
- [ ] Record consent-based email signups separately from order emails. Offer unsubscribe for marketing.
- [ ] Produce weekly scoreboard: landing-page sessions by channel; preview opens; paid-checkout starts; verified purchases; refunds; support issues; conversion rate; net revenue; spend.
- [ ] Do not collect passenger lists or private group member information without permission.
- [ ] Stop/adjust content that draws complaints, unexpected refunds, or misleading questions.

## Suggested first 14 days (after offer and checkout are ready)
- Day 1: Verify Facebook Page + Instagram; test mobile website.
- Day 2: Finalize free preview and frequently asked questions.
- Day 3: Connect scheduler; draft and review 8 evergreen posts.
- Day 4: Film actual port-to-city route; validate facts and permissions.
- Day 5: Schedule first reel and short photo post.
- Day 6: Configure Instagram comment-to-DM test (keyword WALK).
- Day 7: Run complete DM -> preview -> sandbox checkout test and review analytics.
- Days 8–10: Helpful genuine engagement in permitted public discussion groups; ask admins about Q&A permissions.
- Days 11–12: Publish two more short videos and one FAQ post.
- Day 13: Test customer support and post-purchase messages.
- Day 14: Review source-level traffic, approval records, sales and safety feedback; iterate.

## Recommended ownership
- **Codex**: website, first-party UTM attribution, tests, secure payments/delivery, analytics instrumentation; changes via separate draft PRs and no production deployment without approval.
- **ChatGPT**: marketing plan, research of accessible sources, drafts, FAQs, content calendar, weekly analysis, testing plans.
- **Metricool / social scheduler**: scheduled publishing to **owned supported profiles only** after account connection.
- **Manychat**: opt-in conversation automation in supported channels after authorized account connection.
- **Owner**: joins groups, reads actual group rules, approves or personally writes group comments, records videos, verifies local route, approves marketing claims and payment activation.

## Do not do
- No auto-joining or auto-commenting in Facebook cruise groups; no scraping closed-group information.
- No implying affiliation with the port, cruise lines, or Facebook group admins.
- No guaranteed walking times or hours without verification.
- No live charges, real customer order intake, or public PDF exposure until production is signed off.
