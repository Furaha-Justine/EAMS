/* DISPATCHER web app – screens 8–15 */
EAMS.Views.dispatcher = (function () {
  const { UI, Store, MapView } = EAMS;
  const esc = UI.esc;
  const ui = () => EAMS.App.ui;
  const ROLE = 'dispatcher';

  /** Where a request should open, depending on its state. */
  function routeFor(r) {
    if (!r) return '#/dispatcher/dashboard';
    if (r.status === 'received') return '#/dispatcher/verify/' + r.id;
    if (['verified', 'offered'].includes(r.status)) return '#/dispatcher/allocate/' + r.id;
    if (r.status === 'waiting') return '#/dispatcher/waiting';
    return '#/dispatcher/case/' + r.id;
  }

  function shell(active, title, body, subtitle) {
    const u = Store.user(Store.state.sessions.dispatcher);
    const active_ = Store.activeRequests();
    const fresh = active_.filter((r) => r.status === 'received').length;
    const waiting = Store.waitingList().length;
    return UI.Shell({
      roleLabel: 'Dispatcher', active, title, subtitle, body,
      nav: [
        { key: 'dashboard', label: 'Dashboard', icon: 'dashboard', route: '#/dispatcher/dashboard' },
        { key: 'requests', label: 'Requests', icon: 'list', route: '#/dispatcher/requests', count: fresh || '', hot: fresh > 0 },
        { key: 'ambulances', label: 'Ambulances', icon: 'ambulance', route: '#/dispatcher/ambulances' },
        { key: 'hospitals', label: 'Hospitals', icon: 'hospital', route: '#/dispatcher/hospitals' },
        { key: 'waiting', label: 'Waiting list', icon: 'hourglass', route: '#/dispatcher/waiting', count: waiting || '', hot: waiting > 0 },
        { key: 'reports', label: 'Reports', icon: 'chart', route: '#/dispatcher/reports' },
      ],
      userName: u ? u.name : '', userRole: 'Dispatcher · Kigali',
      notifications: Store.notificationsFor(ROLE),
      notifRoute: (n) => routeFor(Store.get(n.requestId)),
      topActions: UI.Button({ label: 'Register phone request', icon: 'phone', action: 'nav', arg: '#/dispatcher/new', attrs: 'id="btn-new-call"' }),
    });
  }
  const back = (route, label) => '<a class="crumb" href="' + route + '">' + UI.icon('arrowLeft', 16) + ' ' + esc(label) + '</a>';
  function reqHead(r) {
    return '<div class="req-head"><span class="type-ic">' + UI.icon(UI.typeIcon(r.type), 24) + '</span><div><h2>' + esc(r.id) + ' · ' + esc(Store.TYPES[r.type]) + '</h2>' +
      '<p class="muted">' + esc(r.location.name) + ' · received ' + Store.fmtTime12(r.createdAt) + ' · waiting ' + UI.Elapsed(r.createdAt) + '</p></div>' +
      '<div class="req-head-badges">' + UI.Badge(r.priority, { lg: true }) + UI.StatusChip(r.status) + '</div></div>';
  }

  /* 9 – Dashboard */
  function dashboard() {
    const reqs = Store.activeRequests();
    const all = Store.state.ambulances;
    const inService = all.filter((a) => !a.disabled && a.status !== 'out');
    const free = Store.availableAmbulances();
    const resp = Store.state.requests.filter((r) => r.times.atPatient && r.times.received);
    const avg = resp.length ? resp.reduce((s, r) => s + (r.times.atPatient - r.times.received), 0) / resp.length / 60000 : 0;
    const waiting = Store.waitingList();
    const kpi = (ic, label, val, sub, tone) => '<div class="kpi kpi-' + tone + '"><span class="kpi-ic">' + UI.icon(ic, 22) + '</span><div><small>' + label + '</small><strong>' + val + '</strong><span>' + sub + '</span></div></div>';
    const body = '<div class="kpis">' +
      kpi('siren', 'Active emergencies', reqs.length, reqs.filter((r) => r.priority === 'critical').length + ' critical', 'red') +
      kpi('ambulance', 'Free ambulances', free.length + ' / ' + inService.length, 'in service', 'green') +
      kpi('clock', 'Average response time', avg.toFixed(1) + ' min', 'request → at patient', 'blue') +
      kpi('hourglass', 'Waiting requests', waiting.length, waiting.length ? 'no unit free' : 'none waiting', 'orange') + '</div>' +
      '<div class="dash-grid">' +
      '<section class="card queue-card"><div class="card-head"><h2>Request queue</h2><span class="muted">Critical first · ' + reqs.length + ' active</span></div>' +
      '<div class="queue" data-keep-scroll="d-queue">' + (reqs.length ? reqs.map(queueItem).join('') : UI.EmptyState({ icon: 'checkCircle', title: 'No active emergencies', text: 'New requests from the app, SMS and 912 calls appear here.' })) + '</div></section>' +
      '<section class="card map-card"><div class="card-head"><h2>Live map – Kigali</h2>' + MapView.Legend() + '</div><div class="map-box" id="dash-map">' +
      MapView.render({ ambulances: all, hospitals: Store.state.hospitals.filter((h) => !h.disabled), emergencies: reqs.filter((r) => !['toHospital', 'atHospital', 'handedOver'].includes(r.status)).map((r) => ({ x: r.location.x, y: r.location.y, priority: r.priority, id: r.id })), label: 'Live map of ambulances, emergencies and hospitals in Kigali' }) +
      '</div></section></div>';
    return shell('dashboard', 'Dashboard', body, 'Live overview · <span data-clock></span>');
  }
  function queueItem(r) {
    const unassigned = ['received', 'verified', 'waiting'].includes(r.status);
    return '<div class="q-item q-' + r.priority + '" role="button" tabindex="0" data-action="nav" data-arg="' + routeFor(r) + '" id="q-' + r.id + '">' +
      '<div class="q-main"><div class="q-top">' + UI.Badge(r.priority) + '<strong>' + r.id + '</strong>' + UI.StatusChip(r.status) + '</div>' +
      '<div class="q-sub">' + UI.icon(UI.typeIcon(r.type), 16) + ' ' + esc(Store.TYPES[r.type]) + ' · ' + UI.icon('pin', 14) + ' ' + esc(r.location.name) + ' · ' + r.patients + ' pt</div></div>' +
      '<div class="q-timer' + (unassigned ? ' live' : '') + '"><small>' + (unassigned ? 'Waiting' : (r.ambulanceId || '')) + '</small>' + (unassigned ? UI.Elapsed(r.createdAt) : '<span>' + Store.fmtTime(r.createdAt) + '</span>') + '</div></div>';
  }

  /* Requests list */
  function requests() {
    const f = (ui().drafts.dreq || {}).filter || 'active';
    const today = Store.state.requests.filter((r) => !r.archived);
    const sets = {
      active: Store.activeRequests(),
      new: today.filter((r) => r.status === 'received').sort((a, b) => Store.RANK[a.priority] - Store.RANK[b.priority]),
      progress: today.filter((r) => ['offered', 'enroute', 'atPatient', 'toHospital', 'atHospital', 'handedOver'].includes(r.status)),
      waiting: Store.waitingList(),
      closed: today.filter((r) => ['closed', 'false'].includes(r.status)).reverse(),
    };
    const tabs = [['active', 'All active'], ['new', 'New – to verify'], ['progress', 'In progress'], ['waiting', 'Waiting'], ['closed', 'Closed today']];
    const list = sets[f];
    const body = '<div class="tabs" role="tablist">' + tabs.map((t) => '<button role="tab" aria-selected="' + (f === t[0]) + '" class="tab' + (f === t[0] ? ' on' : '') + '" data-action="req-filter" data-arg="' + t[0] + '">' + t[1] + ' <span class="tab-count">' + sets[t[0]].length + '</span></button>').join('') + '</div>' +
      '<div class="card">' + (list.length ? '<div class="table-wrap"><table class="table"><thead><tr><th>Request</th><th>Priority</th><th>Type</th><th>Location</th><th>Received</th><th>Channel</th><th>Ambulance</th><th>Status</th><th></th></tr></thead><tbody>' +
        list.map((r) => '<tr class="row-link" data-action="nav" data-arg="' + routeFor(r) + '" role="button" tabindex="0"><td><strong>' + r.id + '</strong></td><td>' + UI.Badge(r.priority) + '</td><td>' + esc(Store.TYPES[r.type]) + '</td><td>' + esc(r.location.name) + '</td><td>' + Store.fmtTime(r.createdAt) + '</td><td>' + esc(Store.channelLabel(r.channel)) + '</td><td>' + (r.ambulanceId || '—') + '</td><td>' + UI.StatusChip(r.status) + '</td><td>' + UI.icon('chevronRight', 18) + '</td></tr>').join('') +
        '</tbody></table></div>' : UI.EmptyState({ icon: 'list', title: 'Nothing here', text: 'No requests in this view.' })) + '</div>';
    return shell('requests', 'Requests', body);
  }

  /* 10 – Register phone request */
  function newCall() {
    const d = ui().drafts.phone = ui().drafts.phone || { phone: '', type: '', condition: '', patients: 1, loc: '', point: null, errors: {} };
    const types = ['accident', 'medical', 'maternity', 'breathing', 'fall', 'other'];
    const body = back('#/dispatcher/dashboard', 'Dashboard') +
      '<div class="two-col"><form class="card pad stack" data-submit="create-call" novalidate>' +
      '<div class="card-head flat"><h2>Call to 912</h2><span class="chip chip-blue">' + UI.icon('phone', 14) + ' Phone channel</span></div>' +
      UI.Field({ id: 'pc-phone', label: 'Caller phone', required: true, error: d.errors.phone ? 'Caller phone is required' : '', input: '<input id="pc-phone" type="tel" data-model="phone.phone" value="' + esc(d.phone) + '" placeholder="078x xxx xxx">' }) +
      '<fieldset class="field"><legend>Emergency type <span class="req">*</span></legend><div class="chip-radios">' + types.map((t) =>
        '<label class="chip-radio"><input type="radio" name="type" value="' + t + '" data-model="phone.type"' + (d.type === t ? ' checked' : '') + '><span>' + UI.icon(UI.typeIcon(t), 16) + esc(Store.TYPES[t]) + '</span></label>').join('') + '</div>' +
      (d.errors.type ? '<p class="error" role="alert">Choose the type of emergency</p>' : '') + '</fieldset>' +
      UI.Field({ id: 'pc-cond', label: 'Patient condition', input: '<textarea id="pc-cond" rows="3" data-model="phone.condition" placeholder="What happened? Is the patient conscious and breathing?">' + esc(d.condition) + '</textarea>' }) +
      '<div class="row-between"><span class="label-like">Number of patients</span>' + UI.Stepper({ label: 'Number of patients', value: d.patients, min: 1, max: 30, action: 'pc-patients' }) + '</div>' +
      UI.Field({ id: 'pc-loc', label: 'Location', required: true, hint: 'Type an address / landmark, or click on the map.', error: d.errors.loc ? 'Location is required' : '', input: '<input id="pc-loc" list="d-places" data-model="phone.loc" value="' + esc(d.loc) + '" placeholder="e.g. Remera, near Amahoro stadium">' }) +
      '<datalist id="d-places">' + Store.PLACES.map((p) => '<option value="' + esc(p.name) + '">').join('') + '</datalist>' +
      UI.Button({ label: 'Create request', icon: 'plus', type: 'submit', size: 'lg' }) + '</form>' +
      '<section class="card map-card"><div class="card-head"><h2>Pick on the map</h2><span class="muted">' + (d.point ? 'Picked: ' + esc(d.loc) : 'Click to set the pickup point') + '</span></div><div class="map-box tall">' +
      MapView.render({ pickAction: 'map-pick', pickup: d.point, hospitals: Store.state.hospitals, ambulances: Store.state.ambulances.filter((a) => !a.disabled), label: 'Click to choose the location' }) + '</div></section></div>';
    return shell('requests', 'Register phone request', body, 'Create a request for a call to 912 (toll-free)');
  }

  /* 11 – Verify request */
  function verify(id) {
    const r = Store.get(id); if (!r) return notFound();
    const d = ui().drafts['v' + id] = ui().drafts['v' + id] || { priority: r.priority };
    const near = Store.candidates(r).slice(0, 3);
    const done = r.status !== 'received';
    const body = back('#/dispatcher/dashboard', 'Dashboard') + reqHead(r) +
      '<div class="two-col">' +
      '<section class="card pad"><div class="card-head flat"><h2>Request details</h2><span class="muted">via ' + esc(Store.channelLabel(r.channel)) + '</span></div>' +
      UI.KV([
        ['Emergency type', esc(Store.TYPES[r.type])],
        ['Patient condition', esc(r.condition || '—')],
        ['Patients', String(r.patients)],
        ['Caller phone', esc(r.callerPhone || '—') + (r.callerName ? ' · ' + esc(r.callerName) : '')],
        ['Location', '<span class="loc-inline">' + UI.icon('pin', 16, 'red') + esc(r.location.name) + ' <small class="muted">(' + (r.location.source === 'gps' ? 'GPS' : 'typed') + ')</small></span> ' + (done ? '' : UI.Button({ label: 'Edit location', icon: 'pencil', variant: 'secondary', size: 'sm', action: 'edit-loc', arg: id }))],
      ]) +
      (done ? '<div class="alert alert-green">' + UI.icon('checkCircle', 20) + '<div><strong>' + (r.status === 'false' ? 'Marked as false call' : 'Verified') + '</strong><p>' + (r.status === 'false' ? esc(r.falseReason) : 'This request was verified at ' + Store.fmtTime(r.times.verified) + '.') + '</p></div></div>' +
        '<div class="btn-row">' + (r.status === 'false' ? '' : UI.Button({ label: 'Go to allocation', icon: 'ambulance', action: 'nav', arg: routeFor(r) })) + UI.Button({ label: 'Case log', variant: 'secondary', icon: 'file', action: 'nav', arg: '#/dispatcher/case/' + id }) + '</div>'
        : UI.Field({ id: 'v-priority', label: 'Priority', input: '<select id="v-priority" data-model="v' + id + '.priority"><option value="critical"' + (d.priority === 'critical' ? ' selected' : '') + '>Critical</option><option value="urgent"' + (d.priority === 'urgent' ? ' selected' : '') + '>Urgent</option><option value="normal"' + (d.priority === 'normal' ? ' selected' : '') + '>Normal</option></select>', hint: 'Suggested by automatic triage: ' + UI.PRIORITY[r.priority] }) +
        '<div class="btn-row">' + UI.Button({ label: 'Verify', icon: 'check', action: 'verify', arg: id, size: 'lg', attrs: 'id="btn-verify"' }) +
        UI.Button({ label: 'Mark as false call', icon: 'flag', variant: 'danger-outline', action: 'false-call', arg: id, size: 'lg' }) + '</div>' +
        '<p class="hint">' + UI.icon('lock', 14) + ' An ambulance can only be allocated after verification.</p>') +
      '</section>' +
      '<section class="card map-card"><div class="card-head"><h2>Location</h2><span class="muted">' + near.length + ' free units nearby</span></div><div class="map-box">' +
      MapView.render({ focus: [r.location].concat(near.map((c) => Store.ambPos(c.amb))), pad: 8, pickup: r.location, ambulances: near.map((c) => c.amb), hospitals: Store.state.hospitals, label: 'Request location' }) + '</div>' +
      '<ul class="mini-list">' + near.map((c) => '<li>' + UI.icon('ambulance', 16, 'green') + '<strong>' + c.amb.id + '</strong> ' + c.amb.type + '<span class="muted">' + c.km + ' km · ' + c.eta + ' min</span></li>').join('') + '</ul></section></div>';
    return shell('requests', 'Verify request', body);
  }

  /* 12 – Allocate ambulance */
  function allocate(id) {
    const r = Store.get(id); if (!r) return notFound();
    const list = Store.candidates(r);
    const sug = Store.suggestedOf(list, r);
    const h = Store.hosp(r.hospitalId);
    let main;
    if (r.status === 'received') {
      main = '<section class="card pad"><div class="alert alert-orange">' + UI.icon('lock', 20) + '<div><strong>Verify the request first</strong><p>Business rule: a request cannot be allocated before it is verified.</p></div></div>' + UI.Button({ label: 'Verify request', icon: 'check', action: 'nav', arg: '#/dispatcher/verify/' + id }) + '</section>';
    } else if (r.status === 'offered') {
      const a = Store.amb(r.offer.ambulanceId);
      const c = Store.candidates(r);
      main = '<section class="card pad offer-wait" id="offer-panel"><div class="offer-wait-in">' + UI.Ring(r.offer.expiresAt, Store.OFFER_MS, 132, 'seconds') +
        '<div><span class="section-label">Waiting for crew to accept</span><h2>' + esc(a.id) + ' · ' + a.type + '</h2><p class="muted">' + esc(a.crew) + '</p>' +
        '<p>' + Store.distKm(Store.ambPos(a), r.location).toFixed(1) + ' km · ETA ' + Store.etaMin(Store.distKm(Store.ambPos(a), r.location)) + ' min</p>' +
        (r.offer.tried.length ? '<p class="chip chip-orange">Already tried: ' + r.offer.tried.join(', ') + '</p>' : '') +
        '<p class="hint">If the crew declines or 60 s pass, the next nearest unit is offered automatically' + (c.length ? ' (next: ' + c[0].amb.id + ')' : ' – none left, the request then goes on the waiting list') + '.</p></div></div></section>';
    } else if (['verified', 'waiting'].includes(r.status)) {
      main = '<section class="card"><div class="card-head"><h2>Available ambulances</h2><span class="muted">Nearest first · out-of-service units hidden</span></div>' +
        (list.length ? '<div class="table-wrap"><table class="table"><thead><tr><th>Unit</th><th>Type</th><th>Distance</th><th>ETA</th><th>Status</th><th></th></tr></thead><tbody>' +
          list.map((c) => '<tr class="' + (sug && c.amb.id === sug.amb.id ? 'row-suggested' : '') + '"' + (sug && c.amb.id === sug.amb.id ? ' id="row-suggested"' : '') + '><td><strong>' + c.amb.id + '</strong><small class="muted block">' + esc(c.amb.plate || '') + '</small></td><td>' + c.amb.type + '</td><td>' + c.km + ' km</td><td>' + c.eta + ' min</td><td>' + UI.AmbStatus(c.amb) + '</td><td>' + (sug && c.amb.id === sug.amb.id ? '<span class="chip chip-green-solid">' + UI.icon('target', 14) + ' Suggested – nearest</span>' : '') + '</td></tr>').join('') +
          '</tbody></table></div><div class="card-foot btn-row">' + UI.Button({ label: 'Assign ' + sug.amb.id, icon: 'check', action: 'assign', arg: sug.amb.id, size: 'lg', attrs: 'id="btn-assign"' }) +
          UI.Button({ label: 'Choose another', variant: 'secondary', action: 'choose-other', size: 'lg', disabled: list.length < 2 }) + '</div>'
          : UI.EmptyState({ icon: 'hourglass', title: 'No ambulance free', text: 'The request is on the waiting list (position ' + (Store.waitingPosition(id) || '—') + '). You will be alerted as soon as a unit is free.', action: UI.Button({ label: 'Open waiting list', variant: 'secondary', action: 'nav', arg: '#/dispatcher/waiting' }) })) + '</section>';
    } else {
      const a = Store.amb(r.ambulanceId);
      main = '<section class="card pad"><div class="alert alert-green">' + UI.icon('checkCircle', 22) + '<div><strong>' + esc(r.ambulanceId) + ' accepted the assignment</strong><p>Status: ' + UI.StatusChip(r.status) + (a && a.trip ? ' · ETA ' + UI.Countdown(a.trip.end) : '') + '</p></div></div><div class="btn-row">' +
        UI.Button({ label: 'Open case log', icon: 'file', action: 'nav', arg: '#/dispatcher/case/' + id }) + UI.Button({ label: 'Change hospital', variant: 'secondary', icon: 'hospital', action: 'nav', arg: '#/dispatcher/hospital/' + id }) + '</div></section>';
    }
    const side = '<section class="card pad"><div class="card-head flat"><h2>Destination hospital</h2>' + UI.Button({ label: h ? 'Change' : 'Select', variant: 'secondary', size: 'sm', icon: 'hospital', action: 'nav', arg: '#/dispatcher/hospital/' + id, attrs: 'id="btn-hosp"' }) + '</div>' +
      (h ? '<p class="hosp-line"><strong>' + esc(h.name) + '</strong> · ' + h.beds.emergency + ' emergency beds free</p><p>' + hospStatus(r) + '</p>' : '<p class="muted">Suggested automatically when an ambulance is assigned.</p>') + '</section>' +
      '<section class="card map-card"><div class="map-box">' + MapView.render({ focus: [r.location].concat((r.ambulanceId ? [Store.amb(r.ambulanceId)] : list.slice(0, 3).map((c) => c.amb)).map((a) => Store.ambPos(a))), pad: 8, pickup: r.location, ambulances: r.ambulanceId ? [Store.amb(r.ambulanceId)] : list.map((c) => c.amb), highlightAmb: sug ? sug.amb.id : r.ambulanceId, hospitals: Store.state.hospitals, label: 'Candidate ambulances' }) + '</div></section>';
    const body = back('#/dispatcher/dashboard', 'Dashboard') + reqHead(r) + '<div class="two-col wide-left"><div class="stack">' + main + '</div><div class="stack">' + side + '</div></div>';
    return shell('requests', 'Allocate ambulance', body);
  }
  function hospStatus(r) {
    const s = r.hospital.status;
    if (s === 'accepted') return '<span class="chip chip-green">' + UI.icon('check', 14) + ' Accepted – bed reserved</span>';
    if (s === 'pending') return '<span class="chip chip-orange">Waiting for answer · ' + UI.Countdown(r.hospital.deadline) + '</span>' + (r.hospital.overdue ? ' <span class="chip chip-red">No answer – overdue</span>' : '');
    return '<span class="chip chip-gray">Notified when the crew accepts</span>';
  }

  /* 14 – Select / change hospital */
  function hospital(id) {
    const r = Store.get(id); if (!r) return notFound();
    const opts = Store.hospitalOptions(r);
    const sug = Store.suggestedHospital(r);
    const body = back(routeFor(r), r.id) + reqHead(r) +
      '<div class="two-col wide-left"><section class="card"><div class="card-head"><h2>Hospitals by distance from patient</h2><span class="muted">Full hospitals cannot be selected</span></div><ul class="hosp-list">' +
      opts.map((o) => {
        const sel = r.hospitalId === o.h.id; const off = o.full || o.declined;
        return '<li class="hosp-item' + (off ? ' disabled' : '') + (sel ? ' selected' : '') + '"' + (sug && sug.h.id === o.h.id ? ' id="hosp-suggested"' : '') + '><span class="hosp-ic">' + UI.icon('hospital', 22) + '</span><div class="grow"><strong>' + esc(o.h.name) + '</strong>' +
          (sug && sug.h.id === o.h.id ? ' <span class="chip chip-green-solid">Suggested – nearest with free beds</span>' : '') + (o.declined ? ' <span class="chip chip-red">Declined</span>' : '') +
          '<small>' + esc(o.h.district) + ' · ' + o.km + ' km · ' + o.eta + ' min from patient</small></div>' +
          '<div class="beds"><span class="' + (o.full ? 'bad' : 'ok') + '">' + o.h.beds.emergency + '<small>ER free</small></span><span>' + o.h.beds.icu + '<small>ICU</small></span></div>' +
          (sel ? '<span class="chip chip-green">' + UI.icon('check', 14) + ' Selected</span>' : UI.Button({ label: o.full ? 'Full' : 'Select', variant: 'secondary', size: 'sm', action: 'pick-hosp', arg: o.h.id, disabled: off })) + '</li>';
      }).join('') + '</ul></section>' +
      '<section class="card map-card"><div class="map-box">' + MapView.render({ focus: [r.location].concat(opts.slice(0, 3).map((o) => o.h)), pad: 8, pickup: r.location, hospitals: opts.map((o) => o.h), highlightHosp: r.hospitalId, label: 'Hospitals near the patient' }) + '</div>' +
      (r.hospitalId ? '<div class="pad">' + hospStatus(r) + '</div>' : '') + '</section></div>';
    return shell('requests', 'Select hospital', body);
  }

  /* 15 – Case log */
  function caseLog(id) {
    const r = Store.get(id); if (!r) return notFound();
    const a = Store.amb(r.ambulanceId); const h = Store.hosp(r.hospitalId);
    const canClose = r.status === 'handedOver';
    const v = r.vitals;
    const body = back('#/dispatcher/dashboard', 'Dashboard') + reqHead(r) +
      '<div class="btn-row case-actions">' +
      (r.status === 'received' ? UI.Button({ label: 'Verify', icon: 'check', action: 'nav', arg: '#/dispatcher/verify/' + id }) : '') +
      (['verified', 'offered'].includes(r.status) ? UI.Button({ label: 'Allocate ambulance', icon: 'ambulance', action: 'nav', arg: '#/dispatcher/allocate/' + id }) : '') +
      (['offered', 'enroute', 'atPatient', 'toHospital'].includes(r.status) ? UI.Button({ label: 'Change hospital', variant: 'secondary', icon: 'hospital', action: 'nav', arg: '#/dispatcher/hospital/' + id }) : '') +
      (r.status === 'closed' ? '<span class="chip chip-gray">Case closed ' + Store.fmtTime(r.times.closed) + '</span>' :
        '<span class="tip-wrap">' + UI.Button({ label: 'Close case', icon: 'checkCircle', action: 'close-case', arg: id, disabled: !canClose, attrs: 'id="btn-close" aria-describedby="close-tip"' }) +
        (canClose ? '' : '<span class="tip" id="close-tip" role="tooltip">Enabled after the crew marks the patient as handed over</span>') + '</span>') +
      '</div><div class="two-col">' +
      '<div class="stack"><section class="card pad"><h2 class="card-title">Summary</h2>' + UI.KV([
        ['Type', esc(Store.TYPES[r.type])], ['Priority', UI.Badge(r.priority)], ['Patients', String(r.patients)], ['Condition', esc(r.condition || '—')],
        ['Location', esc(r.location.name)], ['Caller', esc(r.callerPhone) + ' · ' + esc(Store.channelLabel(r.channel))],
        ['Ambulance', a ? a.id + ' · ' + a.type + ' · ' + esc(a.crew) : '—'], ['Hospital', h ? esc(h.name) + ' ' + hospStatus(r) : '—'],
      ]) + '</section>' +
      (v ? '<section class="card pad"><h2 class="card-title">Vitals from crew</h2><div class="vitals-grid">' + vitalsTiles(v) + '</div>' + (r.firstAid.length ? '<p><strong>First aid:</strong> ' + esc(r.firstAid.join(', ')) + '</p>' : '') + (r.notes ? '<p class="muted">' + esc(r.notes) + '</p>' : '') + '</section>' : '') +
      '</div><section class="card"><div class="card-head"><h2>Case log</h2><span class="muted">' + UI.icon('lock', 14) + ' read-only · ' + r.log.length + ' entries</span></div><div class="table-wrap"><table class="table log-table"><thead><tr><th>Time</th><th>Action</th><th>By</th><th>Role</th></tr></thead><tbody>' +
      r.log.map((l) => '<tr><td class="nowrap">' + Store.fmtTime(l.at) + '</td><td>' + esc(l.text) + '</td><td>' + esc(l.by) + '</td><td><span class="chip chip-gray">' + l.role + '</span></td></tr>').join('') +
      '</tbody></table></div></section></div>';
    return shell('requests', 'Case log', body);
  }
  function vitalsTiles(v) {
    return [['Blood pressure', v.bp || '—', 'mmHg'], ['Heart rate', v.hr || '—', 'bpm'], ['SpO₂', v.spo2 || '—', '%'], ['Consciousness', v.avpu || '—', 'AVPU']].map((x) =>
      '<div class="vital"><small>' + x[0] + '</small><strong>' + esc(x[1]) + '</strong><span>' + x[2] + '</span></div>').join('');
  }

  /* Ambulances overview */
  function ambulances() {
    const list = Store.state.ambulances;
    const body = '<div class="card"><div class="card-head"><h2>Fleet</h2>' + MapView.Legend() + '</div><div class="table-wrap"><table class="table"><thead><tr><th>Unit</th><th>Type</th><th>Plate</th><th>Status</th><th>Location</th><th>Crew</th><th>Current job</th></tr></thead><tbody>' +
      list.map((a) => { const r = a.requestId && Store.get(a.requestId); return '<tr><td><strong>' + a.id + '</strong></td><td>' + a.type + '</td><td>' + esc(a.plate || '') + '</td><td>' + UI.AmbStatus(a) + '</td><td>' + esc(Store.nearestPlace(Store.ambPos(a)).name) + '</td><td>' + esc(a.crew) + '</td><td>' + (r ? '<a class="link" href="' + routeFor(r) + '">' + r.id + '</a> ' + UI.StatusChip(r.status) : esc(a.job || '—')) + '</td></tr>'; }).join('') +
      '</tbody></table></div></div>';
    return shell('ambulances', 'Ambulances', body, Store.availableAmbulances().length + ' available now');
  }
  /* Hospitals overview */
  function hospitals() {
    const body = '<div class="card"><div class="table-wrap"><table class="table"><thead><tr><th>Hospital</th><th>District</th><th>Emergency beds</th><th>ICU</th><th>Theatre</th><th>Incoming</th><th>Status</th></tr></thead><tbody>' +
      Store.state.hospitals.map((h) => { const inc = Store.activeRequests().filter((r) => r.hospitalId === h.id).length; return '<tr class="' + (h.beds.emergency <= 0 || h.disabled ? 'row-muted' : '') + '"><td><strong>' + esc(h.name) + '</strong></td><td>' + esc(h.district) + '</td><td>' + h.beds.emergency + '</td><td>' + h.beds.icu + '</td><td>' + h.beds.theatre + '</td><td>' + inc + '</td><td>' + (h.disabled ? '<span class="chip chip-gray">Disabled</span>' : h.beds.emergency <= 0 ? '<span class="chip chip-red">Full</span>' : '<span class="chip chip-green">Accepting</span>') + '</td></tr>'; }).join('') +
      '</tbody></table></div></div>';
    return shell('hospitals', 'Hospitals', body, 'Capacity is updated by hospital staff in real time');
  }

  /* 13 – Waiting list */
  function waiting() {
    const list = Store.waitingList();
    const free = Store.availableAmbulances();
    const body = (free.length && list.length ? '<div class="alert alert-green">' + UI.icon('ambulance', 22) + '<div><strong>' + free.map((a) => a.id).join(', ') + ' ' + (free.length > 1 ? 'are' : 'is') + ' free now</strong><p>Assign the first request on the list.</p></div></div>' : '') +
      '<div class="card"><div class="card-head"><h2>Waiting for a free ambulance</h2><span class="muted">Ordered by priority, then time</span></div>' +
      (list.length ? '<div class="table-wrap"><table class="table"><thead><tr><th>#</th><th>Request</th><th>Priority</th><th>Type</th><th>Location</th><th>Waiting</th><th>Actions</th></tr></thead><tbody>' +
        list.map((r, i) => '<tr><td><span class="pos">' + (i + 1) + '</span></td><td><a class="link" href="#/dispatcher/case/' + r.id + '"><strong>' + r.id + '</strong></a></td><td>' + UI.Badge(r.priority) + '</td><td>' + esc(Store.TYPES[r.type]) + '</td><td>' + esc(r.location.name) + '</td><td class="mono">' + UI.Elapsed(r.times.waiting || r.createdAt) + '</td><td><div class="btn-row">' +
          UI.Button({ label: 'Assign now', size: 'sm', icon: 'ambulance', action: 'nav', arg: '#/dispatcher/allocate/' + r.id, disabled: !free.length }) +
          UI.Button({ label: r.autoAssign ? 'Auto-assign on ✓' : 'Assign as soon as free', size: 'sm', variant: r.autoAssign ? 'primary-soft' : 'secondary', action: 'auto-assign', arg: r.id }) + '</div></td></tr>').join('') + '</tbody></table></div>'
        : UI.EmptyState({ icon: 'checkCircle', title: 'No requests waiting', text: 'Verified requests go here automatically when no ambulance is free.' })) + '</div>';
    return shell('waiting', 'Waiting list', body, list.length + ' request(s) waiting · ' + free.length + ' unit(s) free');
  }

  function notFound() { return shell('requests', 'Not found', UI.EmptyState({ icon: 'search', title: 'Request not found', action: UI.Button({ label: 'Dashboard', action: 'nav', arg: '#/dispatcher/dashboard' }) })); }

  function render(screen, param) {
    if (screen === 'login') {
      if (Store.state.sessions.dispatcher) return EAMS.App.redirect('#/dispatcher/dashboard');
      const l = ui().login.dispatcher || {};
      return UI.LoginCard({ roleLabel: 'Dispatcher', error: l.error, locked: l.locked, username: l.username, creds: [{ username: 'dispatcher', label: 'Grace Mukamana' }] });
    }
    if (!Store.state.sessions.dispatcher) return EAMS.App.redirect('#/dispatcher/login');
    switch (screen) {
      case 'dashboard': return dashboard();
      case 'requests': return requests();
      case 'new': return newCall();
      case 'verify': return verify(param);
      case 'allocate': return allocate(param);
      case 'hospital': return hospital(param);
      case 'case': return caseLog(param);
      case 'ambulances': return ambulances();
      case 'hospitals': return hospitals();
      case 'waiting': return waiting();
      case 'reports': return shell('reports', 'Reports', EAMS.Views.admin.reportsBody(), 'Response times, demand and fleet use');
      default: return EAMS.App.redirect('#/dispatcher/dashboard');
    }
  }
  function onEnter(screen, param) {
    if (['verify', 'case', 'allocate'].includes(screen) && param && Store.state.sessions.dispatcher) Store.logView(ROLE, param);
  }

  function result(res, okMsg) { if (res.ok) { if (okMsg) UI.toast(okMsg, 'success'); } else UI.toast(res.error, 'error'); return res.ok; }

  const actions = {
    'req-filter'(el) { ui().drafts.dreq = { filter: el.dataset.arg }; EAMS.App.render(); },
    'pc-patients'(el) { const d = ui().drafts.phone; d.patients = Math.max(1, Math.min(30, d.patients + +el.dataset.arg)); EAMS.App.render(); },
    'map-pick'(el, e) {
      const svg = e.target.closest('svg.map-svg'); const p = MapView.toMapPoint(svg, e);
      const n = Store.nearestPlace(p); const d = ui().drafts.phone;
      d.point = p; d.loc = 'Map point near ' + n.name; d.district = n.district; d.errors.loc = false;
      EAMS.App.render();
    },
    'create-call'() {
      const d = ui().drafts.phone;
      d.errors = { phone: !d.phone.trim(), type: !d.type, loc: !d.loc.trim() };
      if (d.errors.phone || d.errors.type || d.errors.loc) { EAMS.App.render(); return UI.toast('Please complete the required fields', 'error'); }
      const loc = d.point ? { name: d.loc, detail: 'Kigali, Rwanda', x: d.point.x, y: d.point.y, district: d.district, source: 'map' } : Store.geocode(d.loc);
      const res = Store.createRequest({ type: d.type, condition: d.condition, patients: d.patients, location: loc, callerPhone: d.phone, channel: 'phone' }, ROLE);
      ui().drafts.phone = null;
      UI.toast('Request ' + res.id + ' created from 912 call', 'success');
      EAMS.App.navigate('#/dispatcher/verify/' + res.id);
    },
    async 'edit-loc'(el) {
      const r = Store.get(el.dataset.arg);
      let typed = '';
      const v = await UI.modal({
        title: 'Edit location – ' + r.id,
        body: UI.Field({ id: 'v-loc', label: 'Address or landmark', input: '<input id="v-loc" list="v-places" value="' + esc(r.location.name) + '">' }) + '<datalist id="v-places">' + Store.PLACES.map((p) => '<option value="' + esc(p.name) + '">').join('') + '</datalist>',
        actions: [{ label: 'Cancel', variant: 'secondary', value: null }, { label: 'Save location', value: 'ok' }],
        onAction(val, root) { typed = root.querySelector('#v-loc').value.trim(); if (!typed) return false; return true; },
      });
      if (v) result(Store.updateRequest(r.id, { location: Store.geocode(typed) }, ROLE), 'Location updated');
    },
    verify(el) {
      const id = el.dataset.arg; const d = ui().drafts['v' + id] || {};
      const res = Store.verifyRequest(id, { priority: d.priority });
      if (!result(res)) return;
      if (res.waiting) { UI.toast(id + ' verified – no ambulance free, added to the waiting list', 'warn'); EAMS.App.navigate('#/dispatcher/waiting'); }
      else { UI.toast(id + ' verified', 'success'); EAMS.App.navigate('#/dispatcher/allocate/' + id); }
    },
    async 'false-call'(el) {
      const id = el.dataset.arg;
      const r = await UI.askReason({ title: 'Mark ' + id + ' as false call', text: 'The request is closed and the caller number is flagged. A reason is required.', options: ['Prank call', 'Caller confirmed no emergency', 'Duplicate of another request', 'Other'], confirmLabel: 'Mark as false call', danger: true });
      if (r && result(Store.markFalseCall(id, r.reason), id + ' marked as false call')) EAMS.App.navigate('#/dispatcher/dashboard');
    },
    assign(el, e, R) { result(Store.assignAmbulance(R.param, el.dataset.arg), el.dataset.arg + ' assigned – waiting for crew to accept'); },
    async 'choose-other'(el, e, R) {
      const r = Store.get(R.param);
      const list = Store.candidates(r); const sug = Store.suggestedOf(list, r);
      const others = list.filter((c) => c.amb.id !== sug.amb.id);
      const res = await UI.askReason({
        title: 'Choose another ambulance', text: 'Selecting a unit other than the suggested nearest one requires a reason.',
        extra: UI.Field({ id: 'other-unit', label: 'Ambulance', input: '<select id="other-unit">' + others.map((c) => '<option value="' + c.amb.id + '">' + c.amb.id + ' · ' + c.amb.type + ' · ' + c.km + ' km · ' + c.eta + ' min</option>').join('') + '</select>' }),
        options: ['Suggested unit lacks the required equipment', 'Road closure on the suggested route', 'Crew already contacted by radio', 'Other'], confirmLabel: 'Assign',
      });
      if (res) { const unit = res.form.querySelector('#other-unit').value; result(Store.assignAmbulance(r.id, unit, res.reason), unit + ' assigned – waiting for crew to accept'); }
    },
    'pick-hosp'(el, e, R) { result(Store.setHospital(R.param, el.dataset.arg, ROLE), 'Hospital updated'); },
    'close-case'(el) { if (result(Store.closeCase(el.dataset.arg), 'Case ' + el.dataset.arg + ' closed')) EAMS.App.render(); },
    'export-csv'() { EAMS.Views.admin.exportCsv(); },
    'auto-assign'(el) { const r = Store.get(el.dataset.arg); result(Store.setAutoAssign(r.id, !r.autoAssign), !r.autoAssign ? 'Will be assigned automatically when a unit is free' : 'Automatic assignment off'); },
  };

  return { layout: 'desktop', render, actions, onEnter, routeFor, vitalsTiles };
})();
