/* App shell: hash router, event delegation, live timers, toasts for new
 * notifications and the floating role switcher. */
EAMS.App = (function () {
  const { Store, UI, Views } = EAMS;
  const root = document.getElementById('app');

  /** Per-tab, non-persisted UI state (form drafts, open menus, login errors…). */
  const ui = { drafts: {}, login: {}, openDropdown: null, highlight: null, switcherOpen: false };
  let lastNotifId = Math.max(0, ...Store.state.notifications.map((n) => n.id));
  let lastRouteKey = '';
  let redirects = 0;

  const ROLES = [
    { key: 'caller', label: 'Caller', icon: 'phone', home: '#/caller/home', platform: 'Mobile' },
    { key: 'dispatcher', label: 'Dispatcher', icon: 'headset', home: '#/dispatcher/dashboard', platform: 'Web' },
    { key: 'crew', label: 'Ambulance crew', icon: 'ambulance', home: '#/crew/home', platform: 'Mobile' },
    { key: 'hospital', label: 'Hospital staff', icon: 'hospital', home: '#/hospital/incoming', platform: 'Web' },
    { key: 'admin', label: 'Admin', icon: 'shield', home: '#/admin/data', platform: 'Web' },
  ];

  function parse() {
    const h = location.hash.replace(/^#\/?/, '');
    const [role, screen, param] = h.split('/');
    return { role: role || 'landing', screen: screen || '', param: param ? decodeURIComponent(param) : '' };
  }
  function navigate(route) { if (location.hash === route) render(); else location.hash = route; }
  /** Replace the current route without adding history (used by guards). */
  function redirect(route) { history.replaceState(null, '', location.pathname + location.search + route); return null; }

  /* ---------- rendering ---------- */
  function render() {
    const R = parse();
    const view = Views[R.role] || Views.landing;
    const keyNow = R.role + '/' + R.screen + '/' + R.param;
    // remember focus + scroll positions so live re-renders don't disturb the user
    const ae = document.activeElement;
    const focusId = ae && ae.id && root.contains(ae) ? ae.id : null;
    const selection = focusId && ae.setSelectionRange && /text|search|tel|password|number|textarea/.test(ae.type || ae.tagName.toLowerCase()) ? [ae.selectionStart, ae.selectionEnd] : null;
    const scrolls = {};
    root.querySelectorAll('[data-keep-scroll]').forEach((el) => { scrolls[el.dataset.keepScroll] = el.scrollTop; });
    const sameRoute = keyNow === lastRouteKey;

    const html = view.render(R.screen, R.param, R);
    if (html == null) { // a guard redirected
      if (++redirects < 5) return render();
      redirects = 0; return;
    }
    redirects = 0;
    const layout = view.layout || 'plain';
    root.className = 'layout-' + layout + ' role-' + R.role;
    root.innerHTML = layout === 'phone' ? phoneFrame(html, R) : html;

    if (sameRoute) {
      root.querySelectorAll('[data-keep-scroll]').forEach((el) => { if (scrolls[el.dataset.keepScroll] != null) el.scrollTop = scrolls[el.dataset.keepScroll]; });
      if (focusId) { const el = document.getElementById(focusId); if (el) { el.focus({ preventScroll: true }); if (selection && el.setSelectionRange) try { el.setSelectionRange(selection[0], selection[1]); } catch (e) { /* noop */ } } }
      if (ui.openDropdown) { const m = root.querySelector('.' + ui.openDropdown); if (m) m.hidden = false; }
    } else {
      ui.openDropdown = null;
      lastRouteKey = keyNow;
      if (view.onEnter) view.onEnter(R.screen, R.param, R);
      const sc = root.querySelector('[data-keep-scroll]'); if (sc) sc.scrollTop = 0;
      window.scrollTo(0, 0);
    }
    applyHighlight();
    updateTimers();
    renderSwitcher();
    toastNew(R.role);
  }

  function phoneFrame(html, R) {
    return '<div class="stage">' +
      '<div class="phone" role="region" aria-label="' + (R.role === 'crew' ? 'Ambulance crew' : 'Caller') + ' mobile app">' +
      '<div class="phone-status" aria-hidden="true"><span data-clock></span><span class="notch"></span><span class="status-icons">' +
      '<svg width="17" height="11" viewBox="0 0 17 11"><rect x="0" y="7" width="3" height="4" rx="1" fill="currentColor"/><rect x="4.5" y="5" width="3" height="6" rx="1" fill="currentColor"/><rect x="9" y="2.5" width="3" height="8.5" rx="1" fill="currentColor"/><rect x="13.5" y="0" width="3" height="11" rx="1" fill="currentColor"/></svg>' +
      '<svg width="25" height="12" viewBox="0 0 25 12"><rect x=".5" y=".5" width="21" height="11" rx="3" fill="none" stroke="currentColor" opacity=".4"/><rect x="2" y="2" width="16" height="8" rx="2" fill="currentColor"/><rect x="23" y="4" width="1.5" height="4" rx=".7" fill="currentColor" opacity=".4"/></svg></span></div>' +
      '<div class="phone-screen">' + html + '</div></div></div>';
  }

  function applyHighlight() {
    root.querySelectorAll('.demo-highlight').forEach((el) => el.classList.remove('demo-highlight'));
    if (!ui.highlight) return;
    const el = document.querySelector(ui.highlight);
    if (el) { el.classList.add('demo-highlight'); el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  }

  /** Toast any notification addressed to the role currently on screen. */
  function toastNew(role) {
    const fresh = Store.state.notifications.filter((n) => n.id > lastNotifId);
    if (!fresh.length) return;
    lastNotifId = Math.max(lastNotifId, ...fresh.map((n) => n.id));
    if (!['dispatcher', 'hospital', 'crew', 'caller'].includes(role)) return;
    const mine = new Set(Store.notificationsFor(role).map((n) => n.id));
    fresh.filter((n) => mine.has(n.id)).reverse().slice(-3).forEach((n) => UI.toast(n.text, n.kind));
  }

  /* ---------- live timers (no re-render) ---------- */
  function updateTimers() {
    const t = Date.now();
    document.querySelectorAll('[data-countdown]').forEach((el) => {
      const rem = +el.dataset.countdown - t; const fmt = el.dataset.fmt;
      el.textContent = fmt === 'sec' ? Math.max(0, Math.ceil(rem / 1000)) : fmt === 'min' ? Math.max(0, Math.ceil(rem / 60000)) + ' min' : UI.mmss(rem);
      el.classList.toggle('warn', +el.dataset.warn > 0 && rem < +el.dataset.warn);
      el.classList.toggle('over', rem <= 0);
    });
    document.querySelectorAll('[data-elapsed]').forEach((el) => { el.textContent = UI.mmss(t - +el.dataset.elapsed); });
    document.querySelectorAll('[data-ring]').forEach((el) => {
      const rem = Math.max(0, +el.dataset.ring - t); const c = +el.dataset.c;
      el.style.strokeDashoffset = String(c * (1 - rem / +el.dataset.total));
      el.classList.toggle('warn', rem < 15000);
    });
    document.querySelectorAll('[data-clock]').forEach((el) => { el.textContent = Store.fmtTime(t); });
    document.querySelectorAll('[data-trip]').forEach((el) => {
      const d = JSON.parse(el.dataset.trip);
      const p = Store.pointAlong({ route: d.r, start: d.s, end: d.e }, t);
      el.style.transform = 'translate(' + p.x + 'px,' + p.y + 'px)';
    });
    document.querySelectorAll('[data-trip-km]').forEach((el) => {
      const d = JSON.parse(el.dataset.tripKm);
      const f = Math.min(1, Math.max(0, (t - d.s) / (d.e - d.s)));
      el.textContent = (d.km * (1 - f)).toFixed(1);
    });
    const v = Views[parse().role];
    if (v && v.tick) v.tick();
  }

  /* ---------- floating role switcher ---------- */
  function renderSwitcher() {
    const R = parse();
    const el = document.getElementById('switcher-root');
    const count = (role) => (role === 'admin' ? 0 : Store.notificationsFor(role).filter((n) => !n.read).length);
    el.innerHTML = '<div class="switcher' + (ui.switcherOpen ? ' open' : '') + '">' +
      (ui.switcherOpen ? '<div class="switcher-menu" role="menu" aria-label="Switch role">' +
        '<p class="section-label">Switch role · shared live data</p>' +
        ROLES.map((r) => { const c = count(r.key); return '<a role="menuitem" href="' + r.home + '" class="sw-item' + (R.role === r.key ? ' active' : '') + '" data-sw-close>' + UI.icon(r.icon, 20) + '<span>' + r.label + '<small>' + r.platform + '</small></span>' + (c ? '<b class="sw-count">' + c + '</b>' : '') + '</a>'; }).join('') +
        '<div class="sw-foot"><a href="#/" class="sw-small" data-sw-close>' + UI.icon('home', 16) + ' Start page</a>' +
        '<button class="sw-small" data-sw-demo>' + UI.icon('play', 16) + ' Run demo</button></div></div>' : '') +
      '<button class="switcher-btn" aria-expanded="' + ui.switcherOpen + '" aria-label="Switch role" data-sw-toggle>' + UI.icon(ui.switcherOpen ? 'x' : 'switch', 20) + '<span>' + (ROLES.find((r) => r.key === R.role) || { label: 'Roles' }).label + '</span></button></div>';
  }
  document.getElementById('switcher-root').addEventListener('click', (e) => {
    if (e.target.closest('[data-sw-toggle]')) { ui.switcherOpen = !ui.switcherOpen; renderSwitcher(); }
    else if (e.target.closest('[data-sw-close]')) { ui.switcherOpen = false; setTimeout(renderSwitcher); }
    else if (e.target.closest('[data-sw-demo]')) { ui.switcherOpen = false; renderSwitcher(); EAMS.Demo.start(); }
  });

  /* ---------- global actions shared by all views ---------- */
  const Global = {
    nav(el) { navigate(el.dataset.arg); },
    'toggle-notifs'(el, e, R) {
      const m = root.querySelector('.notif-menu'); const open = m.hidden;
      root.querySelectorAll('.dropdown-menu').forEach((x) => { x.hidden = true; });
      m.hidden = !open; ui.openDropdown = open ? 'notif-menu' : null;
    },
    'toggle-user'() {
      const m = root.querySelector('.user-menu'); const open = m.hidden;
      root.querySelectorAll('.dropdown-menu').forEach((x) => { x.hidden = true; });
      m.hidden = !open; ui.openDropdown = open ? 'user-menu' : null;
    },
    'mark-read'(el, e, R) { Store.markRead(R.role); },
    logout(el, e, R) { ui.openDropdown = null; Store.logout(R.role); UI.toast('Signed out', 'info'); navigate('#/' + R.role + '/login'); },
    'fill-cred'(el) { const u = document.getElementById('login-user'); const p = document.getElementById('login-pass'); u.value = el.dataset.arg; p.value = 'demo123'; p.focus(); },
    /** Shared login submit for dispatcher / hospital / admin. */
    login(form, e, R) {
      const fd = new FormData(form);
      const res = Store.login(R.role, fd.get('username'), fd.get('password'));
      ui.login[R.role] = { error: res.error, locked: res.locked, username: fd.get('username') };
      if (res.ok) { ui.login[R.role] = {}; navigate(ROLES.find((r) => r.key === R.role).home); }
      else render();
    },
  };

  /* ---------- event delegation ---------- */
  root.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!e.target.closest('.dropdown')) {
      root.querySelectorAll('.dropdown-menu').forEach((x) => { x.hidden = true; });
      ui.openDropdown = null;
    }
    if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return;
    const R = parse(); const view = Views[R.role] || {};
    const fn = (view.actions && view.actions[el.dataset.action]) || Global[el.dataset.action];
    if (fn) { e.preventDefault(); fn(el, e, R); }
  });
  root.addEventListener('keydown', (e) => {
    const el = e.target.closest('[data-action][role=button]');
    if (el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); el.click(); }
  });
  root.addEventListener('submit', (e) => {
    const form = e.target.closest('form[data-submit]'); if (!form) return;
    e.preventDefault();
    const R = parse(); const view = Views[R.role] || {};
    const fn = (view.actions && view.actions[form.dataset.submit]) || Global[form.dataset.submit];
    if (fn) fn(form, e, R);
  });
  /** Inputs with data-model="scope.key" write into ui.drafts without re-rendering. */
  function onInput(e) {
    const el = e.target; const path = el.dataset && el.dataset.model; if (!path) return;
    const [scope, key] = path.split('.');
    ui.drafts[scope] = ui.drafts[scope] || {};
    ui.drafts[scope][key] = el.type === 'checkbox' ? el.checked : el.value;
    if (el.hasAttribute('data-rerender')) render();
  }
  root.addEventListener('input', onInput);
  root.addEventListener('change', onInput);

  /* ---------- boot ---------- */
  window.addEventListener('hashchange', () => { ui.switcherOpen = false; render(); });
  const api = { render, navigate, redirect, parse, ui, ROLES, updateTimers };
  EAMS.App = api; // publish before the first render – views call EAMS.App.*
  Store.subscribe(() => render());
  setInterval(() => { Store.tick(); updateTimers(); }, 1000);
  render();
  return api;
})();
