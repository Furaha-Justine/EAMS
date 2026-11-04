/* Reusable UI components. Each returns an HTML string; behaviour is wired
 * through data-action attributes handled by the router (js/app.js). */
EAMS.UI = (function () {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function icon(name, size = 20, cls = '') {
    return '<svg class="icon ' + cls + '" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + (EAMS.Icons[name] || '') + '</svg>';
  }

  /** Button({ label, variant: primary|secondary|danger|ghost|white|outline-white, icon, action, arg, block, size: sm|lg, disabled, type, attrs }) */
  function Button(o) {
    const cls = ['btn', 'btn-' + (o.variant || 'primary'), o.block ? 'btn-block' : '', o.size ? 'btn-' + o.size : '', o.cls || ''].join(' ');
    const attrs = [
      o.action ? 'data-action="' + o.action + '"' : '',
      o.arg != null ? 'data-arg="' + esc(o.arg) + '"' : '',
      o.disabled ? 'disabled aria-disabled="true"' : '',
      o.title ? 'title="' + esc(o.title) + '"' : '',
      o.attrs || '',
    ].join(' ');
    return '<button type="' + (o.type || 'button') + '" class="' + cls + '" ' + attrs + '>' +
      (o.icon ? icon(o.icon, o.size === 'sm' ? 16 : 20) : '') + '<span>' + esc(o.label) + '</span>' +
      (o.iconRight ? icon(o.iconRight, 18) : '') + '</button>';
  }
  function IconButton(o) {
    return '<button type="button" class="icon-btn ' + (o.cls || '') + '" aria-label="' + esc(o.label) + '" title="' + esc(o.label) + '" ' +
      (o.action ? 'data-action="' + o.action + '"' : '') + (o.arg != null ? ' data-arg="' + esc(o.arg) + '"' : '') + ' ' + (o.attrs || '') + '>' +
      icon(o.icon, o.size || 22) + (o.dot ? '<span class="dot-badge">' + o.dot + '</span>' : '') + '</button>';
  }

  const PRIORITY = { critical: 'Critical', urgent: 'Urgent', normal: 'Normal' };
  function Badge(priority, o = {}) {
    return '<span class="badge badge-' + priority + (o.solid ? ' badge-solid' : '') + (o.lg ? ' badge-lg' : '') + '">' + esc(o.label || PRIORITY[priority] || priority) + '</span>';
  }

  const STATUS = {
    received: ['New – verify', 'chip-red'], verified: ['Verified', 'chip-blue'], waiting: ['Waiting list', 'chip-orange'],
    offered: ['Waiting for crew', 'chip-orange'], enroute: ['On the way', 'chip-orange'], atPatient: ['At patient', 'chip-blue'],
    toHospital: ['To hospital', 'chip-blue'], atHospital: ['At hospital', 'chip-blue'], handedOver: ['Handed over', 'chip-green'],
    closed: ['Closed', 'chip-gray'], false: ['False call', 'chip-gray'],
  };
  function StatusChip(status) { const s = STATUS[status] || [status, 'chip-gray']; return '<span class="chip ' + s[1] + '">' + esc(s[0]) + '</span>'; }

  const AMB = { available: ['Available', 'chip-green'], assigned: ['Assigned – pending', 'chip-orange'], enroute: ['On the way', 'chip-orange'], busy: ['Busy', 'chip-orange'], out: ['Out of service', 'chip-gray'] };
  function AmbStatus(a) {
    const st = a.disabled ? 'out' : a.status;
    const s = AMB[st] || [st, 'chip-gray'];
    return '<span class="chip ' + s[1] + '"><i class="dot dot-' + (st === 'available' ? 'green' : st === 'out' ? 'gray' : 'orange') + '"></i>' + s[0] + '</span>';
  }
  const ambColor = (a) => (a.disabled || a.status === 'out') ? '#94A3B8' : a.status === 'available' ? '#1B5E20' : '#EA7A1E';

  function Card(content, cls = '', attrs = '') { return '<section class="card ' + cls + '" ' + attrs + '>' + content + '</section>'; }
  function SectionLabel(text, extra = '') { return '<h3 class="section-label">' + esc(text) + extra + '</h3>'; }

  /** Mobile header bar. */
  function Header(o) {
    return '<header class="m-header">' +
      (o.back ? IconButton({ icon: 'arrowLeft', label: 'Back', action: 'nav', arg: o.back }) : '') +
      (o.left || '') +
      (o.title ? '<h1 class="m-title">' + esc(o.title) + '</h1>' : '') +
      '<div class="m-header-right">' + (o.right || '') + '</div></header>';
  }
  function Logo(size = 36) {
    return '<span class="logo" style="width:' + size + 'px;height:' + size + 'px;border-radius:' + Math.round(size * 0.3) + 'px">' + icon('ambulance', Math.round(size * 0.58)) + '</span>';
  }
  /** BottomNav(items, active) – items: [{key, label, icon, route}] */
  function BottomNav(items, active) {
    return '<nav class="bottom-nav" aria-label="Main">' + items.map((it) =>
      '<a href="' + it.route + '" class="bn-item' + (it.key === active ? ' active' : '') + '"' + (it.key === active ? ' aria-current="page"' : '') + '>' + icon(it.icon, 22) + '<span>' + esc(it.label) + '</span></a>'
    ).join('') + '</nav>';
  }
  /** Timeline(steps) – steps: [{label, time, state: done|current|todo|warn, note}] */
  function Timeline(steps) {
    return '<ol class="timeline">' + steps.map((s) =>
      '<li class="tl-step tl-' + s.state + '"><span class="tl-dot">' + (s.state === 'done' ? icon('check', 14) : '') + '</span>' +
      '<div class="tl-body"><div class="tl-label">' + esc(s.label) + '</div>' +
      (s.note ? '<div class="tl-note">' + s.note + '</div>' : '') + '</div>' +
      '<span class="tl-time">' + esc(s.time || '') + '</span></li>'
    ).join('') + '</ol>';
  }
  function Stepper(o) {
    return '<div class="stepper" role="group" aria-label="' + esc(o.label) + '">' +
      '<button type="button" class="step-btn" data-action="' + o.action + '" data-arg="-1" aria-label="Decrease"' + (o.value <= o.min ? ' disabled' : '') + '>' + icon('minus', 20) + '</button>' +
      '<output class="step-val" aria-live="polite">' + o.value + '</output>' +
      '<button type="button" class="step-btn" data-action="' + o.action + '" data-arg="1" aria-label="Increase"' + (o.value >= o.max ? ' disabled' : '') + '>' + icon('plus', 20) + '</button></div>';
  }
  function EmptyState(o) {
    return '<div class="empty">' + '<span class="empty-icon">' + icon(o.icon || 'info', 28) + '</span><h4>' + esc(o.title) + '</h4>' + (o.text ? '<p>' + esc(o.text) + '</p>' : '') + (o.action || '') + '</div>';
  }
  /** Live countdown text (updated each second by Timers). fmt: mmss | sec | min */
  const Countdown = (until, fmt = 'mmss', warnMs = 0) => '<span class="countdown" data-countdown="' + until + '" data-fmt="' + fmt + '" data-warn="' + warnMs + '"></span>';
  const Elapsed = (since) => '<span class="elapsed" data-elapsed="' + since + '"></span>';
  /** Circular countdown ring. */
  function Ring(until, total, size = 120, label = '') {
    const r = size / 2 - 7, c = 2 * Math.PI * r;
    return '<div class="ring" style="width:' + size + 'px;height:' + size + 'px"><svg width="' + size + '" height="' + size + '" aria-hidden="true">' +
      '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" class="ring-bg"/>' +
      '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" class="ring-fg" stroke-dasharray="' + c + '" data-ring="' + until + '" data-total="' + total + '" data-c="' + c + '" transform="rotate(-90 ' + size / 2 + ' ' + size / 2 + ')"/></svg>' +
      '<div class="ring-text">' + Countdown(until, 'sec') + (label ? '<small>' + label + '</small>' : '') + '</div></div>';
  }
  function Field(o) {
    return '<div class="field' + (o.error ? ' has-error' : '') + '"><label for="' + o.id + '">' + esc(o.label) + (o.required ? ' <span aria-hidden="true" class="req">*</span>' : '') + '</label>' + o.input +
      (o.hint ? '<p class="hint">' + esc(o.hint) + '</p>' : '') + (o.error ? '<p class="error" role="alert">' + esc(o.error) + '</p>' : '') + '</div>';
  }
  function KV(rows) { return '<dl class="kv">' + rows.map((r) => '<div><dt>' + esc(r[0]) + '</dt><dd>' + r[1] + '</dd></div>').join('') + '</dl>'; }
  function Segmented(o) {
    return '<div class="segmented" role="radiogroup" aria-label="' + esc(o.label) + '">' + o.options.map((op) =>
      '<button type="button" role="radio" aria-checked="' + (op.value === o.value) + '" class="seg' + (op.value === o.value ? ' on' : '') + (op.tone ? ' seg-' + op.tone : '') + '" data-action="' + o.action + '" data-arg="' + op.value + '">' + esc(op.label) + '</button>'
    ).join('') + '</div>';
  }

  /* ---------- toasts ---------- */
  function toast(text, kind = 'info', ms = 4200) {
    const root = document.getElementById('toast-root');
    const el = document.createElement('div');
    const ic = { success: 'checkCircle', warn: 'alert', critical: 'siren', error: 'alert', info: 'bell', new: 'bell', incoming: 'ambulance', offer: 'siren' }[kind] || 'bell';
    el.className = 'toast toast-' + kind;
    el.innerHTML = icon(ic, 20) + '<span>' + esc(text) + '</span><button class="toast-x" aria-label="Dismiss">' + icon('x', 16) + '</button>';
    el.querySelector('.toast-x').onclick = () => el.remove();
    root.appendChild(el);
    while (root.children.length > 4) root.firstChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, ms);
  }

  /* ---------- modal ---------- */
  /** modal({ title, body, actions:[{label, variant, value}], onAction(value, root) → false keeps it open }) → Promise<value|null> */
  function modal(o) {
    return new Promise((resolve) => {
      const root = document.getElementById('modal-root');
      const prev = document.activeElement;
      const wrap = document.createElement('div');
      wrap.className = 'modal-backdrop';
      wrap.innerHTML = '<div class="modal ' + (o.cls || '') + '" role="dialog" aria-modal="true" aria-labelledby="modal-title">' +
        '<div class="modal-head"><h2 id="modal-title">' + esc(o.title) + '</h2>' + IconButton({ icon: 'x', label: 'Close', attrs: 'data-close' }) + '</div>' +
        '<form class="modal-body" novalidate>' + (o.body || '') + '<div class="modal-actions">' +
        (o.actions || [{ label: 'Cancel', variant: 'secondary', value: null }, { label: 'OK', value: 'ok' }]).map((a, i) =>
          '<button type="' + (a.value != null && i === (o.actions || []).length - 1 ? 'submit' : 'button') + '" class="btn btn-' + (a.variant || 'primary') + '" data-val="' + (a.value == null ? '' : a.value) + '">' + esc(a.label) + '</button>').join('') +
        '</div></form></div>';
      const close = (v) => { wrap.remove(); if (prev && prev.focus) prev.focus(); resolve(v); };
      const fire = (v) => {
        if (v === null || v === '') return close(null);
        const keep = o.onAction ? o.onAction(v, wrap) : true;
        if (keep !== false) close(v);
      };
      wrap.addEventListener('click', (e) => {
        if (e.target === wrap || e.target.closest('[data-close]')) return close(null);
        const b = e.target.closest('button[data-val]');
        if (b && b.type !== 'submit') { e.preventDefault(); fire(b.dataset.val || null); }
      });
      wrap.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); const b = wrap.querySelector('button[type=submit]'); fire(b.dataset.val); });
      wrap.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') close(null);
        if (e.key === 'Tab') { // simple focus trap
          const f = wrap.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
          if (!f.length) return;
          const first = f[0], last = f[f.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      });
      root.appendChild(wrap);
      const focusEl = wrap.querySelector('input, textarea, select') || wrap.querySelector('.modal-actions .btn:last-child');
      setTimeout(() => focusEl && focusEl.focus(), 30);
    });
  }
  /** Ask for a mandatory reason (decline, false call, choose another…). Resolves to the text or null. */
  function askReason(o) {
    const opts = o.options || [];
    const body = (o.text ? '<p class="muted">' + esc(o.text) + '</p>' : '') +
      (opts.length ? '<div class="reason-opts" role="radiogroup" aria-label="Reason">' + opts.map((r, i) =>
        '<label class="radio-row"><input type="radio" name="reason" value="' + esc(r) + '"' + (i === 0 ? ' checked' : '') + '> <span>' + esc(r) + '</span></label>').join('') + '</div>' : '') +
      (o.extra || '') +
      '<div class="field"><label for="reason-text">' + (opts.length ? 'Details (optional for listed reasons)' : 'Reason') + ' </label><textarea id="reason-text" rows="3" placeholder="' + esc(o.placeholder || 'Type the reason…') + '"></textarea><p class="error" hidden role="alert">A reason is required.</p></div>';
    let result = null;
    return modal({
      title: o.title, body, cls: o.cls,
      actions: [{ label: 'Cancel', variant: 'secondary', value: null }, { label: o.confirmLabel || 'Confirm', variant: o.danger ? 'danger' : 'primary', value: 'ok' }],
      onAction(v, root) {
        const checked = root.querySelector('input[name=reason]:checked');
        const txt = root.querySelector('#reason-text').value.trim();
        const reason = [checked && checked.value !== 'Other' ? checked.value : '', txt].filter(Boolean).join(' – ');
        if (!reason) { root.querySelector('.error').hidden = false; root.querySelector('#reason-text').focus(); return false; }
        result = { reason, form: root };
        if (o.validate) { const e = o.validate(root); if (e) { root.querySelector('.error').textContent = e; root.querySelector('.error').hidden = false; return false; } }
        return true;
      },
    }).then((v) => (v ? result : null));
  }

  /* ---------- desktop shell (dispatcher / hospital / admin) ---------- */
  function Shell(o) {
    const nav = o.nav.map((n) =>
      '<a href="' + n.route + '" class="side-link' + (n.key === o.active ? ' active' : '') + '"' + (n.key === o.active ? ' aria-current="page"' : '') + '>' + icon(n.icon, 20) + '<span>' + esc(n.label) + '</span>' + (n.count ? '<span class="side-count' + (n.hot ? ' hot' : '') + '">' + n.count + '</span>' : '') + '</a>'
    ).join('');
    const notifs = o.notifications || [];
    const unread = notifs.filter((n) => !n.read).length;
    return '<div class="shell">' +
      '<aside class="sidebar" aria-label="Sidebar"><div class="side-brand">' + Logo(36) + '<div><strong>EAMS</strong><small>' + esc(o.roleLabel) + '</small></div></div>' +
      '<nav class="side-nav" aria-label="' + esc(o.roleLabel) + '">' + nav + '</nav>' +
      '<div class="side-foot"><span class="live-dot"></span> Live · <span data-clock></span></div></aside>' +
      '<div class="shell-main"><header class="topbar"><div class="topbar-left"><h1>' + esc(o.title) + '</h1>' + (o.subtitle ? '<p>' + o.subtitle + '</p>' : '') + '</div>' +
      '<div class="topbar-right">' + (o.topActions || '') +
      '<div class="dropdown"><button class="icon-btn" data-action="toggle-notifs" aria-label="Notifications (' + unread + ' unread)" aria-haspopup="true">' + icon('bell', 22) + (unread ? '<span class="dot-badge">' + unread + '</span>' : '') + '</button>' +
      '<div class="dropdown-menu notif-menu" hidden><div class="dd-head"><strong>Notifications</strong><button class="link" data-action="mark-read">Mark all read</button></div>' +
      (notifs.length ? notifs.slice(0, 12).map((n) => '<div class="notif' + (n.read ? '' : ' unread') + '"' + (n.requestId && o.notifRoute ? ' data-action="nav" data-arg="' + o.notifRoute(n) + '" role="button" tabindex="0"' : '') + '><span class="notif-dot notif-' + (n.kind || 'info') + '"></span><div><p>' + esc(n.text) + '</p><time>' + EAMS.Store.fmtTime(n.at) + '</time></div></div>').join('') : '<p class="muted pad">No notifications yet.</p>') +
      '</div></div>' +
      '<div class="dropdown"><button class="user-btn" data-action="toggle-user" aria-haspopup="true"><span class="avatar">' + esc(initials(o.userName)) + '</span><span class="user-name">' + esc(o.userName) + '<small>' + esc(o.userRole) + '</small></span>' + icon('chevronDown', 16) + '</button>' +
      '<div class="dropdown-menu user-menu" hidden><button class="dd-item" data-action="logout">' + icon('logout', 18) + ' Sign out</button></div></div>' +
      '</div></header><div class="content" id="content">' + o.body + '</div></div></div>';
  }
  function initials(n) { return (n || '?').split(/[\s,]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase(); }

  /** Shared login card for web roles. */
  function LoginCard(o) {
    return '<div class="login-page"><div class="login-card card">' +
      '<div class="login-brand">' + Logo(52) + '<div><h1>EAMS</h1><p>' + esc(o.roleLabel) + ' sign in</p></div></div>' +
      (o.locked ? '<div class="alert alert-red" role="alert">' + icon('lock', 20) + '<div><strong>Account locked</strong><p>Too many failed attempts (5). Ask the system administrator to unlock your account.</p></div></div>' : '') +
      (o.error && !o.locked ? '<div class="alert alert-orange" role="alert">' + icon('alert', 20) + '<span>' + esc(o.error) + '</span></div>' : '') +
      '<form data-submit="login" class="stack">' +
      Field({ id: 'login-user', label: 'Username', input: '<input id="login-user" name="username" autocomplete="username" required value="' + esc(o.username || '') + '">' }) +
      Field({ id: 'login-pass', label: 'Password', input: '<input id="login-pass" name="password" type="password" autocomplete="current-password" required>' }) +
      Button({ label: 'Sign in', type: 'submit', block: true, size: 'lg' }) + '</form>' +
      '<div class="demo-creds"><span class="section-label">Demo accounts (password demo123)</span><div class="cred-list">' +
      o.creds.map((c) => '<button class="cred" data-action="fill-cred" data-arg="' + esc(c.username) + '">' + esc(c.username) + '<small>' + esc(c.label) + '</small></button>').join('') +
      '</div></div>' +
      '<a href="#/" class="link back-link">' + icon('arrowLeft', 16) + ' All roles</a></div></div>';
  }

  /* ---------- small formatters ---------- */
  const typeIcon = (t) => ({ accident: 'car', medical: 'heartPulse', maternity: 'baby', breathing: 'activity', fall: 'user', other: 'more' }[t] || 'more');
  function mmss(ms) { const s = Math.max(0, Math.round(ms / 1000)); const m = Math.floor(s / 60); const h = Math.floor(m / 60); return h ? h + ':' + String(m % 60).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0') : m + ':' + String(s % 60).padStart(2, '0'); }
  const durMin = (ms) => (ms == null || isNaN(ms) ? '—' : (ms / 60000).toFixed(1) + ' min');

  return { esc, icon, Button, IconButton, Badge, StatusChip, AmbStatus, ambColor, Card, SectionLabel, Header, Logo, BottomNav, Timeline, Stepper, EmptyState, Countdown, Elapsed, Ring, Field, KV, Segmented, toast, modal, askReason, Shell, LoginCard, typeIcon, mmss, durMin, PRIORITY, initials };
})();
