/* mg.js: Marguru's playbook engine (window.MG), moved unchanged from the JavaScript version (web/pages/_library.html).
   The business profile fields, the 8 stages (the jobs an agency does), every prompt template, the rules for which
   prompts a business gets, and the shared tips. Pure functions: MG.build(profile) -> {stages, prompts}.
   Facts inside prompts were checked against primary sources (see the Field guide's Sources section):
   Google Business Profile help, Google Maps contribution policy, Google Search Central, Google Ads policy,
   the FTC's 2024 fake-review rule, Meta's learning phase. Don't add numbers you haven't checked.
   Python reaches it through client_code/mg.py (MG.json: JSON text in and out). */
(function () {
  'use strict';
  var MG = window.MG = {};

  MG.TYPES = [
    ['food', 'Restaurant, café or bar', 'pizzeria, bakery, coffee shop'],
    ['retail', 'Shop or boutique', 'florist, bookshop, gift shop'],
    ['ecom', 'Online store', 'candles, apparel, supplements'],
    ['trades', 'Home services & trades', 'plumber, electrician, cleaner, roofer'],
    ['health', 'Health & wellness clinic', 'dentist, physio, therapist'],
    ['beauty', 'Beauty, hair & spa', 'salon, barber, nails, spa'],
    ['fitness', 'Fitness & classes', 'gym, yoga, dance, martial arts'],
    ['pro', 'Professional services', 'accountant, lawyer, consultant'],
    ['realestate', 'Real estate', 'agent, property manager'],
    ['creative', 'Creative & events', 'photographer, DJ, wedding planner'],
    ['software', 'Software or app', 'SaaS, mobile app'],
    ['other', 'Something else', '']
  ];
  MG.REACH = [
    ['visit', 'Customers come to me', 'a shop, studio, office or restaurant'],
    ['goto', 'I go to my customers', 'a service area'],
    ['online', 'Online, anywhere', 'shipping or digital'],
    ['both', 'A location and online', 'both']
  ];
  MG.GOALS = [
    ['calls', 'More calls & bookings'], ['walkins', 'More people through the door'], ['sales', 'More online sales'],
    ['leads', 'More enquiries for big jobs'], ['awareness', 'Get known (we\'re new)'], ['repeat', 'More repeat customers']
  ];
  MG.BUDGETS = [['0', '$0 for now'], ['300', 'Under $300/mo'], ['1000', '$300 to $1,000/mo'], ['3000', '$1,000 to $3,000/mo'], ['more', 'Over $3,000/mo']];
  MG.REPEAT = [['once', 'Once'], ['sometimes', 'A few times a year'], ['often', 'Monthly or more']];
  MG.VOICES = [['warm', 'Warm & friendly'], ['premium', 'Premium & calm'], ['bold', 'Bold & funny'], ['expert', 'Expert & no-nonsense']];
  MG.HAS = [['site', 'A website'], ['gbp', 'A Google Business Profile'], ['social', 'Instagram / Facebook / TikTok'], ['email', 'An email list'],
    ['reviews', '10+ Google reviews'], ['photos', 'Good photos or videos']];
  MG.CHANNELS = [['maps', 'Google Maps & reviews'], ['site', 'Website'], ['seo', 'SEO'], ['gads', 'Google Ads'], ['social', 'Social ads'],
    ['content', 'Social posts'], ['email', 'Email & repeat'], ['other', 'Offline & other']];

  function label(list, id) { for (var i = 0; i < list.length; i++) if (list[i][0] === id) return list[i][1]; return ''; }
  MG.label = label;

  /* The 8 stages: the jobs an agency does, in the order they usually do them. */
  MG.STAGES = [
    { id: 'strategy', n: 1, title: 'Strategy', icon: 'bulb', role: 'Strategist / account lead',
      agency: 'Every agency starts with a kickoff: who the customer is, why they would pick you, what the competition does, and a plan with a budget split. Everything after this is written for those people.' },
    { id: 'maps', n: 2, title: 'Google Maps', icon: 'pin', role: 'Local SEO specialist',
      agency: 'For local businesses this is usually the cheapest win. Google says local ranking comes from relevance, distance and prominence: a complete profile, reviews and replies are the parts you control. Agencies sell this as "GBP management".' },
    { id: 'site', n: 3, title: 'Website', icon: 'globe', role: 'Web designer / conversion copywriter',
      agency: 'Ads and search only bring visitors. Agencies rewrite the page they land on so a stranger knows in seconds what you do, why you, and what to do next.' },
    { id: 'seo', n: 4, title: 'SEO', icon: 'search', role: 'SEO specialist / content writer',
      agency: 'SEO retainers are mostly three things: finding what people search for, making pages that answer it well, and earning mentions from other sites. It is slow, compounding work.' },
    { id: 'gads', n: 5, title: 'Google Ads', icon: 'target', role: 'PPC (pay-per-click) specialist',
      agency: 'Search ads catch people already looking. The weekly agency job is unglamorous: read what people actually typed, block the wasted searches, test new ad text, and watch cost per lead.' },
    { id: 'social', n: 6, title: 'Social ads', icon: 'megaphone', role: 'Paid social buyer / creative strategist',
      agency: 'Meta (Facebook, Instagram) and TikTok ads interrupt people who aren\'t searching, so the creative does most of the work. Agencies make many hooks and videos and let the numbers pick winners.' },
    { id: 'content', n: 7, title: 'Content & email', icon: 'chat', role: 'Social media manager / email marketer',
      agency: 'The "social media management" part of a retainer: a posting calendar, turning real jobs into posts, and emails that bring customers back. Cheap to run, and it feeds your ads.' },
    { id: 'measure', n: 8, title: 'Measure', icon: 'chart', role: 'Analyst / account manager',
      agency: 'The monthly report. Tracking calls, forms and sales so you know what works, the math of what a customer is worth, and, if you hire one, keeping the agency honest.' }
  ];

  /* ---------------------------------------------------------------- profile -> values used in prompts */
  function ph(s, hint) { s = String(s == null ? '' : s).trim(); return s || '[' + hint + ']'; }
  var GOAL_TEXT = { calls: 'get more calls and bookings', walkins: 'get more people through the door', sales: 'sell more online',
    leads: 'win more enquiries for bigger jobs', awareness: 'get known locally (we are new)', repeat: 'get customers to come back more often' };
  var BUDGET_TEXT = { '0': '$0 for ads right now (time only)', '300': 'under $300 a month', '1000': '$300 to $1,000 a month',
    '3000': '$1,000 to $3,000 a month', 'more': 'over $3,000 a month' };
  var VOICE_TEXT = { warm: 'warm, friendly, plain words', premium: 'polished, calm and premium, no hype', bold: 'bold, witty and punchy, never mean',
    expert: 'expert, clear and no-nonsense' };
  var REPEAT_TEXT = { once: 'once (a one-off purchase)', sometimes: 'a few times a year', often: 'every month or more' };

  MG.values = function (p) {
    p = p || {};
    var has = p.has || {};
    var reach = p.reach || 'visit';
    var where = String(p.where || '').trim();
    var whereLine = reach === 'visit' ? 'Customers come to us in ' + ph(where, 'neighbourhood, city') :
      reach === 'goto' ? 'We travel to customers around ' + ph(where, 'the areas you serve') :
      reach === 'both' ? 'A location in ' + ph(where, 'neighbourhood, city') + ', and we also sell online' :
      'Online' + (where ? ', mainly to customers in ' + where : ' (anywhere we ship or serve)');
    var price = Number(p.price) > 0 ? Number(p.price) : 0;
    var v = {
      p: p, has: has, reach: reach,
      local: reach !== 'online', online: reach === 'online' || reach === 'both' || p.type === 'ecom' || p.type === 'software',
      name: ph(p.name, 'business name'), what: ph(p.what, 'what you sell'), type: p.type || 'other',
      typeLabel: label(MG.TYPES, p.type) || 'small business', where: ph(where, reach === 'online' ? 'main countries or regions' : 'neighbourhood, city'),
      whereRaw: where, whereLine: whereLine, customer: ph(p.customer, 'who your best customers are'),
      price: price, priceText: price ? '$' + price.toLocaleString('en-US') : '[average sale in $]',
      repeatText: REPEAT_TEXT[p.repeat] || '[how often customers buy again]',
      edge: ph(p.edge, 'why people choose you over others'), competitors: ph(p.competitors, 'two or three competitors'),
      goal: p.goal || 'calls', goalText: GOAL_TEXT[p.goal] || GOAL_TEXT.calls,
      budget: p.budget || '0', budgetText: BUDGET_TEXT[p.budget] || BUDGET_TEXT['0'], paid: (p.budget || '0') !== '0',
      voiceText: VOICE_TEXT[p.voice] || VOICE_TEXT.warm, tried: String(p.tried || '').trim(), site: String(p.site_url || '').trim()
    };
    var text = (String(p.what || '') + ' ' + String(p.name || '')).toLowerCase();
    v.housing = p.type === 'realestate' || /\b(rent|rental|apartment|condo|housing|real estate|realtor|mortgage)/.test(text);
    v.finance = /\b(loan|credit|mortgage|insurance|financ|lending|debt)/.test(text);
    v.hiring = /\b(recruit|hiring|staffing|jobs board|employment agency)/.test(text);
    v.health = p.type === 'health' || /\b(clinic|therapy|therapist|dental|dentist|physio|chiro|medical|supplement|weight loss)/.test(text);
    v.brief = 'MY BUSINESS\n' +
      '- Name: ' + v.name + '\n' +
      '- What we sell: ' + v.what + '\n' +
      '- Kind of business: ' + v.typeLabel + '\n' +
      '- Where: ' + whereLine + '\n' +
      '- Best customers: ' + v.customer + '\n' +
      '- Typical sale: ' + (price ? 'about ' + v.priceText + '; customers buy ' + v.repeatText : '[average sale in $, and how often people buy again]') + '\n' +
      '- Why people pick us: ' + v.edge + '\n' +
      '- Competitors: ' + v.competitors + '\n' +
      '- Goal for the next 90 days: ' + v.goalText + '\n' +
      '- Ad budget: ' + v.budgetText + '\n' +
      '- Brand voice: ' + v.voiceText +
      (v.site ? '\n- Website: ' + v.site : '') +
      (v.tried ? '\n- Already tried: ' + v.tried : '');
    return v;
  };

  var ASK = 'If something important is missing or unclear, ask me up to 3 short questions before you start. ' +
    'Never invent facts about my business (reviews, awards, years, numbers): leave [brackets] where I must fill something in.';

  function P(o) { return o; }
  /* Each prompt: id, stage, rank (lower = do sooner), title, time, level (1 easy .. 3 involved), why, get (what you'll get),
     next (what to do with the answer), when(v) -> include it?, text(v) -> the prompt. */
  MG.PROMPTS = [
    // ------------------------------------------------------------------ 1. Strategy
    P({ id: 'brief', stage: 'strategy', rank: 1, title: 'Set up your AI with your business brief', time: '5 min', level: 1,
      why: 'Agencies keep a client brief everyone works from. Pasting yours once into a ChatGPT Project or Claude Project means every later answer already knows your business.',
      get: 'Your AI confirms what it knows and asks the questions that fill the gaps.',
      next: 'Answer its questions, then save the improved brief in your Project\'s instructions (or keep it in a note to paste).',
      text: function (v) {
        return 'You are going to be my marketing team for the next few weeks: strategist, copywriter, SEO and ads specialist.\n\n' + v.brief +
          '\n\nWHAT I NEED\n1. Summarise my business back to me in 4 sentences, the way a new agency would after a kickoff call.\n' +
          '2. Ask me the 7 most useful questions you still need answered to market it well (about customers, prices, seasonality, capacity, what has and hasn\'t worked).\n' +
          '3. After I answer, rewrite the brief above as an improved "client brief" I can reuse, under 250 words.\n\n' + ASK;
      } }),
    P({ id: 'customer', stage: 'strategy', rank: 2, title: 'Find the customer to win first', time: '15 min', level: 1,
      why: 'Every ad, page and post afterwards is written for someone. Agencies call this the customer profile (or "avatar"); without it, copy turns generic.',
      get: 'Three customer profiles with their exact words, worries and triggers, and a pick of who to target first.',
      next: 'Keep the winning profile. The ad and page prompts below work better when you paste it in.',
      text: function (v) {
        return 'Act as an agency strategist running the first workshop with a new client.\n\n' + v.brief +
          '\n\nWHAT I NEED\nBuild 3 distinct customer profiles for ' + v.name + '. For each one:\n' +
          '- who they are, in one line\n- the moment they start looking for something like us (the trigger)\n' +
          '- the exact words they would type into Google or say to a friend (5 examples)\n- what worries them before buying\n' +
          '- what would make them choose us over ' + v.competitors + '\n- where they spend time online and offline in ' + v.where + '\n\n' +
          'Then recommend which profile to target first, given my goal (' + v.goalText + ') and budget (' + v.budgetText + '), and explain why in 3 sentences.\n\n' + ASK;
      } }),
    P({ id: 'offer', stage: 'strategy', rank: 3, title: 'Sharpen your one-liner and your offer', time: '20 min', level: 2,
      why: 'Ads only amplify a message. Agencies spend real time finding the one sentence that makes a stranger pick you, and an offer that gives them a reason to act now.',
      get: '10 one-liners, 5 honest offers and a recommendation for each.',
      next: 'Pick one one-liner and one offer. Use them on your Google profile, website header and first ads.',
      text: function (v) {
        return 'Act as a positioning strategist and direct-response copywriter.\n\n' + v.brief +
          '\n\nWHAT I NEED\n1. Write 10 one-sentence answers to "why should I choose ' + v.name + '?" Each must be specific (who it is for, what they get, why us), under 20 words, in this voice: ' + v.voiceText + '.\n' +
          '2. Mark the 3 strongest and say why.\n' +
          '3. Suggest 5 offers that give a new customer a reason to act now (a first-visit offer, a bundle, a guarantee we can actually keep, a seasonal hook, a risk-free trial...). For each: the offer, who it attracts, and what it could cost us at ' + (v.price ? 'an average sale of ' + v.priceText : 'our prices') + '.\n\n' +
          'RULES\nNo claims we can\'t prove ("best in town", "#1") unless I give you evidence. No fake urgency or countdowns that aren\'t real.\n' + ASK;
      } }),
    P({ id: 'competitors', stage: 'strategy', rank: 8, title: 'Tear down your competitors', time: '45 min', level: 2,
      why: 'Agencies always look at what the competition says, charges and runs as ads. You can see the same things for free: anyone\'s Google reviews, and their live ads in the Meta Ad Library and Google\'s Ads Transparency Center.',
      get: 'A checklist to research each competitor, then a comparison table and three gaps you can own.',
      next: 'Use the gaps in your one-liner and your ads. Re-check every few months.',
      text: function (v) {
        return 'Act as an agency strategist doing a competitor teardown.\n\n' + v.brief +
          '\n\nSTEP 1: Give me a 15-minute checklist for researching each competitor (' + v.competitors + '):\n' +
          '- their Google Business Profile: rating, number of reviews, categories, photos, and what reviewers praise and complain about\n' +
          '- their website: main promise, prices or price hints, offer, how easy it is to book or buy\n' +
          '- their running ads: facebook.com/ads/library (Meta Ad Library) and adstransparency.google.com (Google Ads Transparency Center)\n' +
          '- their social accounts: what posts get the most comments\n\n' +
          'STEP 2: Wait for me to paste my notes. Then turn them into a comparison table (us vs each competitor), and find 3 gaps we can credibly own: things customers want that competitors do badly or don\'t say.\n\n' + ASK;
      } }),
    P({ id: 'plan90', stage: 'strategy', rank: 9, title: 'Make a 90-day plan with a budget split', time: '20 min', level: 2,
      why: 'This is the document an agency sends after the kickoff: what happens each week, where the money goes, and what "good" looks like at day 30, 60 and 90.',
      get: 'A week-by-week plan sized to your budget and the hours you actually have.',
      next: 'Put the first 4 weeks in your calendar. Come back to this playbook for the prompt behind each task.',
      text: function (v) {
        return 'Act as the account lead at a small-business marketing agency.\n\n' + v.brief +
          '\n\nWHAT I NEED\nA realistic 90-day marketing plan for a team with about [hours per week] hours a week.\n' +
          '1. Split the ad budget (' + v.budgetText + ') across channels with a reason for each; it is fine to put everything in one or two channels, or none.\n' +
          '2. A week-by-week task list for weeks 1-4, then month-level tasks for months 2 and 3.\n' +
          '3. The 3-5 numbers to watch (for example calls, bookings, cost per lead, reviews) and what a reasonable result looks like at day 30, 60 and 90 for a business like mine. Give ranges and say they are estimates.\n' +
          '4. What to stop doing if it isn\'t working, and when to decide.\n\n' +
          'RULES\nBe conservative: no guaranteed results. Prefer free or cheap steps first (Google Business Profile, reviews, website fixes) before paid ads.\n' + ASK;
      } }),

    // ------------------------------------------------------------------ 2. Google Maps
    P({ id: 'gbp', stage: 'maps', rank: 4, title: 'Give your Google Business Profile a makeover', time: '40 min', level: 1,
      when: function (v) { return v.local; },
      why: 'Google says businesses with complete and accurate info are more likely to show in local results, and that there\'s no way to pay for a better local ranking. Agencies start here because it\'s free.',
      get: 'Categories, a description under 750 characters, a services list, attributes, and a 20-photo shot list.',
      next: 'Update your profile at business.google.com. Make sure it\'s verified, with hours (and holiday hours) right.',
      text: function (v) {
        return 'Act as a local SEO specialist optimising a Google Business Profile.\n\n' + v.brief +
          '\n\nGoogle says local results are based mainly on relevance, distance and prominence, and that complete, accurate profiles are more likely to show up.\n\nWHAT I NEED\n' +
          '1. The best primary category for ' + v.name + ' and up to 9 additional categories. Only categories that truly describe what we do; explain each in one line.\n' +
          '2. A business description under 750 characters: natural language, what we do, for whom, in ' + v.where + ', what makes us different. No URLs, no prices, no keyword stuffing.\n' +
          '3. A list of our services or products, each with a 1-2 sentence description.\n' +
          '4. Attributes I should switch on if they are true for us (accessibility, payments, amenities...).\n' +
          '5. A shot list of 20 photos and 3 short videos that show the real place, team, work and happy customers.\n\n' +
          'RULES\nThe business name must stay exactly our real-world name: adding keywords or cities to the name breaks Google\'s guidelines and can get the profile suspended.\n' + ASK;
      } }),
    P({ id: 'reviews', stage: 'maps', rank: 5, title: 'Build an honest review engine', time: '25 min', level: 1,
      when: function (v) { return v.local || v.online; },
      why: 'Google lists review count and rating under "prominence": more reviews and positive ratings can help local ranking. Asking every customer, every time, is the single habit agencies push hardest.',
      get: 'When to ask, a text message, an email, a card or QR line, and a script for staff, all within Google\'s and the FTC\'s rules.',
      next: 'Get your review link from your Google Business Profile ("Ask for reviews") and start asking every customer this week.',
      text: function (v) {
        return 'Act as a customer-experience consultant for a ' + v.typeLabel.toLowerCase() + '.\n\n' + v.brief +
          '\n\nWHAT I NEED\nA simple system for asking every customer for a Google review:\n' +
          '1. The best moment to ask for a business like mine (when people are happiest).\n2. A short text message (under 300 characters) with a [review link] placeholder.\n' +
          '3. A follow-up email.\n4. One line for a printed card or QR sign at the counter or on invoices.\n5. What staff can say in person, in 2 sentences.\n6. How to track how many we asked vs how many reviewed.\n\n' +
          'RULES (these are real rules; don\'t break them)\n' +
          '- Ask ALL customers, not only the happy ones. Google bans "selectively soliciting positive reviews" (review gating).\n' +
          '- No discounts, gifts, contests or payment in exchange for a review, or for changing a bad one.\n' +
          '- Don\'t ask for specific words, keywords or star ratings.\n' +
          '- Never write reviews ourselves, or have staff, family or a paid service write them. In the US the FTC\'s 2024 rule makes fake reviews illegal, with civil penalties.\n' + ASK;
      } }),
    P({ id: 'replies', stage: 'maps', rank: 12, title: 'Reply to your reviews', time: '10 min / week', level: 1,
      when: function (v) { return v.local; },
      why: 'Google\'s own tips include responding to reviews. Readers judge you by how you handle the bad ones, and agencies bill this as part of "reputation management".',
      get: 'Ready-to-post replies in your voice, different every time.',
      next: 'Post them from your Business Profile. Make it a weekly 10-minute habit.',
      text: function (v) {
        return 'Act as the owner of ' + v.name + ' replying to Google reviews.\n\n' + v.brief +
          '\n\nI will paste reviews below. Write a reply for each.\n' +
          '- Positive: thank them by first name, mention one specific detail they wrote, invite them back. Under 60 words. Vary the wording; never copy-paste the same reply.\n' +
          '- Negative or mixed: stay calm, thank them, acknowledge the problem without excuses, and offer to make it right offline with [contact]. Under 80 words.\n' +
          '- Never reveal private details about the customer (health, what they bought, when) and never argue.\n' +
          '- Never offer anything in exchange for changing or removing a review.\nVoice: ' + v.voiceText + '.\n\nREVIEWS:\n[paste reviews here]';
      } }),
    P({ id: 'posts', stage: 'maps', rank: 14, title: 'Write two months of Google posts', time: '20 min', level: 1,
      when: function (v) { return v.local; },
      why: 'Google doesn\'t say posts boost ranking, but practitioners keep them weekly because they show searchers you\'re open and active, with fresh photos and offers right on your listing.',
      get: '8 ready posts (updates, offers, events), each with a button and a photo idea.',
      next: 'Schedule one a week. Reuse the photos on Instagram.',
      text: function (v) {
        return 'Act as a local marketing copywriter.\n\n' + v.brief +
          '\n\nWrite 8 Google Business Profile posts, one per week for two months: a mix of updates, offers and events relevant to ' + v.where + ' and the season.\n' +
          'For each post: the type (update, offer or event), the text (80-200 words; Google allows up to 1,500 characters), a suggested button (Book, Order online, Buy, Learn more, Sign up or Call now) and a photo idea from our real business.\n' +
          'Voice: ' + v.voiceText + '. Lead with the customer benefit; no clickbait.\n' + ASK;
      } }),
    P({ id: 'citations', stage: 'maps', rank: 16, title: 'Make your listings match everywhere', time: '30 min', level: 2,
      when: function (v) { return v.local; },
      why: 'Directories, maps apps and review sites that show different names, addresses or phone numbers confuse customers and search engines. Agencies call this "citation cleanup" and charge for it.',
      get: 'The exact name, address, phone and hours format to use, and a checklist of the listings that matter for your type of business.',
      next: 'Work through the list a few at a time. Start with Apple Business Connect, Bing Places and the biggest review site in your field.',
      text: function (v) {
        return 'Act as a local SEO specialist doing a citation audit.\n\n' + v.brief +
          '\n\n1. Write the exact NAP+W block (Name, Address, Phone, Website) and hours format I should copy everywhere so every listing matches, character for character.\n' +
          '2. List the 20 most important places a ' + v.typeLabel.toLowerCase() + ' in ' + v.where + ' should be listed: general ones (Apple Business Connect, Bing Places, Facebook, Yelp...), plus the industry and local directories that matter for us. For each: why it matters and whether it is free.\n' +
          '3. A checklist for fixing a wrong or duplicate listing.\n\nMark anything you aren\'t sure exists in my area as "check".\n' + ASK;
      } }),

    // ------------------------------------------------------------------ 3. Website
    P({ id: 'homepage', stage: 'site', rank: 6, title: 'Run the 5-second test on your homepage', time: '25 min', level: 2,
      when: function (v) { return !!v.has.site; },
      why: 'Visitors from ads and search decide in seconds. Conversion copywriters check: can a stranger tell what you do, for whom, where, and what to do next?',
      get: 'A rewritten top section, the missing pieces, and the best order for the page.',
      next: 'Update the top of your homepage first; it matters most. Then add what\'s missing, one section a week.',
      text: function (v) {
        return 'Act as a conversion copywriter reviewing a small-business homepage.\n\n' + v.brief +
          '\n\nHere is the text of my homepage' + (v.site ? ' (' + v.site + ')' : '') + ':\n[paste the text of your homepage, top to bottom]\n\n' +
          'WHAT I NEED\n1. Judge it like a stranger arriving from an ad on a phone: in 5 seconds, can they tell what we do, for whom, where, and what to do next? Score each out of 5.\n' +
          '2. Rewrite the top section: a headline under 10 words, a one-sentence subhead, and one main button (plus a tap-to-call link if calls matter).\n' +
          '3. List what\'s missing that builds trust (real reviews, photos of real work, prices or price ranges, FAQ, hours, guarantees we really offer...).\n' +
          '4. Give the best order for the sections on the page.\nVoice: ' + v.voiceText + '.\n' + ASK;
      } }),
    P({ id: 'onepage', stage: 'site', rank: 6, title: 'Plan a one-page website', time: '40 min', level: 2,
      when: function (v) { return !v.has.site; },
      why: 'You don\'t need a big site to start. A single page with the right sections gives your Google profile and ads somewhere to send people.',
      get: 'Every section of the page, written, plus the photos to take.',
      next: 'Build it with any simple website builder (or a store builder if you sell online) and link it from your Google profile.',
      text: function (v) {
        return 'Act as a web designer and conversion copywriter for small businesses.\n\n' + v.brief +
          '\n\nI don\'t have a website yet. Plan and write a one-page site:\n' +
          '1. The sections in order (for example: header with one-liner and main button, services, how it works, real reviews, photos, prices or price ranges, FAQ, location and hours, contact).\n' +
          '2. Write the text for every section in this voice: ' + v.voiceText + '.\n3. The photos I need to take for each section.\n' +
          '4. The one action every visitor should take (' + (v.goal === 'sales' ? 'buy' : v.goal === 'walkins' ? 'visit / get directions' : 'call or book') + ') and where the buttons go.\n' +
          '5. A short list of things the page needs to work well on phones.\n' + ASK;
      } }),
    P({ id: 'landing', stage: 'site', rank: 18, title: 'Write a landing page for your ads', time: '30 min', level: 2,
      when: function (v) { return v.paid; },
      why: 'Agencies rarely send ad clicks to a busy homepage. A landing page repeats the ad\'s promise, proves it, answers objections and has one button.',
      get: 'A complete page: headline matching your ad, offer, proof, FAQ and one call to action.',
      next: 'Publish it at a simple address (like /offer) and use it as the destination for your first ads.',
      text: function (v) {
        return 'Act as a landing page copywriter for paid ads.\n\n' + v.brief +
          '\n\nThe ad I will run says: [paste or describe your ad, or say "suggest one"].\n\nWrite a landing page:\n' +
          '1. A headline that repeats the ad\'s promise, and a subhead.\n2. The offer, clearly, with any real conditions.\n' +
          '3. 3-5 proof points (only real ones; leave [brackets] for reviews, numbers or photos I must add).\n' +
          '4. An FAQ answering the 6 biggest objections a ' + v.customer + ' would have.\n' +
          '5. One call to action repeated 3 times, and the fewest form fields we can get away with.\nVoice: ' + v.voiceText + '.\n' + ASK;
      } }),
    P({ id: 'faq', stage: 'site', rank: 20, title: 'Write the FAQ that sells for you', time: '25 min', level: 1,
      why: 'The questions people ask before buying are the same ones they type into Google and ask AI assistants. Clear, honest answers remove the last reasons not to buy.',
      get: '15 real pre-purchase questions with answers in your voice.',
      next: 'Put them on your website (an FAQ section or page). Reuse the best as social posts.',
      text: function (v) {
        return 'Act as a customer service lead and copywriter.\n\n' + v.brief +
          '\n\nList the 15 questions a ' + v.customer + ' really asks before buying ' + v.what + ' (price, timing, process, what if something goes wrong, how we compare...). ' +
          'Answer each in 2-4 sentences, honestly, in this voice: ' + v.voiceText + '. Where the answer depends on facts only I know (prices, policies, times), leave [brackets].\n' +
          'Then group them under 3-4 headings for a web page.\n' + ASK;
      } }),
    P({ id: 'product', stage: 'site', rank: 7, title: 'Rewrite your best product page', time: '30 min', level: 2,
      when: function (v) { return v.type === 'ecom' || (v.online && v.type === 'retail'); },
      why: 'For online stores the product page is the shop counter. Agencies rewrite the bestsellers first: title, benefits, details, and the shipping and returns answers that stop people buying.',
      get: 'A new title, benefit bullets, description, specs and a reassurance block, plus the photos to add.',
      next: 'Apply it to your top 3 products, then compare sales over the next month.',
      text: function (v) {
        return 'Act as an e-commerce copywriter.\n\n' + v.brief +
          '\n\nHere is one of my product pages: [paste the product title, description and details].\n\nRewrite it:\n' +
          '1. A clear product title (what it is, key attribute, size or variant).\n2. 5 benefit bullets (benefit first, then the feature that proves it).\n' +
          '3. A short description that sounds like ' + v.voiceText + '.\n4. A specs/details list.\n5. A reassurance block: shipping times, returns, guarantees ([brackets] for my real policies).\n' +
          '6. The 6 photos or short videos the page needs.\nNo health or performance claims we can\'t support.\n' + ASK;
      } }),

    // ------------------------------------------------------------------ 4. SEO
    P({ id: 'keywords', stage: 'seo', rank: 10, title: 'Map what people search for', time: '30 min', level: 2,
      why: 'SEO starts with the words customers actually use. Agencies use paid tools; you can get far with a brainstorm, then check real numbers in free Google tools.',
      get: 'Searches grouped by intent (ready to buy, comparing, learning), each matched to a page on your site.',
      next: 'Check the guesses in Google Search Console and Keyword Planner (free with a Google Ads account), then fix or create the matching pages.',
      text: function (v) {
        return 'Act as an SEO specialist. You don\'t have access to keyword tools, so mark every estimate clearly as a guess.\n\n' + v.brief +
          '\n\nWHAT I NEED\n1. 40 searches people make on the way to buying ' + v.what + ', grouped into:\n' +
          '   - ready to buy (for example "' + (v.local ? v.what.split(',')[0] + ' ' + v.where.split(',')[0] : 'buy ' + v.what.split(',')[0]) + '"' + (v.local ? ', "... near me"' : '') + ')\n' +
          '   - comparing (prices, "best", "vs", reviews)\n   - learning (questions and problems)\n' +
          '2. For each group, which page on our website should answer it (existing or new).\n' +
          '3. The 5 pages to create or improve first, and why.\n' +
          '4. How to check real search data for free: Google Search Console, Google Keyword Planner, and Google\'s own autocomplete and "People also ask".\n' + ASK;
      } }),
    P({ id: 'titles', stage: 'seo', rank: 17, title: 'Fix your page titles and descriptions', time: '20 min', level: 1,
      when: function (v) { return !!v.has.site; },
      why: 'The title and description are what people see in search results. It\'s quick, cheap work that agencies do in week one of an SEO contract.',
      get: 'A unique title (about 50-60 characters) and description (about 150-160) for each main page.',
      next: 'Paste them into your website builder\'s SEO settings for each page.',
      text: function (v) {
        return 'Act as an SEO specialist.\n\n' + v.brief +
          '\n\nMy main pages are: [list each page and what it is about, or paste the current titles].\n\n' +
          'For each page, write:\n- a title tag of about 50-60 characters: the main thing the page is about first, then ' + (v.local ? 'the area and ' : '') + 'our name\n' +
          '- a meta description of about 150-160 characters that makes someone want to click, written for people, not robots\n' +
          'Every title and description must be different. Show the character count for each.\n' + ASK;
      } }),
    P({ id: 'article', stage: 'seo', rank: 22, title: 'Write one genuinely helpful article', time: '60 min', level: 3,
      why: 'Google\'s guidance is to make "helpful, reliable, people-first content" and it warns that lots of AI text published without oversight is low effort. One great article with your real experience beats ten generic ones.',
      get: 'An outline and draft built around your first-hand experience, with gaps marked for you to fill.',
      next: 'Add your own photos, examples and opinions where marked, then publish it and link it from related pages.',
      text: function (v) {
        return 'Act as an editor helping a business owner write from real experience.\n\n' + v.brief +
          '\n\nThe question customers ask most is: [pick one from your FAQ, or say "suggest five"].\n\n' +
          '1. Write an outline answering it fully, for a ' + v.customer + '.\n' +
          '2. Draft the article (800-1,200 words) in this voice: ' + v.voiceText + '.\n' +
          '3. Mark at least 5 places with [MY EXPERIENCE: ...] where I must add a real example, number, photo or opinion only I can give. Google looks for first-hand experience and trust.\n' +
          '4. Suggest a title, and which of our pages to link to and from.\n' +
          'Don\'t stuff keywords. Don\'t invent statistics or studies; if a fact needs a source, say so.\n' + ASK;
      } }),
    P({ id: 'areas', stage: 'seo', rank: 24, title: 'Create area pages that aren\'t spam', time: '45 min', level: 3,
      when: function (v) { return v.reach === 'goto'; },
      why: 'Service-area businesses often want a page per town. Google\'s spam policies call near-identical city pages "doorway" pages, so each one has to be genuinely useful and different.',
      get: 'A plan for which areas deserve a page and a draft with real local substance.',
      next: 'Only publish pages you can fill with real local jobs, photos and details.',
      text: function (v) {
        return 'Act as a local SEO specialist.\n\n' + v.brief +
          '\n\nThe areas we serve: [list towns or neighbourhoods, and roughly how many jobs we do in each].\n\n' +
          '1. Tell me which areas deserve their own page and which should be covered on one "areas we serve" page, and why.\n' +
          '2. For one area, draft a page with genuinely local substance: jobs we\'ve done there ([brackets] for my details), local specifics (housing types, travel time, local rules or seasons), reviews from customers there, and a clear call to action.\n' +
          'Each page must be meaningfully different. No pages that only swap the town name: Google treats those as doorway spam.\n' + ASK;
      } }),
    P({ id: 'links', stage: 'seo', rank: 26, title: 'Earn links and mentions locally', time: '30 min', level: 2,
      why: 'Google names links from other websites as one of the things that make a business "prominent". Agencies call this link building; for small businesses the best links come from real relationships.',
      get: '20 specific link and mention ideas, plus outreach emails.',
      next: 'Pick the 3 easiest and send the emails this week.',
      text: function (v) {
        return 'Act as a digital PR and link-building specialist for a small business.\n\n' + v.brief +
          '\n\n1. List 20 realistic ways for ' + v.name + ' to earn links or mentions from other websites' + (v.local ? ' in and around ' + v.where : '') + ': suppliers and partners, local associations, sponsorships, events, local news angles, guides and lists, podcasts, community projects.\n' +
          '2. For the 5 best, write a short, friendly outreach email.\n' +
          '3. One local news story angle that is actually newsworthy, with a pitch.\n\n' +
          'RULE: never buy links or swap links in bulk; Google\'s spam policies forbid link schemes.\n' + ASK;
      } }),

    // ------------------------------------------------------------------ 5. Google Ads
    P({ id: 'gplan', stage: 'gads', rank: 13, title: 'Plan a small Google Search campaign', time: '45 min', level: 3,
      when: function (v) { return v.paid; },
      why: 'Search ads reach people already looking. Small budgets get wasted when they\'re spread thin, so PPC specialists start narrow: one campaign, a few tight groups of keywords, the right area.',
      get: 'The campaign structure, keywords, location and schedule settings, and a daily budget.',
      next: 'Before launching, set up conversion tracking (see the Measure stage) so you can tell which clicks became customers.',
      text: function (v) {
        return 'Act as a Google Ads (PPC) specialist setting up a first campaign for a small business.\n\n' + v.brief +
          '\n\nWHAT I NEED\n1. One Search campaign with 2-4 ad groups, each built around one service or product.\n' +
          '2. For each ad group: 10-15 keywords in phrase and exact match, and why.\n' +
          '3. Location settings for ' + v.where + ' (explain the "Presence" option: people in or regularly in the area, vs people interested in it).\n' +
          '4. Should the Search Partners and Display Network be on for a small first campaign? Explain the trade-off.\n' +
          '5. Ad schedule, if our hours matter (for example, only when someone can answer the phone).\n' +
          '6. A daily budget from my monthly budget (' + v.budgetText + '). Google can spend up to 30.4 times the daily budget in a month, so divide by 30.4.\n' +
          '7. Which bidding to start with in a new account with little conversion data, and when to switch.\n' + ASK;
      } }),
    P({ id: 'rsa', stage: 'gads', rank: 15, title: 'Write your search ads', time: '20 min', level: 2,
      when: function (v) { return v.paid; },
      why: 'Google\'s responsive search ads take up to 15 headlines (30 characters each) and 4 descriptions (90 characters each), then mix them. Agencies write many varied pieces so Google has good combinations to test.',
      get: '15 headlines and 4 descriptions with character counts, ready to paste.',
      next: 'Paste them into one ad per ad group. Check results after 2-3 weeks and replace the weakest headlines.',
      text: function (v) {
        return 'Act as a PPC copywriter writing a Google responsive search ad.\n\n' + v.brief +
          '\n\nAd group / service: [which service this ad is for]\n\n' +
          'Write:\n- 15 headlines, each 30 characters or fewer (count spaces). Mix: the service' + (v.local ? ' + area' : '') + ', our offer, proof (only real proof; use [brackets]), a reason to choose us, and a call to action.\n' +
          '- 4 descriptions, each 90 characters or fewer.\n' +
          'Show the character count after each line. Make them different from each other so they combine well. Voice: ' + v.voiceText + '.\n' +
          'Suggest which 1-2 headlines (if any) to pin to position 1, and explain that pinning limits Google\'s testing.\n' +
          'No claims like "best" or "#1" without proof; no ALL CAPS words and no exclamation marks in headlines (Google\'s editorial rules reject them).\n' + ASK;
      } }),
    P({ id: 'negatives', stage: 'gads', rank: 19, title: 'Block wasted clicks with negative keywords', time: '15 min', level: 1,
      when: function (v) { return v.paid; },
      why: 'Ads show for searches you never meant to pay for ("jobs", "free", "how to do it yourself"). A starter list of negative keywords is one of the first things a good PPC specialist adds.',
      get: 'A starter list of negative keywords grouped by reason.',
      next: 'Add them as a negative keyword list in Google Ads and apply it to your campaign.',
      text: function (v) {
        return 'Act as a PPC specialist.\n\n' + v.brief +
          '\n\nWrite a starter list of 50 negative keywords for my Google Ads, grouped by reason: job seekers (jobs, careers, salary, hiring), do-it-yourself, free and cheap (only if we aren\'t the cheap option), training and courses, wrong product or meaning, ' +
          (v.local ? 'places we don\'t serve, ' : '') + 'and anything else common for a ' + v.typeLabel.toLowerCase() + '.\n' +
          'Give each in the format to paste into Google Ads, and suggest broad vs phrase vs exact match for each group. Flag any that might block good customers.\n' + ASK;
      } }),
    P({ id: 'searchterms', stage: 'gads', rank: 27, title: 'Do the weekly search terms review', time: '15 min / week', level: 2,
      when: function (v) { return v.paid; },
      why: 'The Search terms report shows what people actually typed before clicking your ad. Reading it weekly and pruning is the core of what Google Ads managers do for their fee.',
      get: 'Each search sorted into keep, add as keyword, or block, plus wasted spend flagged.',
      next: 'Apply the changes in Google Ads. Repeat every week for the first two months.',
      text: function (v) {
        return 'Act as a Google Ads specialist doing the weekly search terms review.\n\n' + v.brief +
          '\n\nHere is my Search terms report from Google Ads (search term, clicks, cost, conversions):\n[paste the report rows]\n\n' +
          'Sort every term into: KEEP (relevant), ADD AS KEYWORD (relevant and converting; suggest the match type), or ADD AS NEGATIVE (irrelevant; suggest the negative keyword). ' +
          'Then total the money spent on irrelevant searches, list the 3 changes that save the most, and point out any trend (new services people want, places, questions).\n' + ASK;
      } }),
    P({ id: 'feed', stage: 'gads', rank: 21, title: 'Tune your product feed for Shopping ads', time: '40 min', level: 3,
      when: function (v) { return v.paid && (v.type === 'ecom' || v.type === 'retail'); },
      why: 'Shopping and Performance Max ads for stores are built from your product feed in Google Merchant Center. Feed specialists mostly rewrite titles and fill in attributes so products match more searches.',
      get: 'Better product titles and descriptions for your feed, and a checklist of attributes.',
      next: 'Update your top 20 products in Merchant Center (or your store\'s Google channel app) first.',
      text: function (v) {
        return 'Act as a Google Merchant Center feed specialist.\n\n' + v.brief +
          '\n\nHere are some of my products (current title, description, price, brand, size, colour, material...):\n[paste 5-20 products]\n\n' +
          '1. Rewrite each title for search: brand + product type + key attributes (size, colour, material, model), most important words first.\n' +
          '2. Improve each description: factual, specific, no promotional text like "free shipping" or "sale" (those go in other fields).\n' +
          '3. List the attributes I should fill in for my category (GTIN, brand, condition, size, colour, age group, product type...).\n' + ASK;
      } }),
    P({ id: 'lsa', stage: 'gads', rank: 23, title: 'Check if Local Services Ads fit you', time: '15 min', level: 1,
      when: function (v) { return v.paid && (v.type === 'trades' || v.type === 'pro' || v.type === 'realestate' || v.type === 'health'); },
      why: 'For many trades and professional services, Google offers Local Services Ads: you pay per lead instead of per click, after background, licence and insurance checks. Availability depends on your category and country.',
      get: 'A plain explanation, an eligibility checklist and the documents to prepare.',
      next: 'Check eligibility on Google\'s Local Services Ads site for your category and area before preparing anything.',
      text: function (v) {
        return 'Act as a PPC specialist who manages Google Local Services Ads.\n\n' + v.brief +
          '\n\n1. Explain Local Services Ads in plain words: how they differ from regular search ads, paying per lead, disputing bad leads, and the badges (Google Guaranteed / Google Screened).\n' +
          '2. Tell me whether a ' + v.typeLabel.toLowerCase() + ' like mine is likely to be eligible in ' + v.where + ', and say clearly that I must confirm on Google\'s Local Services Ads site because categories differ by country.\n' +
          '3. List the verification steps and documents I would likely need (licences, insurance, background checks).\n' +
          '4. How to compare cost per lead against my regular Google Ads.\n' + ASK;
      } }),

    // ------------------------------------------------------------------ 6. Social ads
    P({ id: 'angles', stage: 'social', rank: 11, title: 'Find 10 ad angles and hooks', time: '25 min', level: 2,
      when: function (v) { return v.paid || v.goal === 'awareness'; },
      why: 'On Meta and TikTok people aren\'t searching, so the first seconds decide everything. Creative strategists test many angles, not many audiences.',
      get: '10 angles, each with a hook, primary text, headline and visual idea.',
      next: 'Pick 3-4 different angles to test first. Film or design them simply; real beats polished.',
      text: function (v) {
        var rules = ['Don\'t write copy that asserts or implies you know the viewer\'s personal traits ("Are you struggling with...?", "Other people your age..."); Meta rejects it.',
          'No before/after or guaranteed-results claims we can\'t back up.'];
        if (v.housing || v.finance || v.hiring) rules.push('This business likely falls under a Meta Special Ad Category (housing, employment, or financial products and services): targeting by age, gender or small areas is restricted. Write ads that work for a broad audience.');
        if (v.health) rules.push('Health-related ads have extra rules on Meta and Google: no claims of cures or guaranteed outcomes, and don\'t imply the viewer has a condition.');
        return 'Act as a paid social creative strategist for Facebook, Instagram and TikTok.\n\n' + v.brief +
          '\n\nGive me 10 different ad angles: the problem, the outcome, social proof, behind the scenes, the offer, busting an objection, founder story, comparison, seasonal, and customer-made (UGC) style.\n' +
          'For each angle:\n- a hook for the first 3 seconds of a video (spoken and on-screen text)\n- primary text, with the key point in the first 125 characters (the rest gets cut behind "See more")\n' +
          '- a headline under 40 characters\n- the visual: what to film or show, using our real business\n\nRULES\n- ' + rules.join('\n- ') + '\n' + ASK;
      } }),
    P({ id: 'ugc', stage: 'social', rank: 25, title: 'Script short phone videos', time: '30 min', level: 2,
      why: 'Short vertical videos filmed on a phone by you, your team or customers often look more native in feeds than studio ads. Agencies pay creators for these; you can shoot them yourself.',
      get: '5 scripts of 15-30 seconds with shot lists and captions.',
      next: 'Film two this week in good daylight. Add captions; many people watch without sound.',
      text: function (v) {
        return 'Act as a short-form video creative director.\n\n' + v.brief +
          '\n\nWrite 5 vertical video scripts (15-30 seconds) that I, my team or a happy customer can film on a phone at ' + v.name + '. For each:\n' +
          '- the hook (first 2 seconds)\n- a shot-by-shot list with what is said and shown\n- on-screen text\n- the ending call to action\n- a caption for Instagram/TikTok\n' +
          'Use only real things from our business; leave [brackets] for details. Voice: ' + v.voiceText + '.\n' +
          'If a customer appears, remind me to get their permission, and to disclose it if they got anything for taking part.\n' + ASK;
      } }),
    P({ id: 'metatest', stage: 'social', rank: 28, title: 'Plan a 4-week Meta ads test', time: '30 min', level: 3,
      when: function (v) { return v.paid; },
      why: 'Meta\'s delivery system needs data: it says an ad set usually leaves the "learning phase" after about 50 results within 7 days. With a small budget, choosing the right goal and keeping the setup simple matters more than clever targeting.',
      get: 'A test plan sized to your budget: objective, the event to optimise for, audience, creative mix and when to judge.',
      next: 'Install the Meta Pixel (and ideally the Conversions API) before spending, so Meta can see results.',
      text: function (v) {
        return 'Act as a Meta Ads (Facebook and Instagram) media buyer.\n\n' + v.brief +
          '\n\nPlan a 4-week test with my budget (' + v.budgetText + '):\n' +
          '1. Which campaign objective fits my goal (' + v.goalText + ').\n' +
          '2. Meta says an ad set usually exits the learning phase after about 50 optimisation events in 7 days. Do the math for my budget: which event can we realistically get often enough (purchase, lead, add to cart, landing page view...)? If none, what to optimise for instead.\n' +
          '3. The audience: ' + (v.local ? 'location radius around ' + v.where + ', ' : '') + 'broad vs interests, and why fewer, bigger ad sets usually suit small budgets.\n' +
          '4. How many ads and which angles to start with, and which edits reset learning (so I avoid making them daily).\n' +
          '5. What to look at after week 1, 2 and 4, and when to stop or scale.\n' +
          (v.housing || v.finance || v.hiring ? '6. Explain the Special Ad Category that likely applies to my business and how it limits targeting.\n' : '') + ASK;
      } }),

    // ------------------------------------------------------------------ 7. Content & email
    P({ id: 'calendar', stage: 'content', rank: 29, title: 'Make a 30-day posting calendar', time: '30 min', level: 1,
      why: 'Social media managers plan a month at a time so posting doesn\'t depend on inspiration. Consistency matters more than volume.',
      get: '12-16 posts across 30 days with formats, captions and what to film or photograph.',
      next: 'Batch-shoot the photos and videos in one afternoon. Schedule the posts with the free tools in Meta Business Suite or TikTok.',
      text: function (v) {
        return 'Act as a social media manager for a small ' + v.typeLabel.toLowerCase() + '.\n\n' + v.brief +
          '\n\nPlan 30 days of posts for Instagram' + (v.type === 'pro' || v.type === 'software' ? ' and LinkedIn' : ', Facebook and TikTok') + ': 3-4 posts a week.\n' +
          'Mix: behind the scenes, customer stories (with permission), tips that show expertise, offers (no more than 1 in 5 posts), and local or seasonal moments' + (v.local ? ' in ' + v.where : '') + '.\n' +
          'For each post: the day, the format (reel, carousel, photo, story), the hook, the caption (in this voice: ' + v.voiceText + '), what to shoot, and a call to action.\nPresent it as a table.\n' + ASK;
      } }),
    P({ id: 'repurpose', stage: 'content', rank: 30, title: 'Turn one job into five posts', time: '15 min', level: 1,
      why: 'Agencies squeeze each piece of real work into many formats. One finished job, happy customer or new product can fill a week of content.',
      get: 'A carousel, a reel script, a Google post, an email paragraph and a short story post from one thing you did.',
      next: 'Do this every time something good happens at work. Keep a folder of photos for it.',
      text: function (v) {
        return 'Act as a content marketer.\n\n' + v.brief +
          '\n\nHere is something that happened recently at ' + v.name + ': [describe a job, customer, product, event or problem you solved].\n\n' +
          'Turn it into:\n1. An Instagram carousel (slide-by-slide text, 6-8 slides)\n2. A 20-second reel script\n' + (v.local ? '3. A Google Business Profile post\n' : '3. A LinkedIn or Facebook post\n') +
          '4. A paragraph for our next email\n5. A short story post for Facebook\nVoice: ' + v.voiceText + '. Don\'t add details I didn\'t give; use [brackets].\n';
      } }),
    P({ id: 'welcome', stage: 'content', rank: 31, title: 'Write a welcome email series', time: '30 min', level: 2,
      when: function (v) { return v.has.email || v.type === 'ecom' || v.goal === 'repeat' || v.p.repeat === 'often'; },
      why: 'Email reaches people who already said yes to you, without paying for each view. A short automated welcome series is one of the first things agencies set up for stores and repeat-purchase businesses.',
      get: '3-5 emails with subject lines, timing and what each one should achieve.',
      next: 'Load them into your email tool as an automation. Only send to people who opted in.',
      text: function (v) {
        return 'Act as an email marketer for small businesses.\n\n' + v.brief +
          '\n\nWrite a welcome series of 4 emails for new subscribers or first-time customers:\n' +
          '1. Welcome + what to expect (send right away)\n2. Our story and what makes us different (day 2)\n3. Most-loved product/service + proof (day 4)\n4. A gentle offer or next step (day 7)\n' +
          'For each: 3 subject line options, preview text, the email (under 150 words), and one button.\nVoice: ' + v.voiceText + '.\n\n' +
          'RULES: only for people who agreed to get our emails (in Canada, CASL requires consent; in the US, CAN-SPAM requires a working unsubscribe link and our postal address in every email).\n' + ASK;
      } }),
    P({ id: 'winback', stage: 'content', rank: 32, title: 'Bring customers back and get referrals', time: '25 min', level: 2,
      when: function (v) { return v.p.repeat !== 'once' || v.goal === 'repeat' || v.goal === 'awareness'; },
      why: 'Winning a customer back usually costs less than finding a new one. Agencies call this retention: reminders, win-back offers and a simple referral programme.',
      get: 'A reminder schedule, a win-back message and a referral programme with the wording.',
      next: 'Start with the reminder. Track how many people come back from it.',
      text: function (v) {
        return 'Act as a retention marketer.\n\n' + v.brief +
          '\n\n1. When should a typical customer come back (based on what we sell)? Design a reminder schedule and write the reminder (text and email versions).\n' +
          '2. Write a win-back message for customers we haven\'t seen in [time], with an offer that doesn\'t train people to wait for discounts.\n' +
          '3. Design a simple referral programme: the reward for both sides, how to track it, the wording on a card and in a text message.\n' +
          'Never tie any reward to leaving a review. Only message people who agreed to hear from us.\n' + ASK;
      } }),
    P({ id: 'seasons', stage: 'content', rank: 33, title: 'Plan your marketing year', time: '20 min', level: 1,
      why: 'Demand for most businesses rises and falls with seasons, holidays and local events. Agencies plan campaigns months ahead so offers and ads are ready before the rush.',
      get: 'A 12-month calendar of moments, with a campaign idea and when to start preparing each.',
      next: 'Put the next 3 prep dates in your calendar.',
      text: function (v) {
        return 'Act as a marketing planner.\n\n' + v.brief +
          '\n\nBuild a 12-month marketing calendar for ' + v.name + (v.local ? ' in ' + v.where : '') + ', starting next month:\n' +
          '- busy and slow periods for a ' + v.typeLabel.toLowerCase() + ' (mark them as typical patterns to confirm with my own sales)\n' +
          '- holidays and shopping moments that matter for us\n' + (v.local ? '- local events and school calendar moments in ' + v.where + ' (mark any you are unsure of as "check")\n' : '') +
          '- one campaign idea for each month, and the date to start preparing it\nPresent it as a table.\n' + ASK;
      } }),

    // ------------------------------------------------------------------ 8. Measure
    P({ id: 'tracking', stage: 'measure', rank: 7, title: 'Set up tracking before you spend', time: '45 min', level: 3,
      why: 'Without tracking, nobody (you or an agency) can tell which marketing works. Agencies set up conversion tracking in week one; it is the basis of every report.',
      get: 'A checklist of exactly what to install for your business, which parts are free, and how to test each.',
      next: 'Do the free basics now: Google Analytics, Search Console, and a "How did you hear about us?" question.',
      text: function (v) {
        return 'Act as a marketing analyst explaining things in plain words to a non-technical owner.\n\n' + v.brief +
          '\n\nGive me a checklist of what to set up so we know which marketing brings customers. Only include what fits my business, mark each as free or paid, and say how to test it works:\n' +
          '- Google Analytics 4 and Google Search Console\n- the key actions to count as conversions for us (calls, form sends, bookings, purchases, direction requests)\n' +
          (v.paid ? '- conversion tracking in Google Ads, and the Meta Pixel plus Conversions API for Meta ads\n' : '') +
          '- UTM tags on links we share\n- tracking phone calls, if calls matter to us\n- a "How did you hear about us?" question at booking or checkout\n' +
          'Then a one-paragraph explanation of what I\'ll be able to see once it\'s all working.\n' + ASK;
      } }),
    P({ id: 'utm', stage: 'measure', rank: 34, title: 'Tag your links so you can see what works', time: '10 min', level: 1,
      why: 'UTM tags are labels on a link that tell Google Analytics where a visitor came from. Agencies tag every link they control: the Google profile website button, the Instagram bio, emails.',
      get: 'Ready-to-use tagged links for every place you share your website.',
      next: 'Replace your links with the tagged versions. Check Analytics (Acquisition, Traffic acquisition) after a few weeks.',
      text: function (v) {
        return 'Act as a marketing analyst.\n\n' + v.brief +
          '\n\nMy website address is ' + (v.site || '[your website address]') + '.\n' +
          'Build UTM-tagged links (utm_source, utm_medium, utm_campaign) for every place we share our site: ' + (v.local ? 'the website button on our Google Business Profile, ' : '') +
          'Instagram bio, Facebook page, email newsletter, printed QR codes, and any partner sites. Use a consistent lowercase naming scheme and explain it in a small table, so I can add new links myself.\n';
      } }),
    P({ id: 'economics', stage: 'measure', rank: 10, title: 'Know what a customer is worth', time: '15 min', level: 2,
      why: 'The question behind every ad budget: how much can you afford to pay to win one customer? Agencies work backwards from your margin and how often customers come back.',
      get: 'Your customer lifetime value, the most you can pay per customer and per lead, and a break-even cost per click.',
      next: 'Use these numbers to judge any ad result, or any agency\'s report. Try the Ad math page in Marguru too.',
      text: function (v) {
        return 'Act as a marketing analyst. Show your math step by step.\n\n' + v.brief +
          '\n\nMy numbers: average sale ' + v.priceText + ', gross margin [%] , customers buy ' + v.repeatText + ' for about [how many years], and about [%] of enquiries become customers.\n\n' +
          'Calculate:\n1. Gross profit per sale and over a customer\'s lifetime (LTV).\n2. The most I can pay to win one customer and still make money (break-even), and a safer target.\n' +
          '3. The most I can pay per lead, given my close rate.\n4. If a landing page converts [%] of clicks into leads, the break-even cost per click.\n' +
          '5. A plain-language summary of what this means for my ad budget.\nIf a number is missing, use a clearly labelled example value and tell me to replace it.';
      } }),
    P({ id: 'report', stage: 'measure', rank: 35, title: 'Write your monthly report like an agency', time: '20 min / month', level: 2,
      why: 'The monthly report is what agencies are judged on. Writing your own keeps you honest: what happened, why, and what changes next month.',
      get: 'A one-page report template, then a written summary from the numbers you paste.',
      next: 'Do it on the same day each month. Compare with last month, not with your hopes.',
      text: function (v) {
        return 'Act as an agency account manager writing a client\'s monthly report.\n\n' + v.brief +
          '\n\nSTEP 1: Give me a one-page monthly report template for my goal (' + v.goalText + '): the 5-8 numbers to fill in each month and where to find each one' +
          (v.local ? ' (Google Business Profile performance, ' : ' (') + 'Analytics' + (v.paid ? ', Google Ads, Meta Ads Manager' : '') + ', our own sales records).\n\n' +
          'STEP 2: When I paste this month\'s and last month\'s numbers, write the summary: what happened, the likely reasons (say when you are guessing), and the 3 actions for next month. No vanity metrics without context: likes and impressions only matter if they lead to customers.\n';
      } }),
    P({ id: 'agency', stage: 'measure', rank: 36, title: 'Thinking of hiring an agency? Grill them', time: '20 min', level: 1,
      why: 'Google\'s own advice: "No one can guarantee a #1 ranking on Google," be wary of agencies that cold-email you or won\'t explain what they do, and ask for examples and timeframes. This prompt turns that into an interview and a proposal check.',
      get: '15 sharp questions to ask, and a red-flag review of any proposal you paste.',
      next: 'Ask the questions on the call, and insist that every account is in your business\'s name.',
      text: function (v) {
        return 'Act as an independent marketing consultant protecting a small-business owner from a bad agency deal.\n\n' + v.brief +
          '\n\nSTEP 1: Write 15 questions to ask a marketing agency before signing, including:\n' +
          '- examples of previous work and results, and what results to expect in what timeframe (Google suggests asking these)\n' +
          '- whether they follow Google Search Essentials, and whether they will tell me about every change to my site\n' +
          '- who owns the ad accounts, Google Business Profile, Analytics and Meta accounts (it must be my business; the agency gets user access)\n' +
          '- their management fee shown separately from ad spend (Google requires third parties managing Google Ads to disclose fees and share cost, click and impression data)\n' +
          '- who actually does the work: their staff or an outsourced "white-label" partner\n- contract length, notice period and what I keep if I leave\n\n' +
          'STEP 2: When I paste a proposal or contract, list every red flag: guaranteed rankings or results, a "special relationship with Google", fake or incentivised reviews, buying links, vague deliverables, long lock-ins, the agency owning my accounts or website. Then list what\'s good.\n\nPROPOSAL:\n[paste it here, or skip until you have one]';
      } })
  ];

  var BY_ID = {};
  MG.PROMPTS.forEach(function (p) { BY_ID[p.id] = p; });
  MG.prompt = function (id) { return BY_ID[id] || null; };

  /* profile -> the playbook: {v, stages: [{...stage, prompts:[{...prompt, n, text}]}], prompts (flat, stage order), first (by rank)} */
  MG.build = function (profile) {
    var v = MG.values(profile);
    var all = MG.PROMPTS.filter(function (p) { return !p.when || p.when(v); });
    var flat = [], n = 0;
    var stages = MG.STAGES.map(function (s) {
      var ps = all.filter(function (p) { return p.stage === s.id; }).sort(function (a, b) { return a.rank - b.rank; }).map(function (p) {
        n += 1;
        var o = { id: p.id, stage: p.stage, rank: p.rank, n: n, title: p.title, time: p.time, level: p.level, why: p.why, get: p.get, next: p.next, text: p.text(v) };
        flat.push(o);
        return o;
      });
      return { id: s.id, n: s.n, title: s.title, icon: s.icon, role: s.role, agency: s.agency, prompts: ps };
    }).filter(function (s) { return s.prompts.length; });
    var first = flat.slice().sort(function (a, b) { return a.rank - b.rank; });
    var hidden = [];
    if (!v.paid) hidden.push('Google Ads and most paid social prompts are hidden because your ad budget is $0. Change your budget to see them.');
    if (!v.local) hidden.push('Google Maps prompts are hidden because you sell online only.');
    return { v: v, stages: stages, prompts: flat, first: first, hidden: hidden };
  };
  MG.count = function (profile) { var b = MG.build(profile); return { prompts: b.prompts.length, stages: b.stages.length }; };

  /* The whole playbook as a Markdown document (Download). */
  MG.markdown = function (profile, progress) {
    var b = MG.build(profile), done = (progress && progress.done) || {}, notes = (progress && progress.notes) || {};
    var out = ['# ' + (profile.name || 'My business') + ': marketing playbook', '', 'Made with Marguru. Paste each prompt into ChatGPT, Claude or any AI chat.', '', '```', b.v.brief, '```', ''];
    b.stages.forEach(function (s) {
      out.push('## ' + s.n + '. ' + s.title, '', '_What an agency does here (' + s.role + '):_ ' + s.agency, '');
      s.prompts.forEach(function (p) {
        out.push('### ' + (done[p.id] ? '[x] ' : '[ ] ') + p.n + '. ' + p.title + ' (' + p.time + ')', '', '**Why:** ' + p.why, '', '**You get:** ' + p.get, '', '```', p.text, '```', '', '**Then:** ' + p.next, '');
        if (notes[p.id]) out.push('**My notes:** ' + notes[p.id], '');
      });
    });
    return out.join('\n');
  };

  MG.EXAMPLE = {
    name: 'Crumb & Co.', what: 'sourdough bread, pastries and custom celebration cakes', type: 'food', reach: 'visit', where: 'Verdun, Montréal',
    customer: 'young families and remote workers within a 10-minute walk; parents ordering birthday cakes 1-2 weeks ahead',
    price: 18, repeat: 'often', goal: 'walkins', budget: '300',
    edge: 'bread baked at 5 a.m. daily with organic Québec flour; custom cakes on 72 hours\' notice',
    competitors: 'a chain bakery-café two blocks away; supermarket bakery counters', voice: 'warm',
    has: { site: true, gbp: true, social: true, photos: true }, tried: 'posting on Instagram now and then; one round of flyers'
  };

  /* Short, checked facts shown as "Guru tips" around the app. Keep each one sourced (see the Field guide). */
  MG.TIPS = [
    ['Google says there\'s no way to pay for a better spot in local results. A complete profile, reviews and replies are the parts you control.', 'Google Business Profile Help'],
    ['Ask every customer for a review, not only the happy ones. Google\'s policy bans "selectively soliciting positive reviews".', 'Google Maps contribution policy'],
    ['No discounts or gifts for reviews. Google forbids it, and in the US the FTC\'s 2024 rule made fake reviews illegal.', 'Google, FTC'],
    ['"No one can guarantee a #1 ranking on Google." Those are Google\'s words; an agency that guarantees it is a red flag.', 'Google Search Central'],
    ['Search ad headlines max out at 30 characters, descriptions at 90. Write 15 headlines and let Google mix them.', 'Google Ads'],
    ['See any competitor\'s running ads for free: the Meta Ad Library and Google\'s Ads Transparency Center.', 'Meta, Google'],
    ['Meta says an ad set usually leaves the learning phase after about 50 results in 7 days. Small budget? Pick a goal that happens often enough.', 'Meta Business Help'],
    ['Read your Google Ads search terms weekly: it shows what people really typed before they clicked.', 'Practitioner habit'],
    ['Your accounts should be in your business\'s name: Google Ads, Business Profile, Analytics, Meta. Agencies get user access, not ownership.', 'Practitioner advice'],
    ['Google charges up to 30.4 times your daily budget in a month. Monthly budget ÷ 30.4 = daily budget.', 'Google Ads Help'],
    ['A third party managing your Google Ads must disclose its fees and give you cost, click and impression data.', 'Google third-party policy'],
    ['Google\'s advice for content: helpful, reliable and people-first. Lots of AI text published without oversight counts as low effort.', 'Google Search Central']
  ];
  MG.tipOfDay = function () { var d = new Date(); return MG.TIPS[(d.getFullYear() * 400 + d.getMonth() * 31 + d.getDate()) % MG.TIPS.length]; };

  /* Profile cleaning in the browser (the server cleans again). */
  MG.blank = function () { return { name: '', what: '', type: '', reach: 'visit', where: '', customer: '', price: '', repeat: 'sometimes', goal: 'calls', budget: '300', edge: '', competitors: '', voice: 'warm', has: {}, tried: '', site_url: '' }; };

  /* Links that open an AI chat with the prompt typed in. Copying always happens too, as a fallback. */
  MG.openUrl = function (where, text) {
    var q = encodeURIComponent(text);
    return where === 'claude' ? 'https://claude.ai/new?q=' + q : 'https://chatgpt.com/?q=' + q;
  };
  MG.copy = function (text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(function () { return true; }, fallback);
    return Promise.resolve(fallback());
    function fallback() {
      try {
        var ta = document.createElement('textarea');
        ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        var ok = document.execCommand('copy'); ta.remove(); return ok;
      } catch (e) { return false; }
    }
  };

  /* ---------------------------------------------------------------- browser-only helpers for the Python pages */
  /* A little burst of paper confetti from an element (Python: mg.confetti). */
  MG.confetti = function (from) {
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var r = from ? from.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
    var colors = ['#c93a20', '#ffd84d', '#2f6b4f', '#1b1a17', '#f8ddd3'];
    for (var i = 0; i < 34; i++) {
      var c = document.createElement('i');
      c.className = 'mg-confetti';
      c.style.background = colors[i % colors.length];
      c.style.left = (r.left + r.width / 2) + 'px'; c.style.top = (r.top + r.height / 2) + 'px';
      document.body.appendChild(c);
      var a = Math.random() * Math.PI * 2, d = 80 + Math.random() * 160;
      c.animate([{ transform: 'translate(0,0) rotate(0)', opacity: 1 },
        { transform: 'translate(' + Math.cos(a) * d + 'px,' + (Math.sin(a) * d - 60 + Math.random() * 220) + 'px) rotate(' + (Math.random() * 720) + 'deg)', opacity: 0 }],
        { duration: 900 + Math.random() * 600, easing: 'cubic-bezier(.2,.7,.4,1)', fill: 'forwards' });
      setTimeout(function (el) { el.remove(); }.bind(null, c), 1600);
    }
  };

  /* The whole playbook as a Markdown file download. */
  MG.download = function (profile, progress) {
    var md = MG.markdown(profile, progress);
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([md], { type: 'text/markdown' }));
    a.download = (profile.name || 'playbook').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() + '-marketing-playbook.md';
    document.body.appendChild(a); a.click(); a.remove();
  };

  /* JSON bridge for client_code/mg.py: Python passes and gets JSON text, so it works with plain dicts. */
  MG.json = {
    build: function (profile) { var b = MG.build(JSON.parse(profile)); return JSON.stringify({ v: b.v, stages: b.stages, prompts: b.prompts, first: b.first, hidden: b.hidden }); },
    count: function (profile) { return JSON.stringify(MG.count(JSON.parse(profile))); },
    stages: function (profile) { var b = MG.build(JSON.parse(profile)); return JSON.stringify({ prompts: b.prompts.length, stages: b.stages.map(function (s) { return { title: s.title, n: s.prompts.length }; }) }); },
    download: function (profile, progress) { MG.download(JSON.parse(profile), JSON.parse(progress)); return true; },
    info: function (id) { var p = MG.prompt(id); return JSON.stringify(p ? { id: p.id, title: p.title, stage: p.stage } : null); },
    data: function () {
      return JSON.stringify({ TYPES: MG.TYPES, REACH: MG.REACH, GOALS: MG.GOALS, BUDGETS: MG.BUDGETS, REPEAT: MG.REPEAT, VOICES: MG.VOICES,
        HAS: MG.HAS, CHANNELS: MG.CHANNELS, STAGES: MG.STAGES, TIPS: MG.TIPS, EXAMPLE: MG.EXAMPLE, BLANK: MG.blank() });
    }
  };
})();
