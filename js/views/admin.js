/* ADMIN web app – screens 26–28 (manage data, reports, audit log).
 * reportsBody() is shared with the dispatcher's Reports page. */
EAMS.Views.admin = (function () {
  const { UI, Store } = EAMS;
  const esc = UI.esc;
  const ui = () => EAMS.App.ui;
  const ROLE = 'admin';
  const WEEK = 7 * 24 * 60 * 60 * 1000;

  function shell(active, title, body, subtitle) {
    const u = Store.user(Store.state.sessions.admin);
    return UI.Shell({
      roleLabel: 'System admin', active, title, subtitle, body,
      nav: [
        { key: 'data', label: 'Manage data', icon: 'database', route: '#/admin/data' },
        { key: 'reports', label: 'Reports', icon: 'chart', route: '#/admin/reports' },
        { key: 'audit', label: 'Audit log', icon: 'shield', route: '#/admin/audit' },
      ],
      userName: u.name, userRole: 'System administrator', notifications: [],
    });
  }

  /* 26 – Manage data */
  function data() {
    const tab = (ui().drafts.adm || {}).tab || 'users';
    const tabs = [['users', 'Users', Store.state.users.length], ['ambulances', 'Ambulances', Store.state.ambulances.length], ['hospitals', 'Hospitals', Store.state.hospitals.length]];
    const head = '<div class="row-between"><div class="tabs" role="tablist">' + tabs.map((t) => '<button role="tab" aria-selected="' + (tab === t[0]) + '" class="tab' + (tab === t[0] ? ' on' : '') + '" data-action="tab" data-arg="' + t[0] + '">' + t[1] + ' <span class="tab-count">' + t[2] + '</span></button>').join('') + '</div>' +
      UI.Button({ label: 'Add ' + { users: 'user', ambulances: 'ambulance', hospitals: 'hospital' }[tab], icon: 'plus', action: 'add', arg: tab }) + '</div>';
    let table = '';
    if (tab === 'users') {
      table = '<table class="table"><thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Assignment</th><th>Phone</th><th>Status</th><th>Actions</th></tr></thead><tbody>' +
        Store.state.users.map((u) => '<tr class="' + (u.disabled ? 'row-muted' : '') + '"><td><span class="avatar sm">' + UI.initials(u.name) + '</span> ' + esc(u.name) + '</td><td class="mono">' + esc(u.username) + '</td><td><span class="chip chip-blue">' + u.role + '</span></td><td>' + esc(u.hospitalId ? Store.hosp(u.hospitalId).name : u.ambulanceId || '—') + '</td><td>' + esc(u.phone || '') + '</td><td>' +
          (u.disabled ? '<span class="chip chip-gray">Disabled</span>' : u.locked ? '<span class="chip chip-red">' + UI.icon('lock', 12) + ' Locked</span>' : '<span class="chip chip-green">Active</span>') + '</td><td><div class="btn-row">' +
          UI.Button({ label: 'Edit', size: 'sm', variant: 'secondary', icon: 'pencil', action: 'edit-user', arg: u.id }) +
          (u.locked ? UI.Button({ label: 'Unlock', size: 'sm', variant: 'secondary', icon: 'lock', action: 'unlock', arg: u.id }) : '') +
          UI.Button({ label: u.disabled ? 'Enable' : 'Disable', size: 'sm', variant: u.disabled ? 'secondary' : 'danger-outline', action: 'toggle-user', arg: u.id }) + '</div></td></tr>').join('') + '</tbody></table>';
    } else if (tab === 'ambulances') {
      table = '<table class="table"><thead><tr><th>Unit</th><th>Type</th><th>Plate</th><th>Base</th><th>Crew</th><th>Status</th><th>Actions</th></tr></thead><tbody>' +
        Store.state.ambulances.map((a) => '<tr class="' + (a.disabled ? 'row-muted' : '') + '"><td><strong>' + a.id + '</strong></td><td>' + a.type + '</td><td>' + esc(a.plate || '') + '</td><td>' + esc(a.base) + '</td><td>' + esc(a.crew) + '</td><td>' + UI.AmbStatus(a) + '</td><td><div class="btn-row">' +
          UI.Button({ label: 'Edit', size: 'sm', variant: 'secondary', icon: 'pencil', action: 'edit-amb', arg: a.id }) +
          UI.Button({ label: a.disabled ? 'Enable' : 'Disable', size: 'sm', variant: a.disabled ? 'secondary' : 'danger-outline', action: 'toggle-amb', arg: a.id }) + '</div></td></tr>').join('') + '</tbody></table>';
    } else {
      table = '<table class="table"><thead><tr><th>Hospital</th><th>District</th><th>ER beds</th><th>ICU</th><th>Theatre</th><th>Phone</th><th>Status</th><th>Actions</th></tr></thead><tbody>' +
        Store.state.hospitals.map((h) => '<tr class="' + (h.disabled ? 'row-muted' : '') + '"><td><strong>' + esc(h.name) + '</strong></td><td>' + esc(h.district) + '</td><td>' + h.beds.emergency + '</td><td>' + h.beds.icu + '</td><td>' + h.beds.theatre + '</td><td>' + esc(h.phone || '') + '</td><td>' + (h.disabled ? '<span class="chip chip-gray">Disabled</span>' : '<span class="chip chip-green">Active</span>') + '</td><td><div class="btn-row">' +
          UI.Button({ label: 'Edit', size: 'sm', variant: 'secondary', icon: 'pencil', action: 'edit-hosp', arg: h.id }) +
          UI.Button({ label: h.disabled ? 'Enable' : 'Disable', size: 'sm', variant: h.disabled ? 'secondary' : 'danger-outline', action: 'toggle-hosp', arg: h.id }) + '</div></td></tr>').join('') + '</tbody></table>';
    }
    const body = head + '<div class="card"><div class="table-wrap">' + table + '</div></div>' +
      '<p class="hint">' + UI.icon('info', 14) + ' Changes apply immediately for all roles. Adding a hospital or ambulance never interrupts the running service.</p>';
    return shell('data', 'Manage data', body);
  }

  /* 27 – Reports (shared) */
  function stats() {
    const now = Date.now();
    const reqs = Store.state.requests.filter((r) => r.status !== 'false');
    const weeks = [];
    for (let w = 7; w >= 0; w--) {
      const inWeek = reqs.filter((r) => { const k = Math.floor((now - r.createdAt) / WEEK); return k === w && r.times.atPatient; });
      const avg = inWeek.length ? inWeek.reduce((s, r) => s + (r.times.atPatient - r.times.received), 0) / inWeek.length / 60000 : 0;
      weeks.push({ label: w === 0 ? 'This wk' : 'W-' + w, value: +avg.toFixed(1), n: inWeek.length });
    }
    const districts = {};
    reqs.forEach((r) => { const d = r.location.district || 'Other'; districts[d] = (districts[d] || 0) + 1; });
    const units = Store.state.ambulances.map((a) => ({ label: a.id, value: Store.state.requests.filter((r) => r.ambulanceId === a.id && r.times.accepted).length, a }));
    return { weeks, districts: Object.entries(districts).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value })), units, reqs };
  }
  function vbars(data, unit) {
    const max = Math.max(1, ...data.map((d) => d.value));
    return '<div class="vbars" role="img" aria-label="Bar chart">' + data.map((d) => '<div class="vbar"><span class="vbar-val">' + (d.value ? d.value + unit : '–') + '</span><span class="vbar-col"><i style="height:' + (d.value / max * 100) + '%"></i></span><span class="vbar-lbl">' + d.label + '</span></div>').join('') + '</div>';
  }
  function hbars(data, fmt) {
    const max = Math.max(1, ...data.map((d) => d.value));
    return '<div class="hbars">' + data.map((d) => '<div class="hbar"><span class="hbar-lbl">' + esc(d.label) + '</span><span class="hbar-track"><i style="width:' + (d.value / max * 100) + '%"></i></span><span class="hbar-val">' + (fmt ? fmt(d) : d.value) + '</span></div>').join('') + '</div>';
  }
  function reportsBody() {
    const s = stats();
    const resp = s.reqs.filter((r) => r.times.atPatient);
    const avg = resp.reduce((x, r) => x + (r.times.atPatient - r.times.received), 0) / Math.max(1, resp.length) / 60000;
    const inService = Store.state.ambulances.filter((a) => !a.disabled && a.status !== 'out');
    const busy = inService.filter((a) => a.status !== 'available').length;
    return '<div class="row-between report-head"><p class="muted">Last 8 weeks + today · ' + s.reqs.length + ' emergencies</p>' + UI.Button({ label: 'Export CSV', icon: 'download', variant: 'secondary', action: 'export-csv' }) + '</div>' +
      '<div class="kpis">' +
      '<div class="kpi kpi-blue"><span class="kpi-ic">' + UI.icon('clock', 22) + '</span><div><small>Avg. response time</small><strong>' + avg.toFixed(1) + ' min</strong><span>request → at patient</span></div></div>' +
      '<div class="kpi kpi-red"><span class="kpi-ic">' + UI.icon('siren', 22) + '</span><div><small>Emergencies</small><strong>' + s.reqs.length + '</strong><span>' + s.reqs.filter((r) => r.priority === 'critical').length + ' critical</span></div></div>' +
      '<div class="kpi kpi-green"><span class="kpi-ic">' + UI.icon('ambulance', 22) + '</span><div><small>Fleet in use now</small><strong>' + Math.round(busy / Math.max(1, inService.length) * 100) + '%</strong><span>' + busy + ' of ' + inService.length + ' units</span></div></div>' +
      '<div class="kpi kpi-orange"><span class="kpi-ic">' + UI.icon('pin', 22) + '</span><div><small>Busiest district</small><strong>' + esc((s.districts[0] || {}).label || '—') + '</strong><span>' + ((s.districts[0] || {}).value || 0) + ' emergencies</span></div></div></div>' +
      '<div class="report-grid">' +
      '<section class="card pad span-2"><h2 class="card-title">Average response time per week</h2><p class="muted">Minutes from request to ambulance at the patient (target ≤ 12 min)</p>' + vbars(s.weeks, '′') + '</section>' +
      '<section class="card pad"><h2 class="card-title">Emergencies per district</h2>' + hbars(s.districts) + '</section>' +
      '<section class="card pad"><h2 class="card-title">Ambulance use</h2><p class="muted">Trips per unit</p>' + hbars(s.units, (d) => d.value + ' · ' + (d.a.disabled || d.a.status === 'out' ? 'out' : d.a.status)) + '</section></div>';
  }
  function exportCsv() {
    const rows = [['id', 'created', 'type', 'priority', 'district', 'location', 'channel', 'ambulance', 'hospital', 'status', 'response_min']];
    Store.state.requests.forEach((r) => rows.push([r.id, new Date(r.createdAt + Store.state.clockOffset).toISOString(), Store.TYPES[r.type], r.priority, r.location.district || '', r.location.name, r.channel, r.ambulanceId || '', (Store.hosp(r.hospitalId) || {}).name || '', r.status, r.times.atPatient ? ((r.times.atPatient - r.times.received) / 60000).toFixed(1) : '']));
    const csv = rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'eams-report.csv'; document.body.appendChild(a); a.click(); a.remove();
    UI.toast('eams-report.csv exported (' + (rows.length - 1) + ' rows)', 'success');
  }

  /* 28 – Audit log */
  function audit() {
    const q = ((ui().drafts.audit || {}).q || '').toLowerCase();
    const list = Store.state.audit.filter((a) => !q || (a.user + ' ' + a.action + ' ' + a.record + ' ' + a.role).toLowerCase().includes(q));
    const body = '<div class="row-between"><div class="search">' + UI.icon('search', 18) + '<label class="sr-only" for="audit-q">Search audit log</label><input id="audit-q" type="search" placeholder="Search user, action or record…" data-model="audit.q" data-rerender value="' + esc(q) + '"></div><span class="muted">' + list.length + ' entries · read-only</span></div>' +
      '<div class="card"><div class="table-wrap"><table class="table"><thead><tr><th>Time</th><th>User</th><th>Role</th><th>Action</th><th>Record</th></tr></thead><tbody>' +
      list.slice(0, 300).map((a) => '<tr><td class="nowrap">' + Store.fmtDate(a.at) + ' ' + Store.fmtTime(a.at) + '</td><td>' + esc(a.user) + '</td><td><span class="chip chip-gray">' + a.role + '</span></td><td>' + (a.action === 'Viewed record' ? UI.icon('eye', 14) + ' ' : '') + esc(a.action) + '</td><td class="mono">' + esc(a.record) + '</td></tr>').join('') +
      '</tbody></table></div></div>';
    return shell('audit', 'Audit log', body, 'Who viewed or changed each record, and when');
  }

  function render(screen) {
    if (screen === 'login') {
      if (Store.state.sessions.admin) return EAMS.App.redirect('#/admin/data');
      const l = ui().login.admin || {};
      return UI.LoginCard({ roleLabel: 'Admin', error: l.error, locked: l.locked, username: l.username, creds: [{ username: 'admin', label: 'Eric Ndayisaba' }] });
    }
    if (!Store.state.sessions.admin) return EAMS.App.redirect('#/admin/login');
    if (screen === 'data') return data();
    if (screen === 'reports') return shell('reports', 'Reports', reportsBody(), 'Response times, demand and fleet use');
    if (screen === 'audit') return audit();
    return EAMS.App.redirect('#/admin/data');
  }

  /* ---------- forms ---------- */
  const val = (root, id) => root.querySelector('#' + id).value.trim();
  const opt = (v, label, cur) => '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(label) + '</option>';
  function fail(root, msg) { const e = root.querySelector('.form-error'); e.textContent = msg; e.hidden = false; return false; }
  function result(res, msg) { UI.toast(res.ok ? msg : res.error, res.ok ? 'success' : 'error'); return res.ok; }

  function userForm(u) {
    u = u || { name: '', username: '', role: 'dispatcher', phone: '' };
    UI.modal({
      title: u.id ? 'Edit user' : 'Add user',
      body: '<div class="grid-2">' + UI.Field({ id: 'f-name', label: 'Full name', required: true, input: '<input id="f-name" value="' + esc(u.name) + '">' }) +
        UI.Field({ id: 'f-user', label: 'Username', required: true, input: '<input id="f-user" value="' + esc(u.username) + '">' }) +
        UI.Field({ id: 'f-role', label: 'Role', input: '<select id="f-role">' + [['dispatcher', 'Dispatcher'], ['crew', 'Ambulance crew'], ['hospital', 'Hospital staff'], ['admin', 'Admin']].map((r) => opt(r[0], r[1], u.role)).join('') + '</select>' }) +
        UI.Field({ id: 'f-assign', label: 'Assignment (crew / hospital)', input: '<select id="f-assign"><option value="">—</option>' + Store.state.ambulances.map((a) => opt('amb:' + a.id, 'Ambulance ' + a.id, u.ambulanceId ? 'amb:' + u.ambulanceId : '')).join('') + Store.state.hospitals.map((h) => opt('hosp:' + h.id, h.name, u.hospitalId ? 'hosp:' + u.hospitalId : '')).join('') + '</select>' }) +
        UI.Field({ id: 'f-phone', label: 'Phone', input: '<input id="f-phone" type="tel" value="' + esc(u.phone || '') + '">' }) + '</div>' +
        (u.id ? '' : '<p class="hint">New users get the temporary password <code>demo123</code>.</p>') + '<p class="error form-error" hidden role="alert"></p>',
      actions: [{ label: 'Cancel', variant: 'secondary', value: null }, { label: u.id ? 'Save changes' : 'Add user', value: 'ok' }],
      onAction(v, root) {
        const d = { id: u.id, name: val(root, 'f-name'), username: val(root, 'f-user'), role: val(root, 'f-role'), phone: val(root, 'f-phone') };
        if (!d.name || !d.username) return fail(root, 'Name and username are required');
        const as = val(root, 'f-assign');
        d.ambulanceId = as.startsWith('amb:') ? as.slice(4) : undefined; d.hospitalId = as.startsWith('hosp:') ? as.slice(5) : undefined;
        if (d.role === 'hospital' && !d.hospitalId) return fail(root, 'Hospital staff must be assigned to a hospital');
        const res = Store.upsertUser(d); if (!res.ok) return fail(root, res.error);
        UI.toast(u.id ? 'User updated' : 'User added', 'success'); return true;
      },
    });
  }
  function ambForm(a) {
    const isNew = !a; a = a || { id: 'A-' + String(21 + Store.state.ambulances.length).padStart(2, '0'), type: 'BLS', plate: '', base: Store.PLACES[5].name };
    UI.modal({
      title: isNew ? 'Add ambulance' : 'Edit ' + a.id,
      body: '<div class="grid-2">' + UI.Field({ id: 'f-id', label: 'Unit number', required: true, input: '<input id="f-id" value="' + esc(a.id) + '"' + (isNew ? '' : ' readonly') + '>' }) +
        UI.Field({ id: 'f-type', label: 'Type', input: '<select id="f-type">' + opt('ALS', 'ALS – advanced life support', a.type) + opt('BLS', 'BLS – basic life support', a.type) + '</select>' }) +
        UI.Field({ id: 'f-plate', label: 'Plate', input: '<input id="f-plate" value="' + esc(a.plate || '') + '" placeholder="RAC 000 E">' }) +
        UI.Field({ id: 'f-base', label: 'Base station', input: '<select id="f-base">' + Store.PLACES.map((p) => opt(p.name, p.name, a.base)).join('') + (Store.PLACES.some((p) => p.name === a.base) ? '' : opt(a.base, a.base, a.base)) + '</select>' }) + '</div>' +
        '<p class="hint">A new unit starts as Available and can be assigned immediately.</p><p class="error form-error" hidden role="alert"></p>',
      actions: [{ label: 'Cancel', variant: 'secondary', value: null }, { label: isNew ? 'Add ambulance' : 'Save changes', value: 'ok' }],
      onAction(v, root) {
        const d = { id: val(root, 'f-id').toUpperCase(), type: val(root, 'f-type'), plate: val(root, 'f-plate'), base: val(root, 'f-base'), isNew };
        if (!/^A-\d+$/.test(d.id)) return fail(root, 'Unit number must look like A-21');
        const res = Store.upsertAmbulance(d); if (!res.ok) return fail(root, res.error);
        UI.toast(isNew ? d.id + ' added – service not interrupted' : d.id + ' updated', 'success'); return true;
      },
    });
  }
  function hospForm(h) {
    h = h || { name: '', short: '', district: 'Gasabo', phone: '', beds: { emergency: 2, icu: 0, theatre: 1 } };
    UI.modal({
      title: h.id ? 'Edit hospital' : 'Add hospital',
      body: '<div class="grid-2">' + UI.Field({ id: 'f-hname', label: 'Name', required: true, input: '<input id="f-hname" value="' + esc(h.name) + '">' }) +
        UI.Field({ id: 'f-short', label: 'Short name', input: '<input id="f-short" value="' + esc(h.short || '') + '">' }) +
        UI.Field({ id: 'f-district', label: 'District', input: '<select id="f-district">' + ['Gasabo', 'Kicukiro', 'Nyarugenge'].map((d) => opt(d, d, h.district)).join('') + '</select>' }) +
        UI.Field({ id: 'f-hphone', label: 'Phone', input: '<input id="f-hphone" value="' + esc(h.phone || '') + '">' }) +
        UI.Field({ id: 'f-er', label: 'Emergency beds', input: '<input id="f-er" type="number" min="0" value="' + h.beds.emergency + '">' }) +
        UI.Field({ id: 'f-icu', label: 'ICU beds', input: '<input id="f-icu" type="number" min="0" value="' + h.beds.icu + '">' }) +
        UI.Field({ id: 'f-th', label: 'Operating theatres', input: '<input id="f-th" type="number" min="0" value="' + h.beds.theatre + '">' }) + '</div><p class="error form-error" hidden role="alert"></p>',
      actions: [{ label: 'Cancel', variant: 'secondary', value: null }, { label: h.id ? 'Save changes' : 'Add hospital', value: 'ok' }],
      onAction(v, root) {
        const d = { id: h.id, name: val(root, 'f-hname'), short: val(root, 'f-short'), district: val(root, 'f-district'), phone: val(root, 'f-hphone'), beds: { emergency: +val(root, 'f-er') || 0, icu: +val(root, 'f-icu') || 0, theatre: +val(root, 'f-th') || 0 } };
        if (!d.name) return fail(root, 'Name is required');
        const res = Store.upsertHospital(d); if (!res.ok) return fail(root, res.error);
        UI.toast(h.id ? 'Hospital updated' : d.name + ' added – service not interrupted', 'success'); return true;
      },
    });
  }

  const actions = {
    tab(el) { ui().drafts.adm = { tab: el.dataset.arg }; EAMS.App.render(); },
    add(el) { ({ users: () => userForm(), ambulances: () => ambForm(), hospitals: () => hospForm() })[el.dataset.arg](); },
    'edit-user'(el) { userForm(Store.user(el.dataset.arg)); },
    'edit-amb'(el) { ambForm(Store.amb(el.dataset.arg)); },
    'edit-hosp'(el) { hospForm(Store.hosp(el.dataset.arg)); },
    'toggle-user'(el) { const u = Store.user(el.dataset.arg); result(Store.toggleUser(u.id), (u.disabled ? 'Disabled ' : 'Enabled ') + u.username); },
    unlock(el) { result(Store.unlockUser(el.dataset.arg), 'Account unlocked'); },
    'toggle-amb'(el) { const id = el.dataset.arg; const res = Store.toggleAmbulance(id); result(res, id + (Store.amb(id).disabled ? ' set out of service' : ' back in service')); },
    'toggle-hosp'(el) { const h = Store.hosp(el.dataset.arg); result(Store.toggleHospital(h.id), h.name + (h.disabled ? ' disabled' : ' enabled')); },
    'export-csv'() { exportCsv(); },
  };
  return { layout: 'desktop', render, actions, reportsBody, exportCsv };
})();
