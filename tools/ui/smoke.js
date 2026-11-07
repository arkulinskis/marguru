/* Smoke test (tools/ui_test.py runs it at 1280 px and at 390 px): every page address opens without errors, is not
   empty and doesn't scroll sideways, signed out (incl. a guest plan made on #build), then as a new member (the guest
   plan moves into the account; their own #plan/<id> and #build/<id>), then as admin (every Admin tab).
   Python/JS errors are caught by ui_test.py from the browser log. Resolves to {ok, log}. */
(async function () {
  const log = [], bad = [];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function until(fn, what, ms) {
    const end = Date.now() + (ms || 20000);
    while (Date.now() < end) { try { const v = fn(); if (v) return v; } catch (e) {} await sleep(150); }
    throw new Error('timed out waiting for: ' + what);
  }
  const $ = (s) => document.querySelector(s), $$ = (s) => Array.from(document.querySelectorAll(s));
  const errs = [];
  window.addEventListener('error', (e) => errs.push(String(e.message || e)));
  function type(input, value) {
    input.focus(); input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function button(re, root) { return $$((root || '') + ' button').find((b) => re.test(b.textContent) && b.offsetParent !== null); }
  async function open(hash, expect, landed) {
    if (location.hash !== hash) window.UI_READY = false;
    location.hash = hash;
    await until(() => window.UI_READY && (landed ? landed() : location.hash === hash), hash, 30000);
    await sleep(700);
    const main = $('.ui-main');
    const text = main ? main.innerText.trim() : '';
    const w = document.documentElement.scrollWidth, vw = screen.width <= 500 ? screen.width : window.innerWidth;
    const problems = [];
    if (text.length < 40) problems.push('empty page');
    if (expect && !new RegExp(expect.source, 'i').test(text)) problems.push('missing ' + expect);
    if (w > vw + 1) {
      const wide = $$('body *').filter((e) => { const r = e.getBoundingClientRect(); return r.width && r.right > vw + 1; })
        .slice(0, 3).map((e) => e.tagName.toLowerCase() + '.' + String(e.className).split(' ').slice(0, 2).join('.'));
      problems.push('scrolls sideways (' + w + ' > ' + vw + ') ' + wide.join(' '));
    }
    if (errs.length) problems.push('errors: ' + errs.splice(0).join(' / '));
    if (problems.length) bad.push(hash + ': ' + problems.join('; '));
    log.push((problems.length ? 'BAD  ' : 'ok   ') + hash);
  }
  async function signUp(name, email, password) {
    location.hash = '#auth/signup';
    await until(() => window.UI_READY && $$('.au-card input').length >= 3, 'sign-up form');
    await sleep(400);
    const inputs = $$('.au-card input[type=text], .au-card input[type=email], .au-card input[type=password]');
    type(inputs[0], name); type(inputs[1], email); type(inputs[2], password);
    const tick = $('.au-card input[type=checkbox]'); if (tick && !tick.checked) tick.click();
    button(/Create account/, '.au-card .anvil-role-btn-block').click();
    const end = Date.now() + 30000;
    while (Date.now() < end) {
      if (location.hash === '#home' && window.UI_READY) return true;
      const msg = $('.au-card .anvil-role-msg-error');
      if (msg && msg.offsetParent !== null && msg.textContent.trim()) { log.push('sign-up said: ' + msg.textContent.trim()); return false; }
      await sleep(200);
    }
    log.push('sign-up: still on ' + location.hash);
    return false;
  }
  async function signIn(email, password) {
    location.hash = '#auth';
    await until(() => window.UI_READY && $$('.au-card input[type=password]').length, 'sign-in form');
    await sleep(400);
    type($('.au-card input[type=email]'), email); type($('.au-card input[type=password]'), password);
    button(/Sign in/, '.au-card .anvil-role-btn-block').click();
    await until(() => location.hash === '#home' && window.UI_READY, 'signed in as ' + email, 30000);
  }
  async function signOut() {
    $('.anvil-role-avatar button').click();
    await sleep(300);
    button(/Sign out/, '.ui-menu').click();
    await until(() => {  // the account button goes once sign-out has finished
      const a = $('.anvil-role-avatar button');
      return location.hash === '#landing' && window.UI_READY && (!a || a.offsetParent === null);
    }, 'signed out');
  }
  try {
    localStorage.removeItem('marguru.guestPlan');
    // ---- signed out
    await open('#landing', /like an agency would/);
    await open('#guide', /actually do/);
    await open('#guide/sources', /how we checked/);
    $$('.gd-q button')[0].click();  // the agency checker answers
    await sleep(300);
    if (!/warning sign/.test(($('.gd-score') || {}).innerText || '')) bad.push('#guide: the agency checker gave no verdict');
    await open('#math', /worth it/);
    await open('#wins', /actually worked/);
    await open('#wins/maps', /actually worked/);
    await open('#plan/example', /Crumb/);
    await open('#auth', /Sign in/);
    await open('#auth/signup', /Create account/);
    // a guest builds a playbook (kept in this browser)
    await open('#build', /your business/);
    button(/Fill with an example/).click();
    await sleep(600);
    if (!/Crumb/.test($$('.ui-main input').map((i) => i.value).join(' '))) bad.push('#build: the example didn\'t fill the form');
    const save = $$('.ui-main button').find((b) => /Build my playbook/.test(b.textContent) && b.offsetParent !== null);
    save.click();
    await until(() => location.hash === '#plan/local' && window.UI_READY, 'the guest playbook', 30000);
    await open('#plan/local', /lives in this browser/);
    const tick = $('.pc-done input'); if (tick) tick.click(); else bad.push('#plan/local: no Done tick box');
    await sleep(500);
    await open('#build/local', /Save changes|your business/);

    // ---- a member: the guest plan moves into the account
    const ok = await signUp('Smoke Tester', 'smoke' + Date.now() + '@example.com', 'Mg-' + Math.random().toString(36).slice(2) + '-Kq7');
    if (!ok) throw new Error('sign-up failed');
    await open('#home', /Hello, Smoke/);
    const card = $('.dk-plan');
    if (!card) throw new Error('the guest plan was not moved into the account');
    const planHash = card.getAttribute('href');
    await open(planHash, /Start here|Every prompt done/);
    const t2 = $$('.pc-done input')[0]; if (t2) t2.click();
    await sleep(800);
    const tab = $$('.pl-tab')[1]; if (tab) { tab.click(); await sleep(600); }
    await open('#build/' + planHash.split('/')[1], /Save changes|your business/);
    await open('#home', /Crumb/);
    await open('#wins', /Share a win/);
    await open('#guide', /actually do/);
    await open('#math', /worth it/);
    await open('#profile', /Your name/);
    await open('#landing', /Open your desk/);
    await signOut();

    // ---- admin (ADMIN_EMAILS in Accounts.py): sign up the first time, sign in after that
    const adminPw = 'Mg-smoke-adm-93Kx-7q';
    if (!(await signUp('Admin Tester', 'arkulinskis@gmail.com', adminPw))) await signIn('arkulinskis@gmail.com', adminPw);
    for (const t of ['overview', 'feedback', 'users', 'wins', 'prompts', 'demo']) await open('#admin/' + t, /Admin/);
    await signOut();
    log.push(bad.length ? 'PROBLEMS: ' + bad.join(' | ') : 'PASSED');
    return { ok: !bad.length, log: log };
  } catch (e) {
    log.push(String(e && e.message || e));
    if (bad.length) log.push('PROBLEMS: ' + bad.join(' | '));
    return { ok: false, log: log };
  }
})();
