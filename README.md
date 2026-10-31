# Marguru

Marguru is a pocket marketing agency for small business owners. You describe your business in about three minutes and
get a playbook of 25 to 35 copy-ready AI prompts. The prompts are filled in with your details and ordered the way an agency would
do the work, in 8 stages: Strategy, Google Maps, Website, SEO, Google Ads, Social ads, Content & email, Measure. Around
it: a field guide that explains in plain words what ad agencies actually do, what they charge and how to spot a bad one;
an Ad math calculator; and a Wins board where owners share what worked. Built on [Anvil](https://anvil.works).

- **App repo:** github.com/arkulinskis/marguru (branch `master`). Anvil pulls `master`.
- **Live:** https://marguru.anvil.app

## What it does

**For everyone (no account needed):**
- **Landing page** (`#landing`): the promise, the 8 jobs agencies do, how it works, features, "what Marguru won't help you do", FAQ.
- **Build a playbook** (`#build`): a 4-part form (basics, customers, goal and budget, what you have and your brand voice) with a live count
  of how many prompts your answers unlock, and **Fill with an example**. Guests' plans are kept in the browser (`#plan/local`).
- **The playbook** (`#plan/<id>`, `#plan/local`, `#plan/example`): progress bar, "Start here" (the next 3 prompts by priority),
  binder tabs for the 8 stages, each with "What an agency does here" and the agency role. Each prompt card has "Why agencies do this",
  the full prompt (the shared business brief folds into a chip until you expand it), "You get" / "Then", **Copy prompt**, **ChatGPT** / **Claude**
  (opens the chat with the prompt and also copies it), star, notes and **Done** (rubber-stamp animation; confetti when a stage is complete).
  **Download** saves the whole playbook as Markdown. Prompts adapt to the business: Maps prompts only for local businesses, paid-ads
  prompts only with a budget, product/feed prompts for stores, Local Services Ads for trades and professionals, Meta Special Ad Category
  and health-claim warnings when the business looks like housing, finance, hiring or health.
- **Field guide** (`#guide`, `#guide/<section>`): the short answer, the 8 jobs with what they're called on an invoice, why everyone opens
  an agency (white-label, SMMA courses), what it costs (Ahrefs survey), red flags in Google's own words with a 10-question **agency checker**,
  DIY vs hire, a searchable **jargon buster** (34 terms), and **sources** with a trust label for each.
- **Ad math** (`#math`): budget → clicks → leads → customers → profit, cost per lead and per customer, break-even cost per click, most you
  can pay per lead, agency fee share, and a verdict with the lever to fix. Defaults: LocaliQ/WordStream 2025 US search averages.
- **Wins board** (`#wins`): read and filter by channel. Demo wins are labelled "Example".
- Sign-up with email and password, a feedback form ("Send feedback" in the footer and menu), and the Privacy & Terms page.

**For members:**
- **Desk** (`#home`): your plans with a progress ring and the next prompt, a new-plan card, a Guru tip of the day (checked facts with
  their source), the latest wins and quick links. A plan made before signing up moves into the account automatically.
- Plans are saved with progress (done, stars, notes) on the server; edit or delete them. Up to 20 plans each.
- Post a win, clap ("This helped") for others, delete your own.

**For admins** (`#admin`; arkulinskis@gmail.com becomes an admin on first sign-in):
- **Overview:** people, admins, new feedback, plans saved, wins shared / hidden, prompts copied.
- **Feedback inbox:** New / Read / Done, private notes.
- **Users:** search, make admin, disable an account.
- **Wins:** hide / show again / delete any win.
- **Prompts:** which prompts are copied most (anonymous counts).
- **Demo data:** the example wins and their made-up authors; remove or reload.

## Where the facts come from

Everything in the prompts, tips and guide was checked in Oct 2026 against: Google Business Profile Help (local ranking), the Google Maps
contribution policy (fake engagement), Google Search Central ("Do you need an SEO?", helpful content), the Google Ads third-party policy,
the FTC's 2024 fake-review rule, the Ahrefs SEO pricing survey, LocaliQ/WordStream 2025 benchmarks and Meta's learning phase. Practitioner
posts on Medium are listed for tactics only. Reddit couldn't be read by the research tools, so no Reddit stories are quoted. The full list
with links is in `web/pages/guide.html` (`SOURCES`).

## Setting it up in Anvil (once)

1. In the Anvil editor: **Create app → Clone from GitHub**, and paste `https://github.com/arkulinskis/marguru`.
2. **Users** service: email + password, sign-up allowed (already set in `anvil.yaml`; check it).
3. Open the app in the editor. If it shows a **Schema Mismatch** alert, choose **"The schema of the source code is correct"** so Anvil creates the tables.
4. **Run** it and sign up with **arkulinskis@gmail.com** straight away (that account becomes the admin).
5. **Publish** (Publish → public URL, or your own domain).

## Working on it

See `.claude/skills/marguru/SKILL.md`. In short:

```
python -I tools/check.py --ui                    # syntax, server tests, headless UI tests → ALL CHECKS PASSED
python -I tools/preview/devserver.py 8765        # the app on in-memory data: http://localhost:8765/  (?as=ana#home, ?as=admin#admin)
python tools/deploy.py                           # dry run (needs PyYAML, so no -I)
python tools/deploy.py --push "Message"          # deploy: commit + push to GitHub, Anvil pulls it
```

## Project layout

```
web/            core.js/core.css (shared engine + field-notebook tokens), app.js (header, footer, tab bar), pages/*.html
web/pages/_library.html   the playbook engine (window.MG): profile choices, the 8 stages, every prompt, tips
client_code/    Main.py (the only Anvil form: bridge to the server, sign-in), legal.py
server_code/    common.py, Accounts.py, Feedback.py, Admin.py, DemoData.py, legal_server.py, Plans.py, Wins.py, Stats.py
assets/         icon.svg (megaphone) + generated PNG icons
tools/          sync_to_anvil.py (settings + table schema), deploy.py, check.py, preview/ (dev server, UI tests, screenshots), testing/
```
