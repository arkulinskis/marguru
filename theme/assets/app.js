/* core.js: the shared front-end engine (window.UI). Same in every app made from APP_MAKER/template;
   app-specific things live in web/app.js (brand, nav, footer) and web/pages/*.html (the pages).

   Pages:   UI.page(name, {title, nav, icon, auth, order, chrome}, mount)
              auth: null (anyone) | 'guest' (signed-out only) | 'user' | 'admin'
              nav: label for the header / phone tab bar (omit to keep it out of the menus)
              mount(view, ctx) draws into `view`; ctx = {args, me, go, api}. Return a Promise (the page
              is "ready" when it resolves) or {ready, destroy}. URLs are #name/arg1/arg2.
   Server:  UI.api(fn, ...args) -> Promise of the server function's return value. A reply of
              {ok: false, error} rejects with that message (shown as a toast unless you .catch it).
            UI.apiQuiet(fn, ...args) is the same without Anvil's loading spinner.
   Auth:    UI.auth('login'|'signup'|'reset'|'logout', {...}) -> Promise of {ok, me, message}
   Helpers: UI.esc, UI.icon, UI.toast, UI.modal, UI.confirm, UI.busy, UI.formData, UI.fmtDate, UI.ago,
            UI.store, UI.setTheme, UI.feedback, UI.go, UI.refresh
   Tests:   window.UI_READY is true when the current page has finished loading. */
(function () {
  'use strict';
  if (window.UI && window.UI.__v) return;
  var UI = window.UI = { __v: 1, pages: {}, me: null, config: { name: 'App', key: 'app', home: 'home', landing: 'landing' } };
  window.UI_READY = false;

  UI.configure = function (cfg) { Object.keys(cfg).forEach(function (k) { UI.config[k] = cfg[k]; }); };

  /* ------------------------------------------------------------------ small helpers */
  UI.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  UI.plural = function (n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); };
  UI.initials = function (name) {
    var p = String(name || '?').trim().split(/\s+/);
    return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
  };
  UI.fmtDate = function (iso, opts) {
    if (!iso) return '';
    var d = iso.length <= 10 ? new Date(iso + 'T12:00:00') : new Date(iso);
    return d.toLocaleDateString(undefined, opts || { day: 'numeric', month: 'short', year: 'numeric' });
  };
  UI.fmtDateTime = function (iso) {
    return iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  };
  UI.ago = function (iso) {
    if (!iso) return '';
    var s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return 'just now';
    var steps = [[60, 'minute'], [24, 'hour'], [7, 'day'], [4.35, 'week'], [12, 'month'], [Infinity, 'year']], n = s / 60;
    for (var i = 0; i < steps.length; i++) {
      if (n < steps[i][0]) { n = Math.floor(n); return UI.plural(n, steps[i][1]) + ' ago'; }
      n = n / steps[i][0];
    }
    return '';
  };
  UI.store = {
    get: function (k, dflt) { try { var v = localStorage.getItem(UI.config.key + '.' + k); return v == null ? dflt : JSON.parse(v); } catch (e) { return dflt; } },
    set: function (k, v) { try { localStorage.setItem(UI.config.key + '.' + k, JSON.stringify(v)); } catch (e) {} }
  };
  UI.formData = function (form) {
    var out = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || el.disabled) return;
      if (el.type === 'checkbox') out[el.name] = el.checked;
      else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; }
      else out[el.name] = el.value;
    });
    return out;
  };
  /* Disable a button while a Promise runs; returns the Promise. */
  UI.busy = function (btn, promise) {
    if (!btn) return promise;
    btn.disabled = true; btn.classList.add('is-busy');
    var done = function () { btn.disabled = false; btn.classList.remove('is-busy'); };
    promise.then(done, done);
    return promise;
  };

  var ICONS = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18 14.7c2.2.6 3.5 2.4 3.5 5.3"/>',
    sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12z"/>',
    bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    back: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    bug: '<rect x="7" y="8" width="10" height="12" rx="5"/><path d="M12 8V5M9 5.5 7.5 4M15 5.5 16.5 4M7 13H3M21 13h-4M7.5 18l-3 2M16.5 18l3 2M7.5 9.5l-3-2M16.5 9.5l3-2"/>',
    bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
    star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    inbox: '<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5 5h14l2 8v6H3v-6z"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
    database: '<ellipse cx="12" cy="5.5" rx="7.5" ry="2.5"/><path d="M4.5 5.5v13c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5v-13"/><path d="M4.5 12c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 20v-4h-4"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
    pin: '<path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3v12H4z"/><circle cx="12" cy="13.5" r="3.5"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    filter: '<path d="M4 5h16l-6 7.5V19l-4 1.5v-8z"/>',
    more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>'
  };
  UI.ICONS = ICONS;
  UI.icon = function (name, cls) {
    return '<svg class="ui-ic ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || ICONS.sparkle) + '</svg>';
  };

  /* ------------------------------------------------------------------ toasts, modals */
  UI.toast = function (msg, kind) {
    var box = document.querySelector('.ui-toasts');
    if (!box) { box = document.createElement('div'); box.className = 'ui ui-toasts'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    var t = document.createElement('div');
    t.className = 'ui-toast' + (kind ? ' ' + kind : '');
    t.innerHTML = (kind === 'error' ? UI.icon('info') : kind === 'ok' ? UI.icon('check') : '') + '<span>' + UI.esc(msg) + '</span>';
    box.appendChild(t);
    setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 300); }, kind === 'error' ? 6500 : 3200);
  };
  UI.modal = function (html, opts) {
    opts = opts || {};
    var prev = document.activeElement;
    var wrap = document.createElement('div');
    wrap.className = 'ui ui-modal-wrap';
    wrap.innerHTML = '<div class="ui-modal' + (opts.wide ? ' wide' : '') + '" role="dialog" aria-modal="true">' +
      '<button class="ui-btn ghost icon ui-modal-x" data-close aria-label="Close">' + UI.icon('x') + '</button>' + html + '</div>';
    document.body.appendChild(wrap);
    document.documentElement.classList.add('ui-modal-open');
    function key(e) { if (e.key === 'Escape') close(); }
    function close() {
      if (!wrap.parentNode) return;
      wrap.remove(); document.removeEventListener('keydown', key);
      if (!document.querySelector('.ui-modal-wrap')) document.documentElement.classList.remove('ui-modal-open');
      if (opts.onclose) opts.onclose();
      if (prev && prev.focus) prev.focus();
    }
    document.addEventListener('keydown', key);
    wrap.addEventListener('mousedown', function (e) { if (e.target === wrap) close(); });
    wrap.addEventListener('click', function (e) { if (e.target.closest('[data-close]')) close(); });
    var first = wrap.querySelector('input, textarea, select');
    setTimeout(function () { (first || wrap.querySelector('.ui-modal')).focus && (first || wrap.querySelector('.ui-modal')).focus(); }, 30);
    return { el: wrap.querySelector('.ui-modal'), close: close };
  };
  UI.confirm = function (o) {
    o = typeof o === 'string' ? { title: o } : (o || {});
    return new Promise(function (resolve) {
      var answered = false;
      var m = UI.modal('<h2>' + UI.esc(o.title || 'Are you sure?') + '</h2>' + (o.text ? '<p class="muted">' + UI.esc(o.text) + '</p>' : '') +
        '<div class="ui-row end" style="margin-top:20px"><button class="ui-btn ghost" data-close>' + UI.esc(o.cancel || 'Cancel') + '</button>' +
        '<button class="ui-btn ' + (o.danger ? 'danger solid' : 'primary') + '" data-ok>' + UI.esc(o.ok || 'OK') + '</button></div>',
      { onclose: function () { if (!answered) resolve(false); } });
      m.el.querySelector('[data-ok]').onclick = function () { answered = true; m.close(); resolve(true); };
    });
  };

  /* ------------------------------------------------------------------ theme */
  UI.theme = function () { return UI.store.get('theme', 'auto'); };
  UI.applyTheme = function (t) {
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
    var dark = t === 'dark' || (t !== 'light' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('ui-dark', !!dark);
  };
  UI.setTheme = function (t) { UI.store.set('theme', t); UI.applyTheme(t); };
  UI.applyTheme(UI.theme());
  if (window.matchMedia) {
    try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { UI.applyTheme(UI.theme()); }); } catch (e) {}
  }

  /* ------------------------------------------------------------------ server bridge */
  var bridge = null;
  function send(kind, payload) {
    if (!bridge) return Promise.reject(new Error('The app is still starting.'));
    var out;
    try { out = bridge(kind, JSON.stringify(payload || {})); } catch (e) { return Promise.reject(e); }
    return Promise.resolve(out).then(function (r) {
      r = typeof r === 'string' ? JSON.parse(r) : (r || {});
      if (r.error) {
        var err = new Error(r.error); err.uiApi = true; err.denied = !!r.denied;
        if (r.detail) console.error(kind, payload && payload.fn, r.detail);
        if (r.reload) setTimeout(function () { location.reload(); }, 2500);
        throw err;
      }
      return r.result;
    });
  }
  function apiCall(quiet, fn, args) {
    return send('call', { fn: fn, args: args, quiet: quiet }).then(function (res) {
      if (res && typeof res === 'object' && res.ok === false) {
        var err = new Error(res.error || 'That didn\'t work.'); err.uiApi = true; err.expected = true; err.result = res;
        throw err;
      }
      return res;
    });
  }
  UI.api = function (fn) { return apiCall(false, fn, Array.prototype.slice.call(arguments, 1)); };
  UI.apiQuiet = function (fn) { return apiCall(true, fn, Array.prototype.slice.call(arguments, 1)); };
  /* Errors nobody caught become a toast, so a failed action is never silent. */
  window.addEventListener('unhandledrejection', function (e) {
    if (e.reason && e.reason.uiApi) { e.preventDefault(); UI.toast(e.reason.message, 'error'); }
  });

  /* Sign in / up / out. On success it navigates: to where the visitor was heading (UI.after) or home
     after signing in, to the landing page after signing out. */
  UI.auth = function (kind, payload) {
    return send(kind, payload || {}).then(function (r) {
      if (r && r.ok === false) { var err = new Error(r.error); err.uiApi = true; err.expected = true; throw err; }
      if (r && 'me' in r && (r.me || kind === 'logout')) {
        UI.me = r.me || null;
        var target = r.me ? (UI.after || '#' + UI.config.home) : '#' + UI.config.landing;
        UI.after = null;
        if (location.hash === target) route(); else location.hash = target;
      }
      return r;
    });
  };
  /* Update the signed-in user's details (e.g. a new name) and redraw the header, without reloading the page. */
  UI.setMe = function (me) {
    UI.me = me || null;
    if (shellRoot) renderChrome(current.name);
  };

  /* ------------------------------------------------------------------ pages and routing */
  UI.page = function (name, opts, mount) {
    if (typeof opts === 'function') { mount = opts; opts = {}; }
    opts.name = name; opts.mount = mount;
    UI.pages[name] = opts;
  };
  UI.allowed = function (p) {
    if (!p) return false;
    if (p.auth === 'user') return !!UI.me;
    if (p.auth === 'admin') return !!(UI.me && UI.me.is_admin);
    if (p.auth === 'guest') return !UI.me;
    return true;
  };
  UI.navPages = function () {
    return Object.keys(UI.pages).map(function (k) { return UI.pages[k]; })
      .filter(function (p) { return p.nav && UI.allowed(p) && (!p.when || p.when()); })
      .sort(function (a, b) { return (a.order || 50) - (b.order || 50); });
  };
  UI.parseHash = function () {
    var h = (location.hash || '').replace(/^#!?\/?/, '');
    var parts = h.split('?')[0].split('/').filter(function (x) { return x !== ''; }).map(decodeURIComponent);
    return { name: parts[0] || '', args: parts.slice(1) };
  };
  UI.hashFor = function (name) {
    var args = Array.prototype.slice.call(arguments, 1).filter(function (a) { return a != null && a !== ''; });
    return '#' + [name].concat(args.map(encodeURIComponent)).join('/');
  };
  UI.go = function (name) {
    var h = UI.hashFor.apply(null, arguments);
    if (location.hash === h) route(); else location.hash = h;
  };
  UI.refresh = function () { route(); };
  UI.after = null;  // where to go after signing in

  var shellRoot = null, view = null, current = { name: null, destroy: null }, routeSeq = 0;

  function defaultPage() { return UI.me ? UI.config.home : UI.config.landing; }

  function route() {
    var r = UI.parseHash(), name = r.name || defaultPage(), p = UI.pages[name];
    if (!p) { name = defaultPage(); p = UI.pages[name]; r.args = []; }
    if (p.auth === 'guest' && UI.me) { p = UI.pages[UI.config.home]; name = UI.config.home; r.args = []; }
    if ((p.auth === 'user' || p.auth === 'admin') && !UI.me) {
      UI.after = location.hash && location.hash !== '#' ? location.hash : null;
      p = UI.pages.auth; name = 'auth'; r.args = [];
    }
    if (p.auth === 'admin' && !(UI.me && UI.me.is_admin)) {
      UI.toast('That page is for admins only.', 'error');
      p = UI.pages[UI.config.home]; name = UI.config.home; r.args = [];
    }
    var seq = ++routeSeq;
    window.UI_READY = false;
    if (current.destroy) { try { current.destroy(); } catch (e) { console.error(e); } }
    current = { name: name, args: r.args, destroy: null };
    if (shellRoot) {
      shellRoot.className = 'ui ui-shell page-' + name + (UI.me ? ' signed-in' : ' signed-out') + (p.chrome === false ? ' no-chrome' : '');
      renderChrome(name);
    }
    // A fresh element for every page, so listeners a page adds to `view` never pile up.
    var fresh = view.cloneNode(false);
    view.parentNode.replaceChild(fresh, view);
    view = fresh;
    window.scrollTo(0, 0);
    document.title = (p.title ? (typeof p.title === 'function' ? p.title(r.args) : p.title) + ' · ' : '') + UI.config.name;
    var ctx = { name: name, args: r.args, me: UI.me, go: UI.go, api: UI.api, page: p };
    var out;
    try { out = p.mount(view, ctx); } catch (e) { console.error(e); out = Promise.reject(e); }
    var ready = out && typeof out.then === 'function' ? out : (out && out.ready) || Promise.resolve();
    if (out && out.destroy) current.destroy = out.destroy;
    Promise.resolve(ready).then(function () { if (seq === routeSeq) window.UI_READY = true; },
      function (e) {
        if (seq !== routeSeq) return;
        console.error(e);
        if (!view.innerHTML) view.innerHTML = '<div class="ui-wrap"><div class="ui-empty">' + UI.icon('info') +
          '<h3>This page didn\'t load</h3><p class="muted">' + UI.esc(e && e.message || 'Something went wrong.') + '</p>' +
          '<button class="ui-btn" onclick="UI.refresh()">Try again</button></div></div>';
        window.UI_READY = true;
      });
  }
  UI.current = function () { return current; };

  /* The shell's parts come from web/app.js: UI.shell = {header(me, active), footer(me), tabbar(me, active)} */
  function renderChrome(active) {
    var S = UI.shell || {};
    var hd = shellRoot.querySelector('[data-ui-header]'), ft = shellRoot.querySelector('[data-ui-footer]'), tb = shellRoot.querySelector('[data-ui-tabbar]');
    if (hd) hd.innerHTML = S.header ? S.header(UI.me, active) : '';
    if (ft) ft.innerHTML = S.footer ? S.footer(UI.me, active) : '';
    if (tb) tb.innerHTML = S.tabbar ? S.tabbar(UI.me, active) : '';
  }
  UI.renderChrome = function () { if (shellRoot) renderChrome(current.name); };

  /* Called by client_code/Main.py (and by the local harness) once the page is up. */
  UI.start = function (node, bridgeFn, bootJson) {
    bridge = bridgeFn;
    var boot = typeof bootJson === 'string' ? JSON.parse(bootJson || '{}') : (bootJson || {});
    UI.me = boot.me || null;
    var host = node && node.matches && node.matches('[data-ui-app]') ? node : (node && node.querySelector('[data-ui-app]')) || node || document.body;
    host.innerHTML = '<div class="ui ui-shell">' +
      '<header class="ui-header" data-ui-header></header>' +
      '<main class="ui-main" data-ui-view></main>' +
      '<footer class="ui-footer" data-ui-footer></footer>' +
      '<nav class="ui-tabbar" data-ui-tabbar aria-label="Main"></nav></div>';
    shellRoot = host.firstChild;
    view = host.querySelector('[data-ui-view]');
    if (UI.shell && UI.shell.wire) UI.shell.wire(shellRoot);
    window.addEventListener('hashchange', route);
    route();
  };

  /* ------------------------------------------------------------------ feedback (footer + menu)
     All feedback goes to Prepsto. The widget tag in head.html (data-prepsto="CODE") slides its panel in;
     any [data-feedback] or [data-prepsto-open] element opens it. If the widget hasn't loaded, the panel opens in a new tab.
     There is no in-app feedback form any more: Admin -> Feedback only lists older messages (and app requests). */
  UI.feedback = function () {
    if (window.Prepsto && window.Prepsto.open) { window.Prepsto.open(); return; }
    var tag = document.querySelector('script[data-prepsto]');
    var code = tag && tag.getAttribute('data-prepsto');
    if (code && code.indexOf('__') !== 0) window.open('https://prepsto.com/#f/' + encodeURIComponent(code), '_blank', 'noopener');
    else UI.toast('Feedback is not set up yet.', 'error');
  };

  /* Shared clicks: [data-go="page/arg"], [data-feedback], [data-theme-set] anywhere in the app. */
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-go],[data-feedback],[data-theme-set]');
    if (!el) return;
    if (el.hasAttribute('data-go')) { e.preventDefault(); UI.go.apply(null, el.getAttribute('data-go').split('/')); }
    else if (el.hasAttribute('data-feedback')) { e.preventDefault(); UI.feedback(el.getAttribute('data-feedback') || null); }
    else if (el.hasAttribute('data-theme-set')) { e.preventDefault(); UI.setTheme(el.getAttribute('data-theme-set')); if (UI.shell && UI.shell.onTheme) UI.shell.onTheme(); }
  });
})();


/* app.js: this app's identity and frame: name, header, footer, phone tab bar.
   Pages live in web/pages/*.html. The engine (window.UI) is web/core.js. */
(function () {
  'use strict';
  UI.configure({
    name: 'Marguru',
    key: 'marguru',          // prefix for this app's browser storage
    tagline: 'Market your business like an agency would. Copy-ready prompts, honest rules.',   // footer line
    home: 'home',                // first page after signing in
    landing: 'landing'           // first page for visitors who aren't signed in
  });

  var esc = UI.esc;

  function brand() {
    return '<a class="ui-brand" href="#" data-go="' + (UI.me ? UI.config.home : UI.config.landing) + '" aria-label="' + esc(UI.config.name) + ' home">' +
      '<img src="_/theme/icon.svg" alt="" width="32" height="32"><span>' + esc(UI.config.name) + '</span></a>';
  }

  function themeSwitch() {
    var t = UI.theme();
    return '<div class="ui-seg" role="group" aria-label="Appearance">' + [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']].map(function (o) {
      return '<button type="button" data-theme-set="' + o[0] + '" class="' + (t === o[0] ? 'on' : '') + '">' + o[1] + '</button>';
    }).join('') + '</div>';
  }

  function userMenu(me) {
    return '<div class="ui-menu" data-menu hidden>' +
      '<div class="ui-menu-head"><strong>' + esc(me.name) + '</strong><span class="muted small">' + esc(me.email) + '</span></div>' +
      '<a href="#profile" data-go="profile">' + UI.icon('user') + 'Your profile</a>' +
      (me.is_admin ? '<a href="#admin" data-go="admin">' + UI.icon('shield') + 'Admin</a>' : '') +
      '<div class="ui-menu-block"><span class="small muted">Appearance</span>' + themeSwitch() + '</div>' +
      '<button type="button" data-feedback>' + UI.icon('chat') + 'Submit feedback</button>' +
      '<button type="button" data-lk-open="overview">' + UI.icon('lock') + 'Privacy &amp; Terms</button>' +
      '<button type="button" data-signout>' + UI.icon('logout') + 'Sign out</button></div>';
  }

  UI.shell = {
    header: function (me, active) {
      var nav = UI.navPages();
      return '<div class="ui-header-in">' + brand() +
        (nav.length ? '<nav class="ui-nav" aria-label="Main">' + nav.map(function (p) {
          return '<a href="#' + p.name + '" class="' + (p.name === active ? 'on' : '') + '">' + UI.icon(p.icon) + '<span>' + esc(p.nav) + '</span></a>';
        }).join('') + '</nav>' : '') +
        '<div class="ui-header-right">' +
        (me ? '<button type="button" class="ui-avatar-btn" data-menu-toggle aria-label="Your account" aria-haspopup="true">' + esc(UI.initials(me.name)) + '</button>' + userMenu(me)
          : (active === 'auth' ? '' : '<a class="ui-btn ghost" href="#auth" data-go="auth">Sign in</a>' +
            (active === 'build' ? '' : '<a class="ui-btn primary" href="#build" data-go="build">Try it free</a>'))) +
        '</div></div>';
    },
    footer: function (me) {
      return '<div class="ui-footer-in"><div class="ui-footer-brand">' + brand() + '<p class="muted small">' + esc(UI.config.tagline) + '</p></div>' +
        '<div class="ui-footer-links">' +
        '<a href="#landing" data-go="landing">About</a>' +
        '<a href="#guide" data-go="guide">Field guide</a>' +
        '<a href="#guide/sources" data-go="guide/sources">Sources</a>' +
        '<a href="https://prepsto.com/#f/ftg7ber" target="_blank" rel="noopener" data-prepsto-open>Submit feedback</a>' +
        '<button type="button" data-lk-open="overview">Privacy &amp; Terms</button>' +
        '</div><p class="ui-footer-legal small muted">© ' + new Date().getFullYear() + ' ' + esc(UI.config.name) + '</p></div>';
    },
    tabbar: function (me, active) {
      var nav = UI.navPages();
      if (!me) nav = [{ name: 'build', nav: 'Try it', icon: 'sparkle' }].concat(nav);
      if (nav.length < 2) return '';
      var tab = function (name, label, icon) {
        var on = name === active || (name === 'build' && active === 'plan');
        return '<a href="#' + name + '" class="' + (on ? 'on' : '') + '">' + UI.icon(icon) + '<span>' + esc(label) + '</span></a>';
      };
      return nav.slice(0, 4).map(function (p) { return tab(p.name, p.nav, p.icon); }).join('') +
        (me ? tab('profile', 'You', 'user') : tab('auth', 'Sign in', 'user'));
    },
    wire: function (root) {
      root.addEventListener('click', function (e) {
        var t = e.target.closest('[data-menu-toggle]');
        var menu = root.querySelector('[data-menu]');
        if (t && menu) { menu.hidden = !menu.hidden; t.setAttribute('aria-expanded', String(!menu.hidden)); return; }
        if (e.target.closest('[data-signout]')) { UI.auth('logout').then(function () { UI.toast('Signed out. See you soon!'); }); }
        if (menu && !menu.hidden && !e.target.closest('[data-menu] .ui-seg')) menu.hidden = true;
      });
      document.addEventListener('keydown', function (e) {
        var menu = root.querySelector('[data-menu]');
        if (e.key === 'Escape' && menu) menu.hidden = true;
      });
    },
    onTheme: function () {  // redraw the menu's Auto/Light/Dark buttons and keep the menu open
      var menu = document.querySelector('[data-menu]'), open = menu && !menu.hidden;
      UI.renderChrome();
      if (open) document.querySelector('[data-menu]').hidden = false;
    }
  };
})();


/* ===== _library.html ===== */
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

  /* Extra icons this app uses (UI.icon reads UI.ICONS). */
  UI.ICONS.target = '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>';
  UI.ICONS.megaphone = '<path d="M3 10v4h3l8 5V5L6 10z"/><path d="M17.5 9a4 4 0 0 1 0 6M20 6.5a7.5 7.5 0 0 1 0 11"/>';
  UI.ICONS.chart = '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>';
  UI.ICONS.book = '<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H20v15H5.5A1.5 1.5 0 0 0 4 19.5z"/><path d="M4 19.5A1.5 1.5 0 0 0 5.5 21H20v-3"/>';
  UI.ICONS.calc = '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01"/>';
  UI.ICONS.trophy = '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 21h8M9.5 17h5"/>';
  UI.ICONS.download = '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>';
  UI.ICONS.clap = '<path d="M7 11.5 4.6 9.1a1.6 1.6 0 0 1 2.3-2.3l4.6 4.6"/><path d="M9.3 6.9 8.2 5.8a1.6 1.6 0 0 1 2.3-2.3l5.7 5.7"/><path d="m11.4 6.4 1.5-1.5a1.6 1.6 0 0 1 2.3 2.3"/><path d="M16.2 9.2c1.3-1 2.9-.4 3.1 1.1.3 2.2-.4 5-2.5 7.1a6.5 6.5 0 0 1-9.2 0L4.7 14.5a1.6 1.6 0 0 1 2.3-2.3l2.2 2.2"/>';
  UI.ICONS.note = '<path d="M5 3h10l4 4v14H5z"/><path d="M14 3v5h5M8 12h8M8 16h5"/>';
  UI.ICONS.flag = '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>';
})();

/* ===== admin.html ===== */
(function () {
  var esc = UI.esc;
  var TABS = [['overview', 'Overview', 'grid'], ['feedback', 'Feedback', 'inbox'], ['users', 'Users', 'users'], ['wins', 'Wins', 'trophy'],
    ['prompts', 'Prompts', 'copy'], ['demo', 'Demo data', 'database']];

  UI.page('admin', { title: 'Admin', auth: 'admin' }, function (view, ctx) {
    var tab = TABS.some(function (t) { return t[0] === ctx.args[0]; }) ? ctx.args[0] : 'overview';
    var fbFilter = 'new';
    view.innerHTML = '<div class="ui-wrap"><div class="ui-page-head"><div><h1>Admin</h1><p class="muted">Only admins see this page.</p></div></div>' +
      '<nav class="ui-tabs">' + TABS.map(function (t) {
        return '<a href="#admin/' + t[0] + '" class="' + (t[0] === tab ? 'on' : '') + '">' + UI.icon(t[2]) + t[1] + '</a>';
      }).join('') + '</nav><div data-body><div class="ui-skel"></div></div></div>';
    var body = view.querySelector('[data-body]');

    function overview() {
      return UI.api('admin_overview').then(function (d) {
        var stat = function (n, label, go) { return '<a class="ui-card ui-stat" href="#admin/' + go + '" style="text-decoration:none;color:inherit"><b>' + n + '</b><span>' + label + '</span></a>'; };
        body.innerHTML = '<div class="ad-stats">' + stat(d.users, 'people signed up', 'users') + stat(d.admins, UI.plural(d.admins, 'admin').replace(/^\d+ /, ''), 'users') +
          stat(d.feedback_new, 'new feedback', 'feedback') + stat(d.plans, 'plans saved', 'overview') + stat(d.wins, 'wins shared', 'wins') +
          stat(d.wins_hidden, 'wins hidden', 'wins') + stat(d.copies, 'prompts copied', 'prompts') + '</div>' +
          '<p class="muted small" style="margin-top:18px">Demo data is <b>' + esc(d.demo.state) + '</b> (' + d.demo.counts.users + ' demo people). Manage it in the Demo data tab.</p>';
      });
    }

    function feedback() {
      return UI.api('list_feedback', null).then(function (d) {
        var items = d.items.filter(function (i) { return fbFilter === 'all' || i.status === fbFilter; });
        body.innerHTML = '<div class="ui-row" style="margin-bottom:16px"><div class="ui-seg">' + [['new', 'New'], ['read', 'Read'], ['done', 'Done'], ['all', 'All']].map(function (f) {
          var n = f[0] === 'all' ? d.items.length : d.counts[f[0]];
          return '<button data-filter="' + f[0] + '" class="' + (fbFilter === f[0] ? 'on' : '') + '">' + f[1] + ' (' + n + ')</button>';
        }).join('') + '</div></div>' +
          (items.length ? '<div class="ad-fb">' + items.map(function (i) {
            var c = i.context || {};
            return '<div class="ui-item" data-id="' + esc(i.id) + '"><div class="meta"><span class="ui-badge ' + (i.kind === 'bug' ? 'bad' : i.kind === 'idea' ? 'brand' : '') + '">' + esc(i.kind_label) + '</span>' +
              '<b>' + esc(i.name) + '</b>' + (i.email ? '<a href="mailto:' + esc(i.email) + '">' + esc(i.email) + '</a>' : '') + '<span>' + esc(UI.fmtDateTime(i.created)) + '</span></div>' +
              '<p class="msg">' + esc(i.message) + '</p>' +
              '<div class="ctx">' + esc([c.page, c.screen, c.theme, c.browser].filter(Boolean).join(' · ')) + '</div>' +
              '<textarea data-note placeholder="Private note (only admins see it)">' + esc(i.note) + '</textarea>' +
              '<div class="ui-row" style="margin-top:10px">' + ['new', 'read', 'done'].map(function (s) {
                return '<button class="ui-btn sm' + (i.status === s ? ' primary' : '') + '" data-status="' + s + '">' + s[0].toUpperCase() + s.slice(1) + '</button>';
              }).join('') + '<span class="ui-spacer"></span><button class="ui-btn sm danger" data-del-fb>' + UI.icon('trash') + 'Delete</button></div></div>';
          }).join('') + '</div>'
            : '<div class="ui-empty">' + UI.icon('inbox') + '<h3>No ' + (fbFilter === 'all' ? '' : fbFilter + ' ') + 'messages</h3><p>New feedback goes to Prepsto (prepsto.com). Older messages and requests from the app show up here.</p></div>');
      });
    }

    function users(query) {
      return UI.api('list_users', query || null).then(function (d) {
        body.innerHTML = '<form class="ui-row" data-search style="margin-bottom:14px"><input type="search" name="q" placeholder="Search by name or email" value="' + esc(query || '') + '" style="max-width:360px">' +
          '<button class="ui-btn" type="submit">' + UI.icon('search') + 'Search</button><span class="muted small">' + UI.plural(d.total, 'person', 'people') + '</span></form>' +
          '<table class="ad-users"><thead><tr><th>Name</th><th>Email</th><th>Joined</th><th>Admin</th><th>Active</th></tr></thead><tbody>' +
          d.users.map(function (u) {
            return '<tr data-id="' + esc(u.id) + '"><td><b>' + esc(u.name) + '</b></td><td class="email">' + esc(u.email) + '</td><td class="joined muted">' + esc(UI.fmtDate(u.joined)) + '</td>' +
              '<td><label class="ui-check"><input type="checkbox" data-admin' + (u.is_admin ? ' checked' : '') + '> Admin</label></td>' +
              '<td><label class="ui-check"><input type="checkbox" data-enabled' + (u.enabled ? ' checked' : '') + '> Active</label></td></tr>';
          }).join('') + '</tbody></table>';
      });
    }

    function demo() {
      return UI.api('admin_overview').then(function (d) {
        var c = d.demo.counts;
        body.innerHTML = '<div class="ui-card ui-narrow" style="margin:0"><h3>Demo data</h3>' +
          '<p class="muted">Example people and content, so the app never looks empty for the first visitors. Demo rows are flagged, so removing them never touches real data. Once removed, it stays removed until you load it again.</p>' +
          '<p>Status: <b>' + esc(d.demo.state) + '</b> · ' + Object.keys(c).map(function (k) { return c[k] + ' ' + esc(k); }).join(', ') + '</p>' +
          '<div class="ui-row"><button class="ui-btn primary" data-demo="load">' + UI.icon('refresh') + (d.demo.state === 'loaded' ? 'Reload demo data' : 'Load demo data') + '</button>' +
          '<button class="ui-btn danger" data-demo="remove">' + UI.icon('trash') + 'Remove demo data</button></div></div>';
      });
    }

    function wins() {
      return UI.api('list_wins', null).then(function (d) {
        body.innerHTML = d.wins.length ? '<p class="muted small">Hidden wins are only visible to admins. Demo wins are managed in the Demo data tab.</p><div class="ad-fb">' + d.wins.map(function (w) {
          return '<div class="ui-item" data-win="' + esc(w.id) + '"><div class="meta"><span class="ui-badge brand">' + esc(MG.label(MG.CHANNELS, w.channel)) + '</span>' +
            (w.demo ? '<span class="ui-badge warn">Example</span>' : '') + (w.hidden ? '<span class="ui-badge bad">Hidden</span>' : '') +
            '<b>' + esc(w.author) + '</b><span>' + esc(UI.fmtDateTime(w.created)) + '</span><span>' + w.claps + ' claps</span></div>' +
            '<p class="msg"><b>' + esc(w.title) + '</b>\n' + esc(w.story) + (w.result ? '\n= ' + esc(w.result) : '') + '</p>' +
            '<div class="ui-row"><button class="ui-btn sm" data-hide="' + (w.hidden ? '0' : '1') + '">' + UI.icon(w.hidden ? 'check' : 'x') + (w.hidden ? 'Show again' : 'Hide') + '</button>' +
            '<span class="ui-spacer"></span><button class="ui-btn sm danger" data-del-win>' + UI.icon('trash') + 'Delete</button></div></div>';
        }).join('') + '</div>' : '<div class="ui-empty">' + UI.icon('trophy') + '<h3>No wins yet</h3><p>Wins people share on the board show up here.</p></div>';
      });
    }

    function prompts() {
      return UI.api('admin_prompt_stats').then(function (d) {
        var max = d.prompts.length ? d.prompts[0].copies : 1;
        body.innerHTML = '<p class="muted">How often each prompt was copied or opened in an AI chat (anonymous counts). ' + UI.plural(d.total, 'copy', 'copies') + ' in total.</p>' +
          (d.prompts.length ? '<table class="ad-users"><thead><tr><th>Prompt</th><th>Stage</th><th>Copies</th><th>Last</th></tr></thead><tbody>' + d.prompts.map(function (p) {
            var m = MG.prompt(p.id);
            return '<tr><td><b>' + esc(m ? m.title : p.id) + '</b><div style="height:6px;margin-top:6px;background:var(--c-brand);border-radius:2px;width:' + Math.max(3, 100 * p.copies / max) + '%"></div></td>' +
              '<td class="muted">' + esc(m ? MG.label(MG.STAGES.map(function (s) { return [s.id, s.title]; }), m.stage) : '') + '</td><td>' + p.copies + '</td><td class="joined muted">' + esc(UI.ago(p.last)) + '</td></tr>';
          }).join('') + '</tbody></table>' : '<div class="ui-empty">' + UI.icon('copy') + '<h3>Nothing copied yet</h3><p>Counts appear once people copy prompts from their playbooks.</p></div>');
      });
    }

    var DRAW = { overview: overview, feedback: feedback, users: users, wins: wins, prompts: prompts, demo: demo };

    view.addEventListener('click', function (e) {
      var f = e.target.closest('[data-filter]');
      if (f) { fbFilter = f.getAttribute('data-filter'); feedback(); return; }
      var st = e.target.closest('[data-status]');
      if (st) {
        var card = st.closest('[data-id]');
        UI.api('set_feedback_status', card.getAttribute('data-id'), st.getAttribute('data-status'), card.querySelector('[data-note]').value).then(function () { UI.toast('Saved', 'ok'); feedback(); });
        return;
      }
      var del = e.target.closest('[data-del-fb]');
      if (del) {
        UI.confirm({ title: 'Delete this message?', ok: 'Delete', danger: true }).then(function (yes) {
          if (yes) UI.api('delete_feedback', del.closest('[data-id]').getAttribute('data-id')).then(feedback);
        });
        return;
      }
      var hw = e.target.closest('[data-hide]');
      if (hw) { UI.api('set_win_hidden', hw.closest('[data-win]').getAttribute('data-win'), hw.getAttribute('data-hide') === '1').then(function () { UI.toast('Saved', 'ok'); wins(); }); return; }
      var dw = e.target.closest('[data-del-win]');
      if (dw) {
        UI.confirm({ title: 'Delete this win?', text: 'This can\'t be undone.', ok: 'Delete', danger: true }).then(function (yes) {
          if (yes) UI.api('delete_win', dw.closest('[data-win]').getAttribute('data-win')).then(wins);
        });
        return;
      }
      var dm = e.target.closest('[data-demo]');
      if (dm) {
        var load = dm.getAttribute('data-demo') === 'load';
        UI.confirm({ title: load ? 'Load the demo data?' : 'Remove the demo data?', text: load ? 'Demo people and content are added (any old demo rows are replaced).' : 'Every demo row is deleted. Real data stays.', ok: load ? 'Load' : 'Remove', danger: !load })
          .then(function (yes) { if (yes) UI.busy(dm, UI.api(load ? 'demo_load' : 'demo_remove')).then(function () { UI.toast('Done', 'ok'); demo(); }); });
      }
    });
    view.addEventListener('change', function (e) {
      var row = e.target.closest('tr[data-id]');
      if (!row) return;
      var id = row.getAttribute('data-id'), box = e.target;
      var fn = box.hasAttribute('data-admin') ? 'set_admin' : box.hasAttribute('data-enabled') ? 'set_enabled' : null;
      if (fn) UI.api(fn, id, box.checked).then(function () { UI.toast('Saved', 'ok'); }, function (err) { box.checked = !box.checked; UI.toast(err.message, 'error'); });
    });
    view.addEventListener('submit', function (e) {
      if (e.target.matches('[data-search]')) { e.preventDefault(); users(UI.formData(e.target).q); }
    });
    return DRAW[tab]();
  });
})();

/* ===== auth.html ===== */
(function () {
  var esc = UI.esc;
  var GOOGLE_G = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>' +
    '<path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>' +
    '<path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>' +
    '<path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';
  function pw(name, auto) {
    return '<div class="au-pw"><input type="password" name="' + name + '" autocomplete="' + auto + '" required minlength="8">' +
      '<button type="button" data-show>Show</button></div>';
  }
  UI.page('auth', { title: 'Sign in', auth: 'guest' }, function (view, ctx) {
    var mode = ['signup', 'reset'].indexOf(ctx.args[0]) >= 0 ? ctx.args[0] : 'login';
    function draw(msg, isErr) {
      var heading = { login: 'Welcome back', signup: 'Create your account', reset: 'Reset your password' }[mode];
      var sub = { login: 'Sign in to continue to ' + esc(UI.config.name) + '.', signup: 'It\'s free and takes a few seconds.',
        reset: 'We\'ll email you a link to choose a new password.' }[mode];
      view.innerHTML = '<div class="au-wrap"><div class="ui-card au-card">' +
        '<h1>' + heading + '</h1><p class="muted">' + sub + '</p>' +
        (mode !== 'reset' ? '<div class="ui-seg" role="tablist"><button type="button" data-mode="login" class="' + (mode === 'login' ? 'on' : '') + '">Sign in</button>' +
          '<button type="button" data-mode="signup" class="' + (mode === 'signup' ? 'on' : '') + '">Create account</button></div>' : '<div style="height:14px"></div>') +
        '<form class="ui-stack" data-form="' + mode + '" novalidate>' +
        (mode === 'signup' ? '<label class="ui-field"><span>Your name</span><input type="text" name="name" autocomplete="name" required maxlength="60"></label>' : '') +
        '<label class="ui-field"><span>Email</span><input type="email" name="email" autocomplete="email" required></label>' +
        (mode === 'login' ? '<label class="ui-field"><span>Password</span>' + pw('password', 'current-password') + '</label>' : '') +
        (mode === 'signup' ? '<label class="ui-field"><span>Password <em>(at least 8 characters)</em></span>' + pw('password', 'new-password') + '</label>' +
          (window.LegalKit ? '<div>' + LegalKit.consentField() + '</div>' : '') : '') +
        '<div data-msg role="alert"' + (msg ? ' class="' + (isErr ? 'ui-error' : 'ui-note') + '">' + esc(msg) : ' hidden>') + '</div>' +
        '<button class="ui-btn primary block" type="submit">' + { login: 'Sign in', signup: 'Create account', reset: 'Send the link' }[mode] + '</button></form>' +
        (mode !== 'reset' ? '<div class="au-or">or</div><button type="button" class="ui-btn block au-google" data-google>' + GOOGLE_G + 'Continue with Google</button>' : '') +
        '<div class="au-links">' + (mode === 'login' ? '<a data-mode="reset">Forgot your password?</a>' : '<a data-mode="login">' + UI.icon('back') + ' Back to sign in</a>') +
        '<a href="#landing" data-go="landing">About ' + esc(UI.config.name) + '</a></div></div></div>';
      var first = view.querySelector('input');
      if (first && !msg) first.focus();
    }
    view.addEventListener('click', function (e) {
      var m = e.target.closest('[data-mode]');
      if (m) { e.preventDefault(); mode = m.getAttribute('data-mode'); history.replaceState(null, '', '#auth' + (mode === 'login' ? '' : '/' + mode)); draw(); return; }
      var g = e.target.closest('[data-google]');
      if (g) { google(g); return; }
      var s = e.target.closest('[data-show]');
      if (s) { var i = s.parentNode.querySelector('input'); i.type = i.type === 'password' ? 'text' : 'password'; s.textContent = i.type === 'password' ? 'Show' : 'Hide'; }
    });
    view.addEventListener('submit', function (e) {
      e.preventDefault();
      var form = e.target, v = UI.formData(form);
      var problem = !/^\S+@\S+\.\S+$/.test(v.email || '') ? 'Please enter a valid email address.'
        : mode !== 'reset' && (v.password || '').length < (mode === 'signup' ? 8 : 1) ? (mode === 'signup' ? 'Please choose a password of at least 8 characters.' : 'Please enter your password.')
        : mode === 'signup' && (v.name || '').trim().length < 2 ? 'Please tell us your name.' : null;
      if (problem) { say(problem, true); return; }
      if (mode === 'signup' && window.LegalKit && !LegalKit.consentChecked(form)) return;  // the kit shows its own message
      UI.busy(form.querySelector('[type=submit]'), UI.auth(mode, v)).then(function (r) {
        if (mode === 'reset' || (r && !r.me)) { mode = 'login'; draw(r && r.message, false); restore({ email: v.email }); }
        else UI.toast(mode === 'signup' ? 'Welcome to ' + UI.config.name + '!' : 'Welcome back!', 'ok');
      }, function (err) { say(err.message, true); });
    });
    // Sign-up asks for the Privacy & Terms tick here too (ticking it is remembered for the new account).
    function google(btn) {
      var form = view.querySelector('form'), v = mode === 'signup' ? UI.formData(form) : {};
      if (mode === 'signup' && window.LegalKit && !LegalKit.consentChecked(form)) return;
      UI.busy(btn, UI.auth('google', { name: (v.name || '').trim() })).then(function () {
        UI.toast(mode === 'signup' ? 'Welcome to ' + UI.config.name + '!' : 'Welcome back!', 'ok');
      }, function (err) { say(err.message, true); });
    }
    function say(msg, isErr) {
      var box = view.querySelector('[data-msg]');
      box.className = isErr ? 'ui-error' : 'ui-note'; box.textContent = msg; box.hidden = false;
    }
    function restore(v) {
      ['name', 'email'].forEach(function (k) { var i = view.querySelector('[name=' + k + ']'); if (i && v[k]) i.value = v[k]; });
    }
    draw();
  });
})();

/* ===== build.html ===== */
(function () {
  var esc = UI.esc;

  function choices(name, list, val, cls, sub) {
    return '<div class="ui-choices ' + (cls || '') + '">' + list.map(function (o) {
      return '<label class="ui-choice"><input type="radio" name="' + name + '" value="' + esc(o[0]) + '"' + (String(val) === o[0] ? ' checked' : '') + '>' +
        '<span><b>' + esc(o[1]) + '</b>' + (sub && o[2] ? '<small>' + esc(o[2]) + '</small>' : '') + '</span></label>';
    }).join('') + '</div>';
  }
  function field(name, labelText, val, opts) {
    opts = opts || {};
    var tag = opts.area ? '<textarea name="' + name + '" rows="3" maxlength="' + (opts.max || 300) + '" placeholder="' + esc(opts.ph || '') + '">' + esc(val || '') + '</textarea>'
      : '<input type="' + (opts.type || 'text') + '" name="' + name + '" value="' + esc(val == null ? '' : val) + '" maxlength="' + (opts.max || 200) + '" placeholder="' + esc(opts.ph || '') + '"' +
        (opts.req ? ' required' : '') + (opts.type === 'number' ? ' min="0" step="1" inputmode="numeric"' : '') + '>';
    return '<label class="ui-field"><span>' + labelText + '</span>' + tag + (opts.hint ? '<p class="ui-hint">' + opts.hint + '</p>' : '') + '</label>';
  }

  function read(form) {
    var v = UI.formData(form), has = {};
    MG.HAS.forEach(function (h) { if (v['has_' + h[0]]) has[h[0]] = true; delete v['has_' + h[0]]; });
    v.has = has;
    return v;
  }

  UI.page('build', { title: 'Describe your business' }, function (view, ctx) {
    var arg = ctx.args[0] || '', planId = arg && arg !== 'local' ? arg : null;
    var guest = UI.store.get('guestPlan', null);
    view.innerHTML = '<div class="ui-wrap"><div class="ui-skel" style="height:420px"></div></div>';

    function draw(p, editing) {
      var stats = MG.count(p);
      view.innerHTML = '<div class="ui-wrap"><div class="ui-page-head"><div><div class="eyebrow">' + (editing ? 'Edit your plan' : 'New plan · about 3 minutes') + '</div>' +
        '<h1>Tell Marguru about <em>your business</em></h1><p class="muted">The more specific you are, the better every prompt gets. Anything you skip becomes a [bracket] to fill in later.</p></div>' +
        '<div class="bd-tools"><button type="button" class="ui-btn sm" data-example>' + UI.icon('sparkle') + 'Fill with an example</button></div></div>' +
        '<form class="bd" data-build novalidate><div>' +
        '<section class="ui-card bd-sec"><span class="num">Part 1</span><h2>The basics</h2><p class="muted">What you are and what you sell.</p><div class="ui-stack">' +
          '<div class="bd-row">' + field('name', 'Business name', p.name, { req: true, max: 80, ph: 'Crumb & Co.' }) +
          field('site_url', 'Website <em>(optional)</em>', p.site_url, { max: 200, ph: 'crumbandco.ca' }) + '</div>' +
          field('what', 'What do you sell?', p.what, { req: true, max: 200, ph: 'Sourdough bread, pastries and custom cakes', hint: 'In your customers\' words, not your industry\'s.' }) +
          '<div class="ui-field"><span>What kind of business?</span>' + choices('type', MG.TYPES, p.type, 'types', true) + '</div>' +
        '</div></section>' +
        '<section class="ui-card bd-sec"><span class="num">Part 2</span><h2>Your customers</h2><p class="muted">Who buys, where, and how much.</p><div class="ui-stack">' +
          '<div class="ui-field"><span>Where are your customers?</span>' + choices('reach', MG.REACH, p.reach, '', true) + '</div>' +
          field('where', 'Where exactly?', p.where, { max: 120, ph: 'Verdun, Montréal (or: Canada and the US)' }) +
          field('customer', 'Who is your best customer?', p.customer, { area: true, max: 300, ph: 'Young families within a 10-minute walk; parents ordering birthday cakes a week ahead' }) +
          '<div class="bd-row">' + field('price', 'Average sale, in dollars', p.price || '', { type: 'number', max: 9, ph: '18' }) +
          '<div class="ui-field"><span>How often do they buy again?</span>' + choices('repeat', MG.REPEAT, p.repeat) + '</div></div>' +
        '</div></section>' +
        '<section class="ui-card bd-sec"><span class="num">Part 3</span><h2>Your goal</h2><p class="muted">What you want from marketing in the next 90 days, and what you can spend on ads.</p><div class="ui-stack">' +
          '<div class="ui-field"><span>Main goal</span>' + choices('goal', MG.GOALS, p.goal) + '</div>' +
          '<div class="ui-field"><span>Monthly ad budget</span>' + choices('budget', MG.BUDGETS, p.budget) +
          '<p class="ui-hint">$0 is fine: there\'s a lot to do for free first. Paid-ads prompts appear when you add a budget.</p></div>' +
        '</div></section>' +
        '<section class="ui-card bd-sec"><span class="num">Part 4</span><h2>What you have</h2><p class="muted">So Marguru doesn\'t tell you to build what you already have.</p><div class="ui-stack">' +
          '<div class="ui-field"><span>You already have</span><div class="bd-checks">' + MG.HAS.map(function (h) {
            return '<label class="ui-check"><input type="checkbox" name="has_' + h[0] + '"' + ((p.has || {})[h[0]] ? ' checked' : '') + '><span>' + esc(h[1]) + '</span></label>';
          }).join('') + '</div></div>' +
          field('edge', 'Why do people choose you over others?', p.edge, { area: true, max: 300, ph: 'Bread baked at 5 a.m. daily; custom cakes on 72 hours\' notice' }) +
          field('competitors', 'Main competitors <em>(optional)</em>', p.competitors, { max: 200, ph: 'A chain café two blocks away; supermarket bakeries' }) +
          field('tried', 'What have you tried already? <em>(optional)</em>', p.tried, { area: true, max: 400, ph: 'Instagram now and then; flyers once' }) +
          '<div class="ui-field"><span>How should your brand sound?</span>' + choices('voice', MG.VOICES, p.voice) + '</div>' +
        '</div></section>' +
        '<div class="bd-mob"><div><b data-n>' + stats.prompts + '</b> <span class="small muted">prompts</span></div><button class="ui-btn primary" type="submit">' + (editing ? 'Save changes' : 'Build my playbook') + UI.icon('arrow') + '</button></div>' +
        '</div><aside class="bd-side"><div class="ui-card bd-count"><div class="eyebrow">Your playbook</div><span class="big" data-n>' + stats.prompts + '</span>' +
          '<div>prompts across <b data-s>' + stats.stages + '</b> stages</div><div class="stg" data-stg></div>' +
          '<button class="ui-btn primary block lg" type="submit">' + (editing ? 'Save changes' : 'Build my playbook') + '</button>' +
          (UI.me ? '' : '<p class="ui-hint" style="margin-top:12px">No account needed. Your plan stays in this browser until you sign up.</p>') +
        '</div><div class="ui-card flat" style="margin-top:16px"><p class="small muted" style="margin:0"><b>Guru tip:</b> ' + esc(MG.tipOfDay()[0]) + '</p></div></aside></form></div>';
      update();
    }

    function update() {
      var form = view.querySelector('[data-build]');
      if (!form) return;
      var b = MG.build(read(form));
      view.querySelectorAll('[data-n]').forEach(function (el) { el.textContent = b.prompts.length; });
      view.querySelectorAll('[data-s]').forEach(function (el) { el.textContent = b.stages.length; });
      var stg = view.querySelector('[data-stg]');
      if (stg) stg.innerHTML = b.stages.map(function (s) { return '<span class="ui-badge">' + esc(s.title) + ' ' + s.prompts.length + '</span>'; }).join('');
    }

    view.addEventListener('input', update);
    view.addEventListener('change', update);
    view.addEventListener('click', function (e) {
      if (!e.target.closest('[data-example]')) return;
      draw(Object.assign(MG.blank(), MG.EXAMPLE), !!planId);
      UI.toast('Filled in with an example bakery. Change anything you like.');
    });
    view.addEventListener('submit', function (e) {
      e.preventDefault();
      var form = e.target, p = read(form);
      if (String(p.name || '').trim().length < 2) { UI.toast('What\'s your business called?', 'error'); form.querySelector('[name=name]').focus(); return; }
      if (String(p.what || '').trim().length < 3) { UI.toast('Say what you sell, in a few words.', 'error'); form.querySelector('[name=what]').focus(); return; }
      if (!p.type) p.type = 'other';
      var btn = e.submitter || form.querySelector('[type=submit]');
      if (UI.me) {
        UI.busy(btn, UI.api('save_plan', p, planId)).then(function (r) {
          UI.toast(planId ? 'Saved.' : 'Your playbook is ready.', 'ok');
          UI.go('plan', r.plan.id);
        });
      } else {
        var old = UI.store.get('guestPlan', null);
        UI.store.set('guestPlan', { profile: p, progress: (old && old.progress) || { done: {}, star: [], notes: {} }, updated: new Date().toISOString() });
        UI.go('plan', 'local');
      }
    });

    if (planId && UI.me) return UI.api('get_plan', planId).then(function (r) { draw(Object.assign(MG.blank(), r.plan.profile), true); });
    if (arg === 'local' && guest) { draw(Object.assign(MG.blank(), guest.profile), true); return Promise.resolve(); }
    draw(MG.blank(), false);
    return Promise.resolve();
  });
})();

/* ===== guide.html ===== */
(function () {
  var esc = UI.esc;
  var SECTIONS = [['short', 'The short answer'], ['jobs', 'The 8 jobs'], ['boom', 'Why everyone opens one'], ['cost', 'What it costs'],
    ['flags', 'Red flags'], ['diy', 'DIY or hire?'], ['words', 'Jargon buster'], ['sources', 'Sources']];

  var INVOICE = {
    strategy: 'On the invoice: "onboarding", "strategy session", "marketing plan".',
    maps: 'On the invoice: "GBP optimisation", "local SEO", "reputation management", "citation building".',
    site: 'On the invoice: "landing page", "CRO" (conversion rate optimisation), "website refresh".',
    seo: 'On the invoice: "SEO retainer", "content", "on-page optimisation", "link building".',
    gads: 'On the invoice: "PPC management", "Google Ads management" (a flat fee or a share of ad spend).',
    social: 'On the invoice: "paid social", "Meta ads management", "creative production", "UGC".',
    content: 'On the invoice: "social media management", "content calendar", "email marketing".',
    measure: 'On the invoice: "reporting", "analytics setup", "tracking", "monthly review call".'
  };

  var FLAGS = [
    ['They guarantee rankings, a number of leads or a return.', 'yes'],
    ['They contacted you out of the blue (cold email, DM or call).', 'yes'],
    ['They can\'t explain clearly what they will do each month.', 'yes'],
    ['The ad accounts, Google profile or website would be in their name.', 'yes'],
    ['Their fee isn\'t shown separately from your ad spend.', 'yes'],
    ['They offer review "packages" or to "boost" your rating.', 'yes'],
    ['They showed real examples of past work and offered references.', 'no'],
    ['They said what results to expect, by when, and how they\'ll measure it.', 'no'],
    ['They told you who will actually do the work (their staff or a partner).', 'no'],
    ['You can leave on short notice and keep your accounts, data and content.', 'no']
  ];

  var WORDS = [
    ['Agency retainer', 'A fixed monthly fee for ongoing work, usually on top of what you pay Google or Meta for the ads themselves.'],
    ['Ad spend', 'The money paid to the ad platform (Google, Meta, TikTok) for clicks or views. Separate from any management fee.'],
    ['CPC (cost per click)', 'What you pay, on average, each time someone clicks your ad.'],
    ['CTR (click-through rate)', 'The share of people who saw the ad and clicked it.'],
    ['Conversion', 'The action you want: a call, form, booking or purchase. "Conversion rate" is the share of visitors who do it.'],
    ['CPL (cost per lead)', 'Ad spend divided by the number of enquiries it brought.'],
    ['CPA / CAC', 'Cost per acquisition / customer acquisition cost: what it costs to win one paying customer.'],
    ['ROAS', 'Return on ad spend: revenue from ads divided by what the ads cost. 4 means $4 back for each $1 spent (before other costs).'],
    ['LTV (lifetime value)', 'What a customer is worth over all their purchases, not just the first.'],
    ['Impressions / reach', 'How many times an ad was shown / how many different people saw it. Nice to know, not the goal.'],
    ['PPC', 'Pay-per-click advertising, mostly Google and Bing search ads.'],
    ['SEO', 'Search engine optimisation: earning free (organic) visits from search by making pages that answer searches well.'],
    ['SERP', 'Search engine results page: what Google shows for a search.'],
    ['Local pack / map pack', 'The map with a few businesses that Google shows for local searches.'],
    ['GBP', 'Google Business Profile, your free listing on Google Search and Maps (formerly Google My Business).'],
    ['NAP', 'Name, Address, Phone. It should match everywhere you are listed.'],
    ['Citation', 'Any listing of your business details on another site (directories, maps apps, review sites).'],
    ['Backlink', 'A link to your site from another website. Google counts links as a sign of prominence.'],
    ['Keyword / match type', 'The words you bid on in Google Ads; match type (broad, phrase, exact) controls how loosely Google matches searches to them.'],
    ['Negative keyword', 'A word that stops your ad showing (for example "jobs" or "free").'],
    ['Search terms report', 'The list of what people actually typed before clicking your Google ad.'],
    ['RSA', 'Responsive search ad: up to 15 headlines (30 characters) and 4 descriptions (90 characters) that Google mixes.'],
    ['Performance Max (PMax)', 'A Google Ads campaign type where Google\'s automation places ads across Search, YouTube, Maps, Gmail and more.'],
    ['Pixel / Conversions API', 'Meta\'s tracking code on your site, and its server-to-server version, so Meta can see which ads led to results.'],
    ['Learning phase', 'Meta\'s period of testing delivery for a new or changed ad set; usually needs about 50 results in 7 days to finish.'],
    ['Retargeting', 'Showing ads to people who already visited your site or engaged with you.'],
    ['Lookalike audience', 'People an ad platform thinks resemble your customers.'],
    ['Landing page', 'The page an ad sends people to, built for one offer and one action.'],
    ['UTM tags', 'Labels added to a link (utm_source, utm_medium, utm_campaign) so analytics shows where visitors came from.'],
    ['A/B test', 'Showing two versions (of an ad, a page) to see which does better.'],
    ['E-E-A-T', 'Experience, Expertise, Authoritativeness, Trust: how Google describes what helpful content shows. Trust matters most.'],
    ['UGC', 'User-generated content: photos and videos made by customers (or creators paid to look like customers).'],
    ['SMMA', 'Social media marketing agency. Also the name of a popular "start an agency" business-course trend.'],
    ['White-label', 'Work done by one company and sold under another\'s brand. Many small agencies resell partners\' SEO, ads or web work.']
  ];

  var SOURCES = [
    ['Primary source', 'Google Business Profile Help: Tips to improve your local ranking on Google', 'https://support.google.com/business/answer/7091',
      'Local results depend mainly on relevance, distance and prominence; "There\'s no way to request or pay for a better local ranking"; complete info, reviews and replies help.'],
    ['Primary source', 'Google Maps contribution policy: Fake engagement', 'https://support.google.com/contributionpolicy/answer/7400114',
      'No incentives for reviews; no discouraging negative reviews or "selectively soliciting positive reviews"; no asking for specific content.'],
    ['Primary source', 'Google Search Central: Do you need an SEO?', 'https://developers.google.com/search/docs/fundamentals/do-i-need-seo',
      '"No one can guarantee a #1 ranking on Google"; questions to ask before hiring; warning signs. (It gives no timeframe for SEO results, so neither do we.)'],
    ['Primary source', 'Google Search Central: Creating helpful, reliable, people-first content', 'https://developers.google.com/search/docs/fundamentals/creating-helpful-content',
      'E-E-A-T (trust matters most); mass-produced AI text without oversight is "little to no effort"; scaled content to manipulate rankings is spam.'],
    ['Primary source', 'Google Ads: Third-party policy', 'https://support.google.com/adspolicy/answer/6086450',
      'Third parties managing Google Ads must disclose management fees and provide cost, click and impression data.'],
    ['Primary source', 'FTC: final rule banning fake reviews and testimonials (Aug 14, 2024)', 'https://www.ftc.gov/news-events/news/press-releases/2024/08/federal-trade-commission-announces-final-rule-banning-fake-reviews-testimonials',
      'Bans fake and AI-generated reviews, buying reviews, insider reviews without disclosure and review suppression. In force since Oct 21, 2024; penalties of up to $51,744 per violation were cited at the time.'],
    ['Survey', 'Ahrefs: SEO pricing (439 SEO providers polled)', 'https://ahrefs.com/blog/seo-pricing/',
      'Most common retainer $501 to $1,000 a month (20.4%); agency average $3,209 a month; freelancers about $1,349; agency hourly average about $99.'],
    ['Industry benchmark', 'LocaliQ / WordStream: 2025 Google Ads benchmarks', 'https://www.wordstream.com/resources/google-ads-industry-benchmarks',
      'All-industry US search averages: about $5.26 per click, 7.52% conversion rate, $70.11 per lead. We read these through several reports quoting it; the page blocked our reader.'],
    ['Primary source', 'Meta Business Help: About the learning phase', 'https://www.facebook.com/business/help/112167992830700',
      'An ad set usually exits learning after about 50 optimisation events in 7 days; significant edits restart it. Confirmed through several independent write-ups (the page didn\'t load for our reader).'],
    ['Expert survey', 'Whitespark: Local Search Ranking Factors', 'https://whitespark.ca/local-search-ranking-factors/',
      'A yearly survey of local SEO experts. In the 2023 edition, the primary Google Business Profile category was rated the top factor for the map pack. Opinions, not Google\'s word.'],
    ['Practitioner', 'Medium: "My 6 Worst Budget-Burning Google Ads Mistakes"', 'https://medium.com/marketing-and-entrepreneurship/my-6-worst-budget-burning-google-ads-mistakes-ca25e081ca7d',
      'First-hand list of how budgets leak: loose match types, ignored search terms, trusting automated suggestions.'],
    ['Practitioner', 'Medium: "A Beginner\'s Guide to Negative Keywords on Google Ads"', 'https://medium.com/trapica/a-beginners-guide-to-negative-keywords-on-google-ads-aac01957dbd7',
      'Why words like "free" and "jobs" waste money, and how to block them.'],
    ['Practitioner', 'Medium: "Navigating Google Ads Recommendations: The Importance of Critical Thinking for Small Businesses"', 'https://medium.com/@swiftpropel/navigating-google-ads-recommendations-the-importance-of-critical-thinking-for-small-businesses-d31bdab0163e',
      'Why auto-applying Google\'s suggestions (broad match, automated bidding) can backfire on small accounts. Its worst-case numbers are illustrative.'],
    ['Practitioner', 'Medium: "How to Avoid Bad Digital Ads Managers (and save your business money)"', 'https://medium.com/@ryangarb/how-to-avoid-bad-digital-ads-managers-and-save-your-business-money-e06c1f679601',
      'Insist that you own every account (Google Ads, Analytics, Tag Manager, Meta) and that the contract says so.'],
    ['Practitioner', 'Medium: "If a Marketing Agency Guarantees ROI, Avoid Them At All Costs"', 'https://darryl-navarrete.medium.com/if-a-marketing-agency-guarantees-roi-avoid-them-at-all-costs-eda32c8dc012',
      'An agency owner on why honest answers sound like "maybe, but I can\'t guarantee that".'],
    ['Practitioner', 'Medium: "Local SEO using Google My Business Page" (home-service case study)', 'https://medium.com/@felixjosemon/local-seo-using-google-my-business-page-case-study-home-service-business-in-the-us-4573bc18d08b',
      'A consultant\'s case study: full profile, categories, services, reviews and posts. Results are self-reported.'],
    ['Practitioner', 'Medium: "Outrank 99% of Local Businesses on Google Maps in Just 20 Days"', 'https://medium.com/@afghankhanbitani/outrank-99-of-local-businesses-on-google-maps-in-just-20-days-f947b3f0fbe8',
      'Bold title, useful tactics: more accurate categories, a full services list, matching name/address/phone everywhere. Self-reported results.'],
    ['Practitioner', 'Medium: "SMMA [STOP SELLING FACEBOOK ADS]"', 'https://derekdemike.medium.com/smma-stop-selling-facebook-ads-2340de672925',
      'An insider\'s argument that local clients buy leads, not "Facebook ads", and that results are hard to attribute.'],
    ['Practitioner', 'Medium (The Startup): "The Lucrative Underground World Of SMMA"', 'https://medium.com/swlh/the-lucrative-underground-world-of-smma-6ff105cfd8ad',
      'A look at the "start an agency" boom and the course economy around it. Treat income claims in this genre with caution.']
  ];

  function flagHtml(i, f) {
    return '<div class="gd-q" data-q="' + i + '"><span>' + esc(f[0]) + '</span><div class="ui-seg">' +
      '<button type="button" data-a="yes" class="' + (f[1] === 'yes' ? 'yes-bad' : 'yes-good') + '">Yes</button>' +
      '<button type="button" data-a="no" class="' + (f[1] === 'no' ? 'no-bad' : 'no-good') + '">No</button></div></div>';
  }

  UI.page('guide', { title: 'What agencies actually do', nav: 'Field guide', icon: 'book', order: 20 }, function (view, ctx) {
    var answers = {};
    var jobs = MG.STAGES.map(function (s) {
      return '<div class="ui-card gd-job"><div class="top">' + UI.icon(s.icon) + '<div><div class="role">' + s.n + ' · ' + esc(s.role) + '</div><h3>' + esc(s.title) + '</h3></div></div>' +
        '<p>' + esc(s.agency) + '</p><div class="inv">' + esc(INVOICE[s.id]) + '</div></div>';
    }).join('');
    view.innerHTML = '<div class="ui-wrap"><div class="ui-page-head"><div><div class="eyebrow">Field guide</div><h1>What ad agencies <em>actually do</em></h1>' +
      '<p class="muted gd-lead">Everyone and their grandma seems to be opening a marketing agency. Here is what they sell, what it costs, how to spot a bad one, and how to do much of it yourself. Every fact links to its source.</p></div></div>' +
      '<nav class="gd-index" aria-label="Sections">' + SECTIONS.map(function (s, i) { return '<a href="#guide/' + s[0] + '" data-sec="' + s[0] + '">' + (i + 1) + '. ' + esc(s[1]) + '</a>'; }).join('') + '</nav>' +

      '<section class="gd-sec" id="gd-short"><h2><span class="n">01</span>The short answer</h2>' +
      '<p class="gd-short">An agency rents you a marketing team: <mark>a strategist, an ads specialist, an SEO person, a writer or designer, and an account manager</mark> who sends the monthly report.</p>' +
      '<p class="gd-lead">For most small businesses the monthly work comes down to four things: keep the Google profile and website in shape, run Google and/or Meta ads and cut wasted spend every week, make content (posts, ad videos, pages), and report the numbers. None of it is magic. Most of it is steady, repeatable work, which is why it fits into prompts.</p></section>' +

      '<section class="gd-sec" id="gd-jobs"><h2><span class="n">02</span>The 8 jobs</h2><p class="gd-lead">These are the services you\'ll see in any agency proposal. Your Marguru playbook follows the same order.</p><div class="gd-jobs">' + jobs + '</div></section>' +

      '<section class="gd-sec" id="gd-boom"><h2><span class="n">03</span>Why everyone is opening one</h2><div class="gd-two"><div class="ui-card"><h3>It\'s cheap to start</h3><ul class="gd-list">' +
        '<li>No stock, no premises: a laptop and some software. Google and Meta ads are self-serve, so anyone can open an account.</li>' +
        '<li>Retainers mean recurring monthly income from each client.</li>' +
        '<li>"SMMA" (social media marketing agency) became a popular get-rich pitch, with courses and videos teaching it. Many articles about it are themselves selling a course, so treat income claims with caution.</li></ul></div>' +
      '<div class="ui-card"><h3>What that means for you</h3><ul class="gd-list">' +
        '<li><b>Selling is the main skill</b> in many new agencies. Insiders writing on Medium say the founder\'s real job is finding clients.</li>' +
        '<li><b>A lot of work is outsourced.</b> Many small agencies resell "white-label" SEO, ads or web work done by a partner under their own brand, with a markup. Fine if they\'re open about it; ask who does the work.</li>' +
        '<li><b>Local clients buy results, not "Facebook ads".</b> Calls and bookings are what matter, and they\'re harder to attribute than online sales.</li></ul></div></div></section>' +

      '<section class="gd-sec" id="gd-cost"><h2><span class="n">04</span>What it costs</h2><p class="gd-lead">The best public data is for SEO. Ahrefs polled 439 SEO providers:</p>' +
      '<div class="gd-nums"><div class="ui-card gd-num"><b>$501–1,000</b><span>the most common monthly retainer (20.4% of providers)</span></div>' +
        '<div class="ui-card gd-num"><b>$3,209</b><span>average monthly retainer for agencies</span></div><div class="ui-card gd-num"><b>$1,349</b><span>average monthly retainer for freelancers</span></div>' +
        '<div class="ui-card gd-num"><b>~$99/h</b><span>average agency hourly rate</span></div></div>' +
      '<p>Ads management is priced in several ways: a flat monthly fee, a share of ad spend, or both. <b>Ad spend comes on top:</b> it goes to Google or Meta. Google\'s third-party policy requires anyone managing your Google Ads to disclose their fees and give you the cost, click and impression data.</p>' +
      '<p class="muted small">Source: Ahrefs SEO pricing survey; Google Ads third-party policy. See <a href="#guide/sources" data-sec="sources">Sources</a>.</p></section>' +

      '<section class="gd-sec" id="gd-flags"><h2><span class="n">05</span>Red flags, in Google\'s own words</h2><div class="gd-quotes">' +
        '<blockquote class="gd-quote"><p>"No one can guarantee a #1 ranking on Google."</p><cite>Google Search Central</cite></blockquote>' +
        '<blockquote class="gd-quote"><p>"Be wary of SEO firms and web consultants or agencies that email you out of the blue."</p><cite>Google Search Central</cite></blockquote>' +
        '<blockquote class="gd-quote"><p>"Be careful if a company is secretive or won\'t clearly explain what they intend to do."</p><cite>Google Search Central</cite></blockquote>' +
        '<blockquote class="gd-quote"><p>"There\'s no way to request or pay for a better local ranking on Google."</p><cite>Google Business Profile Help</cite></blockquote></div>' +
      '<p>Also walk away from anyone offering fake or paid reviews (Google bans it, and the US FTC made fake reviews illegal in 2024), claiming a "special relationship" with Google, or asking you to link to them.</p>' +
      '<div class="ui-card"><h3>Check an agency in one minute</h3><p class="muted">Answer for an agency you\'re talking to.</p><div class="gd-check">' + FLAGS.map(function (f, i) { return flagHtml(i, f); }).join('') + '</div><div data-score></div></div></section>' +

      '<section class="gd-sec" id="gd-diy"><h2><span class="n">06</span>Do it yourself, or hire?</h2><div class="gd-two"><div class="ui-card"><h3>Do it yourself first when</h3><ul class="gd-list">' +
        '<li>Your ad budget is small. A $800 monthly fee on $500 of ads means 62% of your marketing money pays the manager.</li>' +
        '<li>You\'re local and the work is mostly your Google profile, reviews and website. That\'s free, and nobody knows your business better.</li>' +
        '<li>You can spare 2 to 4 hours a week. A playbook and an AI chat do the writing; you supply the judgment.</li></ul></div>' +
      '<div class="ui-card"><h3>Consider hiring when</h3><ul class="gd-list">' +
        '<li>Ad spend is big enough that the fee is a small share (the same $800 on $5,000 of ads is 14%).</li>' +
        '<li>You need specialist skills you won\'t use often: tracking setup, video production, a complex store feed.</li>' +
        '<li>Your time is worth more running the business. A middle path: pay an expert for a one-off audit or setup, then run it yourself.</li></ul>' +
        '<a class="ui-btn sm" href="#math" data-go="math">' + UI.icon('calc') + 'Do the fee math</a></div></div></section>' +

      '<section class="gd-sec" id="gd-words"><h2><span class="n">07</span>Jargon buster</h2><input type="search" class="gd-words-in" data-words-q placeholder="Search terms (CPC, ROAS, NAP...)" aria-label="Search the jargon">' +
      '<div class="gd-words" data-words>' + WORDS.map(function (w) { return '<div class="gd-word" data-w="' + esc((w[0] + ' ' + w[1]).toLowerCase()) + '"><b>' + esc(w[0]) + '</b><span>' + esc(w[1]) + '</span></div>'; }).join('') + '</div></section>' +

      '<section class="gd-sec" id="gd-sources"><h2><span class="n">08</span>Sources, and how we checked</h2>' +
      '<div class="gd-note"><p><b>How we checked:</b> facts used inside Marguru\'s prompts and tips come from primary sources (Google, Meta, the FTC) or a named survey. Practitioner posts on Medium are listed for their tactics; their numbers are self-reported. ' +
      'We also looked for Reddit success stories, but Reddit blocks the research tools we used, so we couldn\'t read or verify any threads. Rather than invent quotes, Marguru has a <a href="#wins" data-go="wins">Wins board</a> where owners share what worked.</p></div>' +
      '<div class="gd-src">' + SOURCES.map(function (s) {
        return '<div class="gd-src-item"><span class="ui-badge ' + (s[0] === 'Primary source' ? 'good' : s[0] === 'Practitioner' ? 'warn' : 'brand') + '" style="justify-self:start">' + esc(s[0]) + '</span>' +
          '<div><a href="' + esc(s[2]) + '" target="_blank" rel="noopener">' + esc(s[1]) + '</a><p>' + esc(s[3]) + '</p></div></div>';
      }).join('') + '</div></section></div>';

    function score() {
      var n = Object.keys(answers).length, bad = 0;
      Object.keys(answers).forEach(function (i) { if (answers[i] === FLAGS[i][1]) bad += 1; });
      var box = view.querySelector('[data-score]');
      if (!n) { box.innerHTML = ''; return; }
      var verdict = bad === 0 ? ['So far, so good.', 'No red flags in what you\'ve answered. Still get everything in writing.'] :
        bad <= 2 ? ['Ask more questions.', UI.plural(bad, 'warning sign') + '. Raise each one with them before signing; good agencies have good answers.'] :
        ['Walk away, or get it fixed in writing.', UI.plural(bad, 'warning sign') + '. That\'s a lot. Use the "Grill them" prompt in your playbook (Measure stage) to check the proposal.'];
      box.innerHTML = '<div class="gd-score"><h3>' + esc(verdict[0]) + '</h3><p style="margin:0">' + esc(verdict[1]) + ' <span class="muted">(' + n + ' of ' + FLAGS.length + ' answered)</span></p></div>';
    }

    view.addEventListener('click', function (e) {
      var a = e.target.closest('[data-a]');
      if (a) {
        var q = a.closest('[data-q]'), i = q.getAttribute('data-q');
        answers[i] = a.getAttribute('data-a');
        q.querySelectorAll('[data-a]').forEach(function (b) { b.classList.toggle('on', b === a); });
        score();
        return;
      }
      var s = e.target.closest('[data-sec]');
      if (s) {
        e.preventDefault();
        var el = view.querySelector('#gd-' + s.getAttribute('data-sec'));
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }
    });
    view.addEventListener('input', function (e) {
      if (!e.target.matches('[data-words-q]')) return;
      var q = e.target.value.trim().toLowerCase();
      view.querySelectorAll('[data-w]').forEach(function (w) { w.hidden = !!q && w.getAttribute('data-w').indexOf(q) < 0; });
    });
    if (ctx.args[0]) setTimeout(function () { var el = view.querySelector('#gd-' + ctx.args[0]); if (el) el.scrollIntoView(); }, 60);
    return Promise.resolve();
  });
})();

/* ===== home.html ===== */
(function () {
  var esc = UI.esc;

  function importGuest() {
    var g = UI.store.get('guestPlan', null);
    if (!g || !g.profile || !UI.me) return Promise.resolve(null);
    return UI.api('save_plan', g.profile, null, g.progress || null).then(function (r) {
      UI.store.set('guestPlan', null);
      UI.toast('Saved "' + r.plan.name + '" to your account.', 'ok');
      return r.plan;
    }, function (e) { UI.toast(e.message, 'error'); return null; });
  }

  function planCard(p) {
    var b = MG.build(p.profile), d = (p.progress && p.progress.done) || {};
    var done = b.prompts.filter(function (x) { return d[x.id]; }).length, pct = Math.round(100 * done / Math.max(1, b.prompts.length));
    var next = b.first.filter(function (x) { return !d[x.id]; })[0];
    return '<a class="ui-card dk-plan" href="#plan/' + esc(p.id) + '" data-go="plan/' + esc(p.id) + '">' +
      '<div class="ui-row" style="flex-wrap:nowrap;justify-content:space-between;align-items:flex-start"><div style="min-width:0"><h3>' + esc(p.name) + '</h3>' +
      '<span class="small muted">' + esc(MG.label(MG.TYPES, p.profile.type)) + ' · updated ' + esc(UI.ago(p.updated)) + '</span></div>' +
      '<div class="dk-ring" style="--p:' + pct + '"><span>' + pct + '%</span></div></div>' +
      '<div class="small muted">' + done + ' of ' + b.prompts.length + ' prompts done</div>' +
      (next ? '<div class="dk-next"><span class="eyebrow" style="margin:0 0 4px;display:block">Next up</span><b>' + esc(next.title) + '</b></div>'
        : '<div class="dk-next"><b>All done. Time to share a win?</b></div>') + '</a>';
  }

  UI.page('home', { title: 'Your desk', nav: 'Desk', icon: 'home', auth: 'user', order: 10 }, function (view, ctx) {
    view.innerHTML = '<div class="ui-wrap"><div class="ui-skel" style="height:300px"></div></div>';
    function draw(d) {
      var tip = MG.tipOfDay(), first = ctx.me.name.split(' ')[0];
      var plans = d.plans.length ? '<div class="dk-plans">' + d.plans.map(planCard).join('') +
        '<a class="dk-new" href="#build" data-go="build"><div>' + UI.icon('plus') + '<h3 style="margin:8px 0 4px">New plan</h3><p class="small muted" style="margin:0">Another business, location or product line</p></div></a></div>'
        : '<div class="ui-card dk-hero"><div class="eyebrow">Let\'s start</div><h2>Tell Marguru about <em>your business</em></h2>' +
          '<p class="muted" style="max-width:34em;margin:0 auto 20px">Three minutes of questions, then a step-by-step playbook of copy-ready prompts: the same jobs a marketing agency would do for you.</p>' +
          '<div class="ui-row" style="justify-content:center"><a class="ui-btn primary lg" href="#build" data-go="build">Build my playbook ' + UI.icon('arrow') + '</a>' +
          '<a class="ui-btn lg" href="#plan/example" data-go="plan/example">See an example</a></div></div>';
      view.innerHTML = '<div class="ui-wrap"><div class="dk-head"><div><div class="eyebrow">Your desk</div><h1>Hello, ' + esc(first) + '</h1></div>' +
        (d.plans.length ? '<a class="ui-btn primary" href="#build" data-go="build">' + UI.icon('plus') + 'New plan</a>' : '') + '</div>' +
        '<div class="dk-grid"><div>' + plans + '</div><aside class="dk-side">' +
        '<div class="ui-card dk-tip"><div class="eyebrow">Guru tip</div><p>' + esc(tip[0]) + '</p><span class="small">Source: ' + esc(tip[1]) + '</span></div>' +
        '<div class="ui-card"><div class="ui-row between"><h3 style="margin:0">Latest wins</h3><a class="small" href="#wins" data-go="wins">All wins</a></div>' +
        (d.wins.length ? d.wins.map(function (w) {
          return '<div class="dk-win"><b>' + esc(w.title) + '</b><span class="small muted">' + esc(w.author) + ' · ' + esc(MG.label(MG.CHANNELS, w.channel)) + (w.demo ? ' · Example' : '') + '</span></div>';
        }).join('') : '<p class="muted small">No wins yet. Be the first to share one.</p>') + '</div>' +
        '<div class="ui-card dk-links"><a class="ui-btn block" href="#guide" data-go="guide">' + UI.icon('book') + 'What agencies actually do</a>' +
        '<a class="ui-btn block" href="#math" data-go="math">' + UI.icon('calc') + 'Is an ad budget worth it?</a></div>' +
        '</aside></div></div>';
    }
    return importGuest().then(function () { return UI.api('get_desk'); }).then(draw);
  });
})();

/* ===== landing.html ===== */
(function () {
  var COPY = {
    eyebrow: 'Your pocket marketing agency',
    title: 'Market your business <em>like an agency would</em>',
    lead: 'Tell Marguru about your business. Get a step-by-step playbook of copy-ready AI prompts for the jobs agencies commonly charge $500 to $3,000+ a month for: Google Maps, reviews, ads, SEO, content and reports.',
    proof: ['Free, no card', 'Works with ChatGPT, Claude or any AI chat', 'Checked against Google\'s own rules'],
    jobsTitle: 'Everyone\'s opening an agency. <em>Here\'s what they do.</em>',
    jobsLead: 'Strip away the jargon and an agency does eight jobs. Your playbook walks through the same eight, in the same order.',
    stepsTitle: 'How it works',
    stepsLead: 'From "I should really do some marketing" to a plan you can actually follow.',
    steps: [['Describe your business', 'Three minutes: what you sell, who buys, where, your goal and your budget (even $0).'],
            ['Get your playbook', 'Around 25 to 35 prompts in 8 stages, filled in with your details and ordered like an agency would do them.'],
            ['Paste, do, tick', 'Copy a prompt into ChatGPT or Claude, use the answer, tick it off. Your progress and notes are saved.']],
    featuresTitle: 'More than a list of prompts',
    features: [['book', 'The field guide', 'What agencies actually do, what they charge, and the red flags, in plain words with every source.'],
               ['calc', 'Ad math', 'Before you spend: what a budget buys, what a customer is worth, and the most you can pay per click.'],
               ['trophy', 'Wins board', 'Small owners sharing one marketing move that worked. Steal freely, clap for what helped.'],
               ['check', 'Progress you can see', 'Tick prompts off, star favourites, keep notes on what the AI gave you. Stages stamp themselves done.'],
               ['download', 'Take it with you', 'Download your whole playbook as one file, or open any prompt straight in ChatGPT or Claude.'],
               ['shield', 'Honest by design', 'Every prompt follows Google\'s, Meta\'s and the FTC\'s rules, so you never get advice that gets you suspended.']],
    rules: [['Fake or bought reviews', 'Google bans them, and the US FTC made them illegal in 2024.'],
            ['Asking only happy customers', '"Review gating" breaks Google\'s policy. Marguru asks everyone.'],
            ['Guaranteed #1 rankings', '"No one can guarantee a #1 ranking on Google." That\'s Google talking.'],
            ['Keywords in your business name', 'It breaks Google Business Profile guidelines and can get you suspended.'],
            ['Buying links', 'Google\'s spam policies forbid link schemes. Marguru helps you earn real ones.'],
            ['Copy that singles people out', '"Struggling with debt?" Meta rejects ads that imply personal traits.']],
    faq: [['Is it free?', 'Yes. Building a playbook, the field guide, Ad math and the Wins board are free. You can even try it without an account; sign up to save your plans.'],
          ['Do I need ChatGPT?', 'You need any AI chat: ChatGPT, Claude, Gemini or Copilot all work, and their free versions are fine. Marguru writes the prompts; you paste them in.'],
          ['Can it replace an agency?', 'For many small businesses, much of the monthly work, yes: it\'s the same jobs, and you know your business best. The field guide explains when hiring still makes sense.'],
          ['Where do the facts come from?', 'Google\'s and Meta\'s help pages, the FTC, the Ahrefs pricing survey and practitioners\' write-ups. Every source is listed in the field guide, with how much to trust it.'],
          ['Who sees my business details?', 'Only you. Saved plans live in your account; a plan made before signing up stays in your browser. Wins you post are public, under your display name only.'],
          ['Will it get me results?', 'Nobody can promise that, and Marguru won\'t. It gives you the same steps a good agency follows; results depend on your business, your market and doing the work.']],
    bandTitle: 'Your first prompt is 3 minutes away.',
    bandLead: 'Build a playbook now, no account needed. Save it when you\'re ready.'
  };

  // The product in three panes (CSS-only loop): describe the business → the playbook → a prompt with your details filled in
  function heroArt() {
    var join = '<div class="lp-join">' + UI.icon('arrow') + '</div>';
    var field = function (label, val) { return '<label>' + label + '<span><i style="--w:' + (val.length * 0.58 + 0.3).toFixed(2) + 'em">' + val + '</i></span></label>'; };
    var stages = [['1', 'Your foundations', 'brand + offer'], ['2', 'Google Maps', '6 prompts'], ['3', 'Reviews', '4 prompts'], ['4', 'Search ads', '5 prompts'], ['5', 'Monthly report', '3 prompts']];
    return '<div class="lp-demo" aria-hidden="true">' +
      '<div class="lp-pane"><h5><span>1 · Tell us</span><b>2 minutes</b></h5><div class="lp-f">' +
        field('Business', 'Bakery') + field('Where', 'Verdun') + field('Best customers', 'Young families') + '<span class="go">Build my playbook</span></div></div>' + join +
      '<div class="lp-pane"><h5><span>2 · Your playbook</span><b>31 steps</b></h5><ul class="lp-stages">' +
        stages.map(function (s, i) { return '<li' + (i === 1 ? ' class="on"' : '') + '><i>' + s[0] + '</i>' + s[1] + '<small>' + s[2] + '</small></li>'; }).join('') + '</ul></div>' + join +
      '<div class="lp-pane"><h5><span>3 · Copy, paste, done</span><b>any AI chat</b></h5><span class="lp-stamp">DONE</span>' +
        '<div class="lp-pre">Act as a local-search consultant for a <mark>bakery in Verdun</mark>.<br>MY BUSINESS<br>- Best customers: <mark>young families</mark><br>' +
        'TASK: write my Google Business Profile description, 750 characters, following Google\'s rules…</div>' +
        '<div class="lp-btns"><span class="p">Copy prompt</span><span>ChatGPT ↗</span><span>Claude ↗</span><b>✓ Copied</b></div></div></div>';
  }

  UI.page('landing', { title: 'Market your business like an agency would' }, function (view, ctx) {
    var me = ctx.me, C = COPY, esc = UI.esc;
    var primary = me ? '<a class="ui-btn primary lg" href="#home" data-go="home">Open your desk ' + UI.icon('arrow') + '</a><a class="ui-btn lg" href="#build" data-go="build">New plan</a>'
      : '<a class="ui-btn primary lg" href="#build" data-go="build">Build my free playbook ' + UI.icon('arrow') + '</a>' +
        '<a class="ui-btn lg" href="#plan/example" data-go="plan/example">See an example</a>';
    view.innerHTML =
      '<section class="lp-hero"><div class="ui-wrap"><div class="lp-top">' +
        '<div><div class="eyebrow">' + esc(C.eyebrow) + '</div><h1>' + C.title + '</h1></div>' +
        '<div><p class="lp-lead">' + esc(C.lead) + '</p><div class="lp-cta">' + primary + '</div>' +
        '<div class="lp-proof">' + C.proof.map(function (p) { return '<span>' + UI.icon('check') + esc(p) + '</span>'; }).join('') + '</div></div>' +
      '</div>' + heroArt() + '</div></section>' +
      '<section class="lp-section"><div class="ui-wrap"><div class="lp-head"><h2>' + C.jobsTitle + '</h2><p>' + esc(C.jobsLead) + '</p></div>' +
        '<div class="lp-jobs">' + MG.STAGES.map(function (s) {
          return '<div class="lp-job"><div class="n">' + s.n + '</div><h3>' + esc(s.title) + '</h3><p>' + esc(s.role) + '</p></div>';
        }).join('') + '</div><p style="text-align:center;margin-top:20px"><a class="ui-btn" href="#guide" data-go="guide">' + UI.icon('book') + 'Read the field guide</a></p></div></section>' +
      '<section class="lp-section" id="how"><div class="ui-wrap"><div class="lp-head"><h2>' + esc(C.stepsTitle) + '</h2><p>' + esc(C.stepsLead) + '</p></div>' +
        '<div class="lp-steps">' + C.steps.map(function (s) { return '<div class="ui-card lp-step"><h3>' + esc(s[0]) + '</h3><p class="muted">' + esc(s[1]) + '</p></div>'; }).join('') + '</div></div></section>' +
      '<section class="lp-section"><div class="ui-wrap"><div class="lp-head"><h2>' + esc(C.featuresTitle) + '</h2></div>' +
        '<div class="ui-grid">' + C.features.map(function (f) { return '<div class="ui-card lp-feature">' + UI.icon(f[0]) + '<h3>' + esc(f[1]) + '</h3><p>' + esc(f[2]) + '</p></div>'; }).join('') + '</div></div></section>' +
      '<section class="lp-section"><div class="ui-wrap"><div class="lp-head"><h2>What Marguru <em>won\'t</em> help you do</h2><p>Some agencies still sell these. They can get your listing suspended, your ads rejected, or worse.</p></div>' +
        '<div class="lp-rules">' + C.rules.map(function (r) { return '<div class="lp-rule"><b>' + UI.icon('x') + esc(r[0]) + '</b><p>' + esc(r[1]) + '</p></div>'; }).join('') + '</div></div></section>' +
      '<section class="lp-section"><div class="ui-wrap"><div class="lp-head"><h2>Questions</h2></div><div class="lp-faq">' +
        C.faq.map(function (q) { return '<details><summary>' + esc(q[0]) + '</summary><p>' + esc(q[1]) + '</p></details>'; }).join('') + '</div></div></section>' +
      '<section class="lp-section"><div class="ui-wrap"><div class="lp-band"><div><h2>' + esc(C.bandTitle) + '</h2><p>' + esc(C.bandLead) + '</p></div>' +
        (me ? '<a class="ui-btn lg" href="#build" data-go="build">Build a playbook</a>'
          : '<div class="ui-row"><a class="ui-btn primary lg" href="#build" data-go="build">Start now</a><a class="ui-btn lg" href="#auth/signup" data-go="auth/signup">Create a free account</a></div>') +
      '</div></div></section>';
    return Promise.resolve();
  });
})();

/* ===== math.html ===== */
(function () {
  var esc = UI.esc;
  var FIELDS = [
    ['budget', 'Monthly ad budget', '$', 50, 10000, 50, 500, ''],
    ['cpc', 'Cost per click', '$', 0.25, 30, 0.05, 5.26, 'US search average, 2025'],
    ['cvr', 'Clicks that become leads', '%', 0.5, 40, 0.1, 7.5, 'US search average, 2025'],
    ['close', 'Leads that become customers', '%', 1, 100, 1, 30, 'your guess'],
    ['sale', 'Average sale', '$', 5, 20000, 5, 100, ''],
    ['repeat', 'Purchases per customer, lifetime', '×', 1, 50, 1, 1, ''],
    ['margin', 'Gross margin', '%', 5, 95, 1, 50, 'after cost of goods or labour'],
    ['fee', 'Agency or freelancer fee', '$', 0, 10000, 50, 0, 'per month']
  ];
  function money(n) { return (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: Math.abs(n) < 100 ? 2 : 0 }); }
  function num(n, d) { return n.toLocaleString('en-US', { maximumFractionDigits: d == null ? 1 : d }); }

  UI.page('math', { title: 'Ad math', nav: 'Ad math', icon: 'calc', order: 30 }, function (view, ctx) {
    var saved = UI.store.get('math', null) || {};
    var vals = {};
    FIELDS.forEach(function (f) { vals[f[0]] = saved[f[0]] != null ? saved[f[0]] : f[6]; });

    view.innerHTML = '<div class="ui-wrap"><div class="ui-page-head"><div><div class="eyebrow">Ad math</div><h1>Is an ad budget <em>worth it?</em></h1>' +
      '<p class="muted" style="max-width:40em">The sum every agency should do before spending your money: what a budget buys, what a customer is worth, and the most you can pay per click. Change any number.</p></div></div>' +
      '<div class="am"><form class="ui-card am-in" data-in>' + FIELDS.map(function (f) {
        return '<label class="ui-field"><span>' + esc(f[1]) + (f[7] ? ' <em>' + esc(f[7]) + '</em>' : '') + '</span><div class="pair">' +
          '<input type="range" data-range="' + f[0] + '" min="' + f[3] + '" max="' + f[4] + '" step="' + f[5] + '" value="' + vals[f[0]] + '" aria-label="' + esc(f[1]) + '">' +
          '<input type="number" name="' + f[0] + '" min="0" step="' + f[5] + '" value="' + vals[f[0]] + '" inputmode="decimal" aria-label="' + esc(f[1]) + ' (' + f[2] + ')"></div></label>';
      }).join('') + '<div class="ui-row" style="margin-top:16px"><button type="button" class="ui-btn sm" data-reset>' + UI.icon('refresh') + 'Reset to averages</button></div></form>' +
      '<div><div class="ui-card"><h3>Each month, roughly</h3><div class="am-funnel" data-funnel></div><div class="am-kpis" data-kpis></div><div data-verdict></div>' +
      '<p class="am-src">Default click cost ($5.26) and lead rate (7.52%, rounded to 7.5) are the all-industry US averages for Google search ads in LocaliQ/WordStream\'s 2025 benchmarks. ' +
      'Your industry and city can be far cheaper or dearer: check real estimates in Google Keyword Planner. Results are estimates, never promises.</p></div></div></div></div>';

    function calc() {
      var v = vals, clicks = v.budget / Math.max(0.01, v.cpc), leads = clicks * v.cvr / 100, cust = leads * v.close / 100;
      var lifetime = v.sale * v.repeat, revenue = cust * lifetime, gross = revenue * v.margin / 100, spend = v.budget + v.fee;
      var net = gross - spend, maxCpl = lifetime * v.margin / 100 * v.close / 100, beCpc = maxCpl * v.cvr / 100;
      var max = Math.max(clicks, 1);
      view.querySelector('[data-funnel]').innerHTML = [['Clicks', clicks], ['Leads', leads], ['Customers', cust]].map(function (s) {
        return '<div class="am-step"><span>' + s[0] + '</span><div><div class="bar" style="width:' + Math.max(1, 100 * s[1] / max) + '%"></div></div><b>' + num(s[1], s[1] < 10 ? 1 : 0) + '</b></div>';
      }).join('');
      var kp = [[money(v.budget / Math.max(leads, 1e-9)), 'cost per lead'], [money(spend / Math.max(cust, 1e-9)), 'cost per customer (with fees)'],
        [money(revenue), 'revenue (lifetime)'], [money(net), 'profit after ads and fees'], [money(beCpc), 'break-even cost per click'], [money(maxCpl), 'most you can pay per lead']];
      if (leads < 0.05) kp[0][0] = '—';
      if (cust < 0.05) kp[1][0] = '—';
      view.querySelector('[data-kpis]').innerHTML = kp.map(function (k) { return '<div class="am-kpi"><b>' + k[0] + '</b><span>' + k[1] + '</span></div>'; }).join('');
      var good = net > 0, feeShare = spend ? Math.round(100 * v.fee / spend) : 0;
      var tips = [];
      if (v.cpc > beCpc) tips.push('Clicks cost ' + money(v.cpc) + ' but you break even at ' + money(beCpc) + '. Look for cheaper, more specific keywords, or a smaller area.');
      if (v.cvr < 5) tips.push('Only ' + num(v.cvr) + '% of clicks become leads. A dedicated landing page (Stage 3 in your playbook) is the usual fix.');
      if (v.close < 25) tips.push('Closing ' + num(v.close, 0) + '% of leads: faster replies and a clear price range often help.');
      if (v.repeat <= 1) tips.push('If customers buy only once, a reminder or referral programme (Stage 7) raises what each one is worth.');
      if (feeShare >= 40) tips.push('Fees are ' + feeShare + '% of your total marketing spend. With a small ad budget, most of your money pays the manager, not the ads.');
      view.querySelector('[data-verdict]').innerHTML = '<div class="am-verdict ' + (good ? 'good' : 'bad') + '"><h3>' +
        (good ? 'Worth testing, carefully.' : 'Loses money at these numbers.') + '</h3><p style="margin:0">' +
        (good ? 'At these numbers each month of ads returns about ' + money(net) + ' of profit after ads' + (v.fee ? ' and fees' : '') + '. Real results swing a lot in the first weeks; judge after 4-8 weeks of tracked data.'
          : 'You\'d lose about ' + money(-net) + ' a month. That doesn\'t mean "never advertise": fix one of the levers below first, or start with free work (Google profile, reviews, website).') + '</p>' +
        (tips.length ? '<ul>' + tips.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' : '') + '</div>';
      UI.store.set('math', vals);
    }

    view.addEventListener('input', function (e) {
      var k = e.target.getAttribute('data-range') || e.target.name;
      if (!k || !(k in vals)) return;
      var n = parseFloat(e.target.value);
      if (!isFinite(n) || n < 0) return;
      vals[k] = n;
      var other = e.target.hasAttribute('data-range') ? view.querySelector('[name=' + k + ']') : view.querySelector('[data-range=' + k + ']');
      if (other) other.value = n;
      calc();
    });
    view.addEventListener('click', function (e) {
      if (!e.target.closest('[data-reset]')) return;
      FIELDS.forEach(function (f) { vals[f[0]] = f[6]; view.querySelector('[name=' + f[0] + ']').value = f[6]; view.querySelector('[data-range=' + f[0] + ']').value = f[6]; });
      calc();
    });
    view.addEventListener('submit', function (e) { e.preventDefault(); });
    calc();
    return Promise.resolve();
  });
})();

/* ===== plan.html ===== */
(function () {
  var esc = UI.esc;

  /* A little burst of paper confetti from an element. */
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

  function lv(n) { return '<span class="lv" title="' + ['', 'Easy', 'Some effort', 'Involved'][n] + '">' + '●●●'.slice(0, n) + '<span style="opacity:.25">' + '●●●'.slice(0, 3 - n) + '</span></span>'; }

  UI.page('plan', { title: 'Your playbook' }, function (view, ctx) {
    var arg = ctx.args[0] || 'local';
    var kind = arg === 'example' ? 'example' : arg === 'local' ? 'local' : 'server';
    var plan = null, book = null, stage = null, openPrompts = {}, openNotes = {};

    function progress() { return plan.progress || (plan.progress = { done: {}, star: [], notes: {} }); }
    function doneCount() { var d = progress().done; return book.prompts.filter(function (p) { return d[p.id]; }).length; }

    function persist(pid, field, value) {
      var pr = progress();
      if (field === 'done') { if (value) pr.done[pid] = new Date().toISOString(); else delete pr.done[pid]; }
      if (field === 'star') { pr.star = pr.star.filter(function (s) { return s !== pid; }); if (value) pr.star.push(pid); }
      if (field === 'note') { if (value) pr.notes[pid] = value; else delete pr.notes[pid]; }
      if (kind === 'local') { var g = UI.store.get('guestPlan', {}); g.progress = pr; UI.store.set('guestPlan', g); }
      if (kind === 'server') return UI.apiQuiet('set_step', plan.id, pid, field, value);
      return Promise.resolve();
    }

    function cardHtml(p) {
      var pr = progress(), done = !!pr.done[p.id], star = pr.star.indexOf(p.id) >= 0, note = pr.notes[p.id] || '';
      var open = !!openPrompts[p.id];
      return '<article class="pc' + (done ? ' is-done' : '') + '" id="p-' + esc(p.id) + '" data-pid="' + esc(p.id) + '">' +
        (done ? '<span class="pc-stamp">DONE</span>' : '') +
        '<div class="pc-top"><span class="pc-n">' + (p.n < 10 ? '0' : '') + p.n + '</span><div><h3>' + esc(p.title) + '</h3>' +
        '<div class="pc-meta">' + UI.icon('clock') + esc(p.time) + ' · ' + lv(p.level) + '</div></div>' +
        '<button type="button" class="pc-star' + (star ? ' on' : '') + '" data-act="star" aria-pressed="' + star + '" aria-label="Star this prompt">' + UI.icon('star') + '</button></div>' +
        '<p class="pc-why"><b>Why agencies do this:</b> ' + esc(p.why) + '</p>' +
        '<div class="pc-prompt' + (open ? '' : ' closed') + '"><pre>' + promptHtml(p.text, open) + '</pre></div>' +
        '<button type="button" class="pc-more" data-act="more">' + (open ? 'Show less' : 'Show the full prompt') + '</button>' +
        '<div class="pc-get"><p><b>You get:</b> ' + esc(p.get) + '</p><p><b>Then:</b> ' + esc(p.next) + '</p></div>' +
        '<div class="pc-actions"><button type="button" class="ui-btn primary" data-act="copy">' + UI.icon('copy') + 'Copy prompt</button>' +
        '<a class="ui-btn sm" data-act="open" data-where="chatgpt" href="' + esc(MG.openUrl('chatgpt', p.text)) + '" target="_blank" rel="noopener">ChatGPT ' + UI.icon('external') + '</a>' +
        '<a class="ui-btn sm" data-act="open" data-where="claude" href="' + esc(MG.openUrl('claude', p.text)) + '" target="_blank" rel="noopener">Claude ' + UI.icon('external') + '</a>' +
        '<span class="ui-spacer"></span>' +
        '<button type="button" class="ui-btn ghost sm' + (note ? ' pc-hasnote' : '') + '" data-act="note" aria-label="Notes">' + UI.icon('note') + (note ? 'Notes' : 'Note') + '</button>' +
        '<label class="pc-done"><input type="checkbox" data-act="done"' + (done ? ' checked' : '') + '>Done</label></div>' +
        '<div class="pc-note"' + (openNotes[p.id] ? '' : ' hidden') + '><textarea data-note maxlength="2000" placeholder="What did the AI give you? What did you change? (only you see this)">' + esc(note) + '</textarea></div>' +
        '</article>';
    }

    /* Collapsed, the shared business brief shrinks to a chip so each card shows its own task first. */
    function promptHtml(text, open) {
      var brief = book.v.brief, i = text.indexOf(brief);
      if (open || i < 0) return esc(text);
      return esc(text.slice(0, i)) + '<span class="pc-brief">' + UI.icon('note') + 'your business brief, ' + brief.split(String.fromCharCode(10)).length + ' lines</span>' + esc(text.slice(i + brief.length));
    }

    function tabsHtml() {
      var d = progress().done;
      return book.stages.map(function (s) {
        var n = s.prompts.filter(function (p) { return d[p.id]; }).length, all = s.prompts.length;
        return '<button type="button" class="pl-tab' + (s.id === stage ? ' on' : '') + (n === all ? ' complete' : '') + '" data-stage="' + s.id + '">' +
          '<span class="n">' + s.n + '</span><span>' + esc(s.title) + '</span><span class="c">' + (n === all ? UI.icon('check') : n + '/' + all) + '</span></button>';
      }).join('');
    }

    function sheetHtml() {
      var s = book.stages.filter(function (x) { return x.id === stage; })[0] || book.stages[0];
      var i = book.stages.indexOf(s), prev = book.stages[i - 1], next = book.stages[i + 1];
      return '<div class="pl-stage-head"><span class="big">' + s.n + '</span><div class="eyebrow" style="margin:6px 0 0">Stage ' + s.n + ' of 8 · ' + UI.plural(s.prompts.length, 'prompt') + '</div><h2>' + esc(s.title) + '</h2></div>' +
        '<div class="pl-agency"><span class="k">' + UI.icon(s.icon) + ' What an agency does here · ' + esc(s.role) + '</span><p>' + esc(s.agency) + '</p></div>' +
        s.prompts.map(cardHtml).join('') +
        '<div class="pl-pager">' + (prev ? '<button type="button" class="ui-btn" data-stage="' + prev.id + '" data-top>' + UI.icon('back') + esc(prev.title) + '</button>' : '<span></span>') +
        (next ? '<button type="button" class="ui-btn primary" data-stage="' + next.id + '" data-top>Next: ' + esc(next.title) + UI.icon('arrow') + '</button>' : '') + '</div>' +
        (i === book.stages.length - 1 && book.hidden.length ? '<div class="pl-hidden muted">' + book.hidden.map(function (h) { return '<p>' + UI.icon('info') + ' ' + esc(h) + '</p>'; }).join('') + '</div>' : '');
    }

    function nextUp() {
      var d = progress().done;
      return book.first.filter(function (p) { return !d[p.id]; }).slice(0, 3);
    }

    function headHtml() {
      var total = book.prompts.length, done = doneCount(), pct = Math.round(100 * done / Math.max(1, total)), pf = plan.profile;
      return '<div class="pl-head"><div><div class="eyebrow">Marketing playbook' + (kind === 'example' ? ' · example' : '') + '</div><h1>' + esc(pf.name) + '</h1>' +
        '<div class="pl-meta"><span class="ui-badge">' + esc(MG.label(MG.TYPES, pf.type) || 'Business') + '</span>' +
        (pf.where ? '<span class="ui-badge">' + UI.icon('pin') + esc(pf.where) + '</span>' : '') +
        '<span class="ui-badge">' + esc(MG.label(MG.GOALS, pf.goal)) + '</span><span class="ui-badge">Ads: ' + esc(MG.label(MG.BUDGETS, pf.budget)) + '</span></div></div>' +
        '<div class="pl-actions">' + (kind === 'example' ? '<a class="ui-btn primary" href="#build" data-go="build">' + UI.icon('plus') + 'Build mine</a>'
          : '<a class="ui-btn" href="#build/' + esc(kind === 'local' ? 'local' : plan.id) + '" data-go="build/' + esc(kind === 'local' ? 'local' : plan.id) + '">' + UI.icon('edit') + 'Edit details</a>') +
        '<button type="button" class="ui-btn" data-download>' + UI.icon('download') + 'Download</button>' +
        (kind === 'server' ? '<button type="button" class="ui-btn ghost icon" data-delete aria-label="Delete this plan">' + UI.icon('trash') + '</button>' : '') + '</div>' +
        '<div class="pl-prog"><span class="txt"><b data-done>' + done + '</b> of ' + total + ' done</span><div class="pl-bar"><i data-bar style="width:' + pct + '%"></i></div></div></div>';
    }

    function draw() {
      book = MG.build(plan.profile);
      if (!stage || !book.stages.some(function (s) { return s.id === stage; })) stage = book.stages[0].id;
      var nu = nextUp();
      view.innerHTML = '<div class="ui-wrap">' + headHtml() +
        (kind === 'local' ? '<div class="pl-banner"><p><b>This plan lives in this browser only.</b> Create a free account to keep it, track progress on any device and share wins.</p>' +
          '<a class="ui-btn sm" href="#auth/signup" data-go="auth/signup">Save it to an account</a></div>' : '') +
        (kind === 'example' ? '<div class="pl-banner"><p><b>This is an example</b> for a made-up bakery. Every prompt changes with your answers.</p><a class="ui-btn sm" href="#build" data-go="build">Build your own</a></div>' : '') +
        (nu.length ? '<section class="pl-next"><h2>Start here</h2><div class="pl-next-list">' + nu.map(function (p, i) {
          return '<button type="button" class="ui-card pl-next-item" data-jump="' + esc(p.id) + '"><span class="k">' + (i === 0 ? 'Next up' : 'Then') + ' · ' + esc(p.time) + '</span><b>' + esc(p.title) + '</b>' +
            '<span class="small muted">' + esc(MG.label(MG.STAGES.map(function (s) { return [s.id, s.title]; }), p.stage)) + '</span></button>';
        }).join('') + '</div></section>'
          : '<section class="pl-next"><div class="ui-card" style="text-align:center"><h2>Every prompt done. <em>Agency-level work.</em></h2><p class="muted">Share what worked on the Wins board, or start again in 90 days with new numbers.</p><a class="ui-btn primary" href="#wins" data-go="wins">' + UI.icon('trophy') + 'Share a win</a></div></section>') +
        '<div class="pl-body"><nav class="pl-tabs" aria-label="Stages" data-tabs>' + tabsHtml() + '</nav><div class="pl-sheet" data-sheet>' + sheetHtml() + '</div></div></div>';
    }

    function refreshProgress() {
      var total = book.prompts.length, done = doneCount();
      var d = view.querySelector('[data-done]'), bar = view.querySelector('[data-bar]');
      if (d) d.textContent = done;
      if (bar) bar.style.width = Math.round(100 * done / Math.max(1, total)) + '%';
      view.querySelector('[data-tabs]').innerHTML = tabsHtml();
    }

    function showStage(id, top) {
      stage = id;
      UI.store.set('stage.' + (plan.id || kind), id);
      view.querySelector('[data-tabs]').innerHTML = tabsHtml();
      view.querySelector('[data-sheet]').innerHTML = sheetHtml();
      if (top) { var b = view.querySelector('.pl-body'); window.scrollTo({ top: b.getBoundingClientRect().top + scrollY - 70, behavior: 'smooth' }); }
    }

    function redrawCard(pid) {
      var el = view.querySelector('[data-pid="' + pid + '"]');
      var p = book.prompts.filter(function (x) { return x.id === pid; })[0];
      if (el && p) { var tmp = document.createElement('div'); tmp.innerHTML = cardHtml(p); el.replaceWith(tmp.firstChild); }
      return view.querySelector('[data-pid="' + pid + '"]');
    }

    view.addEventListener('click', function (e) {
      var t;
      if ((t = e.target.closest('[data-stage]'))) { showStage(t.getAttribute('data-stage'), t.hasAttribute('data-top')); return; }
      if ((t = e.target.closest('[data-jump]'))) {
        var pid = t.getAttribute('data-jump'), p = MG.prompt(pid);
        if (p.stage !== stage) showStage(p.stage);
        var card = view.querySelector('[data-pid="' + pid + '"]');
        if (card) { card.scrollIntoView({ behavior: 'smooth', block: 'start' }); card.classList.remove('flash'); void card.offsetWidth; card.classList.add('flash'); }
        return;
      }
      if (e.target.closest('[data-download]')) {
        var md = MG.markdown(plan.profile, progress());
        var a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([md], { type: 'text/markdown' }));
        a.download = (plan.profile.name || 'playbook').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() + '-marketing-playbook.md';
        document.body.appendChild(a); a.click(); a.remove();
        UI.toast('Downloaded your playbook as a Markdown file.', 'ok');
        return;
      }
      if (e.target.closest('[data-delete]')) {
        UI.confirm({ title: 'Delete this plan?', text: 'Its progress and notes go too. This can\'t be undone.', ok: 'Delete', danger: true }).then(function (yes) {
          if (yes) UI.api('delete_plan', plan.id).then(function () { UI.toast('Plan deleted.'); UI.go('home'); });
        });
        return;
      }
      var card2 = e.target.closest('[data-pid]');
      if (!card2) return;
      var id = card2.getAttribute('data-pid'), prompt = book.prompts.filter(function (x) { return x.id === id; })[0];
      var act = (t = e.target.closest('[data-act]')) && t.getAttribute('data-act');
      if (act === 'more') { openPrompts[id] = !openPrompts[id]; redrawCard(id); return; }
      if (act === 'copy') {
        MG.copy(prompt.text).then(function (ok) { UI.toast(ok ? 'Copied. Paste it into ChatGPT, Claude or any AI chat.' : 'Couldn\'t copy: select the prompt text and copy it by hand.', ok ? 'ok' : 'error'); });
        UI.apiQuiet('track_copy', id).catch(function () {});
        return;
      }
      if (act === 'open') {  // the link opens the chat; copying too means a paste always works
        MG.copy(prompt.text);
        UI.toast('Opening ' + (t.getAttribute('data-where') === 'claude' ? 'Claude' : 'ChatGPT') + '. The prompt is also copied, in case it doesn\'t appear.');
        UI.apiQuiet('track_copy', id).catch(function () {});
        return;
      }
      if (act === 'star') {
        var on = progress().star.indexOf(id) < 0;
        persist(id, 'star', on); redrawCard(id);
        return;
      }
      if (act === 'note') {
        openNotes[id] = !openNotes[id];
        var c = redrawCard(id);
        if (openNotes[id]) c.querySelector('[data-note]').focus();
      }
    });
    view.addEventListener('change', function (e) {
      if (!e.target.matches('[data-act=done]')) return;
      var card = e.target.closest('[data-pid]'), id = card.getAttribute('data-pid'), on = e.target.checked;
      var s = book.stages.filter(function (x) { return x.id === stage; })[0];
      persist(id, 'done', on);
      var c = redrawCard(id);
      if (on) {
        c.classList.add('stamping');
        var d = progress().done, stageDone = s.prompts.every(function (p) { return d[p.id]; });
        if (stageDone) { MG.confetti(c.querySelector('.pc-stamp')); UI.toast('Stage ' + s.n + ', ' + s.title + ', complete. Nice work!', 'ok'); }
      }
      refreshProgress();
    });
    view.addEventListener('focusout', function (e) {
      if (!e.target.matches('[data-note]')) return;
      var id = e.target.closest('[data-pid]').getAttribute('data-pid'), val = e.target.value.trim();
      if (val === (progress().notes[id] || '')) return;
      persist(id, 'note', val).then(function () { if (kind !== 'example') UI.toast('Note saved.'); });
      var btn = e.target.closest('[data-pid]').querySelector('[data-act=note]');
      if (btn) { btn.classList.toggle('pc-hasnote', !!val); }
    });

    function start(p) {
      plan = p;
      stage = UI.store.get('stage.' + (plan.id || kind), null);
      draw();
    }
    view.innerHTML = '<div class="ui-wrap"><div class="ui-skel" style="height:480px"></div></div>';
    if (kind === 'example') { start({ profile: MG.EXAMPLE, progress: { done: { brief: '1', customer: '1' }, star: ['gbp'], notes: {} } }); return Promise.resolve(); }
    if (kind === 'local') {
      var g = UI.store.get('guestPlan', null);
      if (!g || !g.profile) { UI.go('build'); return Promise.resolve(); }
      start({ profile: g.profile, progress: g.progress });
      return Promise.resolve();
    }
    if (!UI.me) { UI.after = location.hash; UI.go('auth'); return Promise.resolve(); }
    return UI.api('get_plan', arg).then(function (r) { start(r.plan); });
  });
})();

/* ===== profile.html ===== */
(function () {
  var esc = UI.esc;
  UI.page('profile', { title: 'Your profile', auth: 'user' }, function (view, ctx) {
    var me = ctx.me;
    view.innerHTML = '<div class="ui-wrap ui-narrow"><div class="pf-head"><span class="ui-avatar">' + esc(UI.initials(me.name)) + '</span>' +
      '<div><h1>' + esc(me.name) + '</h1><div class="muted">' + esc(me.email) + (me.joined ? ' · member since ' + esc(UI.fmtDate(me.joined, { month: 'long', year: 'numeric' })) : '') + '</div></div></div>' +
      '<div class="pf-grid"><form class="ui-card ui-stack" data-name><h3>Your name</h3><label class="ui-field"><span>Shown to other people</span>' +
      '<input type="text" name="name" value="' + esc(me.name) + '" maxlength="60" required></label><button class="ui-btn primary" type="submit">Save</button></form>' +
      '<div class="ui-card ui-stack"><h3>Appearance</h3><p class="muted small">Follow your device, or pick one.</p><div data-theme-box></div>' +
      '<h3 style="margin-top:22px">Password</h3><p class="muted small">We\'ll email you a link to choose a new one.</p>' +
      '<button class="ui-btn" data-reset>' + UI.icon('mail') + 'Email me a reset link</button></div></div>' +
      '<div class="ui-card" style="margin-top:16px"><div class="pf-links">' +
      (me.is_admin ? '<a href="#admin" data-go="admin">' + UI.icon('shield') + 'Admin</a>' : '') +
      '<button data-feedback>' + UI.icon('chat') + 'Submit feedback</button>' +
      '<button data-lk-open="overview">' + UI.icon('lock') + 'Privacy &amp; Terms, and your data</button>' +
      '<button data-signout-here>' + UI.icon('logout') + 'Sign out</button></div></div></div>';
    function themeBox() {
      var t = UI.theme();
      view.querySelector('[data-theme-box]').innerHTML = '<div class="ui-seg">' + [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']].map(function (o) {
        return '<button type="button" data-theme-pick="' + o[0] + '" class="' + (t === o[0] ? 'on' : '') + '">' + o[1] + '</button>';
      }).join('') + '</div>';
    }
    themeBox();
    view.addEventListener('click', function (e) {
      var t = e.target.closest('[data-theme-pick]');
      if (t) { UI.setTheme(t.getAttribute('data-theme-pick')); themeBox(); UI.renderChrome(); return; }
      if (e.target.closest('[data-reset]')) {
        UI.busy(e.target.closest('[data-reset]'), UI.auth('reset', { email: me.email })).then(function (r) { UI.toast(r.message, 'ok'); });
      }
      if (e.target.closest('[data-signout-here]')) UI.auth('logout');
    });
    view.querySelector('[data-name]').addEventListener('submit', function (e) {
      e.preventDefault();
      var v = UI.formData(e.target);
      UI.busy(e.target.querySelector('[type=submit]'), UI.api('update_profile', v.name)).then(function (r) {
        UI.setMe(r.me); ctx.me = r.me; UI.toast('Saved', 'ok');
        view.querySelector('.pf-head h1').textContent = r.me.name;
      });
    });
  });
})();

/* ===== wins.html ===== */
(function () {
  var esc = UI.esc;

  function winHtml(w) {
    return '<article class="ui-card wn' + (w.hidden ? ' is-hidden' : '') + '" data-id="' + esc(w.id) + '">' +
      '<div class="ui-row"><span class="ui-badge brand">' + esc(MG.label(MG.CHANNELS, w.channel)) + '</span><span class="ui-badge">' + esc(MG.label(MG.TYPES, w.business_type)) + '</span>' +
      (w.demo ? '<span class="ui-badge warn" title="Made up to show the format">Example</span>' : '') + (w.hidden ? '<span class="ui-badge bad">Hidden</span>' : '') + '</div>' +
      '<h3>' + esc(w.title) + '</h3><p class="story">' + esc(w.story) + '</p>' +
      (w.result ? '<div class="res">' + UI.icon('trophy') + '<span>' + esc(w.result) + '</span></div>' : '') +
      '<div class="wn-foot"><span>' + esc(w.author) + ' · ' + esc(UI.ago(w.created)) + '</span><span class="ui-spacer"></span>' +
      '<button type="button" class="ui-btn sm wn-clap' + (w.clapped ? ' on' : '') + '" data-clap aria-pressed="' + w.clapped + '">' + UI.icon('clap') + 'This helped · ' + w.claps + '</button>' +
      (w.can_delete ? '<button type="button" class="ui-btn ghost icon sm" data-del aria-label="Delete">' + UI.icon('trash') + '</button>' : '') + '</div></article>';
  }

  function postForm() {
    var m = UI.modal('<h2>Share a win</h2><p class="muted">One marketing move that worked. Be specific: what you did, and what changed. Your display name is shown; your email never is.</p>' +
      '<form class="ui-stack" data-post>' +
      '<label class="ui-field"><span>Title</span><input type="text" name="title" maxlength="120" required placeholder="Asking at the till took us from 14 to 61 reviews"></label>' +
      '<div class="ui-grid two"><label class="ui-field"><span>Channel</span><select name="channel">' + MG.CHANNELS.map(function (c) { return '<option value="' + c[0] + '">' + esc(c[1]) + '</option>'; }).join('') + '</select></label>' +
      '<label class="ui-field"><span>Your business</span><select name="business_type">' + MG.TYPES.map(function (t) { return '<option value="' + t[0] + '">' + esc(t[1]) + '</option>'; }).join('') + '</select></label></div>' +
      '<label class="ui-field"><span>What did you do?</span><textarea name="story" rows="5" maxlength="1500" required placeholder="The steps, the tools, what you\'d do differently."></textarea></label>' +
      '<label class="ui-field"><span>The result <em>(optional)</em></span><input type="text" name="result" maxlength="200" placeholder="Cost per call went from $48 to $31"></label>' +
      '<p class="ui-hint">Please share honest numbers only, and nothing private about your customers.</p>' +
      '<div class="ui-row end"><button type="button" class="ui-btn ghost" data-close>Cancel</button><button class="ui-btn primary" type="submit">' + UI.icon('trophy') + 'Post it</button></div></form>', { wide: true });
    return m;
  }

  UI.page('wins', { title: 'Wins', nav: 'Wins', icon: 'trophy', order: 40 }, function (view, ctx) {
    var channel = ctx.args[0] || '';
    var wins = [];
    view.innerHTML = '<div class="ui-wrap"><div class="ui-page-head"><div><div class="eyebrow">Wins board</div><h1>What <em>actually worked</em></h1>' +
      '<p class="muted" style="max-width:40em">Small owners sharing one marketing move each. Steal freely. Posts marked Example are made up to show the format.</p></div>' +
      (UI.me ? '<button type="button" class="ui-btn primary" data-new>' + UI.icon('plus') + 'Share a win</button>' : '') + '</div>' +
      (UI.me ? '' : '<div class="ui-card wn-cta"><p><b>Something worked for you?</b> Create a free account to share it and to clap for the wins that helped you.</p>' +
        '<a class="ui-btn primary sm" href="#auth/signup" data-go="auth/signup">Join free</a></div>') +
      '<div class="wn-filter" role="group" aria-label="Filter by channel"><button type="button" data-ch="" class="' + (channel ? '' : 'on') + '">All</button>' +
      MG.CHANNELS.map(function (c) { return '<button type="button" data-ch="' + c[0] + '" class="' + (channel === c[0] ? 'on' : '') + '">' + esc(c[1]) + '</button>'; }).join('') + '</div>' +
      '<div data-list><div class="ui-skel" style="height:300px"></div></div></div>';

    function draw() {
      var list = view.querySelector('[data-list]');
      var shown = wins.filter(function (w) { return !channel || w.channel === channel; });
      list.innerHTML = shown.length ? '<div class="wn-list">' + shown.map(winHtml).join('') + '</div>'
        : '<div class="ui-empty">' + UI.icon('trophy') + '<h3>No wins here yet</h3><p>' + (UI.me ? 'Be the first: share what worked for you.' : 'Sign up and be the first to share one.') + '</p></div>';
    }
    function replace(w) { wins = wins.map(function (x) { return x.id === w.id ? w : x; }); draw(); }

    view.addEventListener('click', function (e) {
      var t;
      if ((t = e.target.closest('[data-ch]'))) {
        channel = t.getAttribute('data-ch');
        view.querySelectorAll('[data-ch]').forEach(function (b) { b.classList.toggle('on', b === t); });
        draw();
        return;
      }
      if (e.target.closest('[data-new]')) {
        var m = postForm(), f = m.el.querySelector('[data-post]');
        f.addEventListener('submit', function (ev) {
          ev.preventDefault();
          UI.busy(f.querySelector('[type=submit]'), UI.api('post_win', UI.formData(f))).then(function (r) {
            m.close(); wins.unshift(r.win); draw(); UI.toast('Posted. Thank you for sharing!', 'ok');
            if (MG.confetti) MG.confetti(view.querySelector('[data-id="' + r.win.id + '"]'));
          });
        });
        return;
      }
      var card = e.target.closest('[data-id]');
      if (!card) return;
      var id = card.getAttribute('data-id');
      if (e.target.closest('[data-clap]')) {
        if (!UI.me) { UI.toast('Sign in to clap for a win.'); UI.after = '#wins'; UI.go('auth'); return; }
        UI.apiQuiet('clap_win', id).then(function (r) { replace(r.win); });
        return;
      }
      if (e.target.closest('[data-del]')) {
        UI.confirm({ title: 'Delete this win?', text: 'This can\'t be undone.', ok: 'Delete', danger: true }).then(function (yes) {
          if (yes) UI.api('delete_win', id).then(function () { wins = wins.filter(function (w) { return w.id !== id; }); draw(); UI.toast('Deleted.'); });
        });
      }
    });

    return UI.api('list_wins', null).then(function (r) { wins = r.wins; draw(); });
  });
})();
