/* AMBULANCE CREW mobile app – screens 16–22.
 * The crew app is state-driven: whatever route is opened, it shows the
 * screen that matches the unit's current assignment. */
EAMS.Views.crew = (function () {
  const { UI, Store, MapView } = EAMS;
  const esc = UI.esc;
  const ui = () => EAMS.App.ui;
  const ROLE = 'crew';

  // Simulated turn-by-turn instructions along a route (by progress quarter).
  const TURNS = {
    patient: [['turnRight', 'Turn right onto KG 7 Ave', 300], ['turnLeft', 'Turn left onto KN 3 Rd', 450], ['turnRight', 'Turn right onto KG 9 Ave', 250], ['pin', 'Patient on the left', 80]],
    hospital: [['turnLeft', 'Turn left onto KN 5 Rd', 400], ['turnRight', 'Turn right onto KN 1 Rd', 600], ['turnLeft', 'Turn left onto KN 4 Ave', 300], ['hospital', 'Emergency entrance ahead', 100]],
  };

  const session = () => Store.state.sessions.crew;
  const myAmb = () => session() && Store.amb(session().ambulanceId);
  const myReq = () => { const a = myAmb(); return a && a.requestId ? Store.get(a.requestId) : null; };
  function screenFor() {
    if (!session()) return 'login';
    const r = myReq();
    if (!r) return 'idle';
    return { offered: 'assignment', enroute: 'nav', atPatient: 'patient', toHospital: 'to-hospital', atHospital: 'handover', handedOver: 'handover', closed: 'handover' }[r.status] || 'idle';
  }

  function header(a, extra) {
    return UI.Header({
      left: '<div class="brand-inline">' + UI.Logo(32) + '<div class="crew-unit"><strong>' + esc(a.id) + ' · ' + a.type + '</strong><small>' + esc(session().names) + '</small></div></div>',
      right: (extra || '') + UI.AmbStatus(a),
    });
  }
  function statusBar(r) {
    const steps = [['enroute', 'On the way'], ['atPatient', 'At the patient'], ['toHospital', 'Going to hospital'], ['free', 'Free']];
    const order = ['enroute', 'atPatient', 'toHospital', 'free'];
    const cur = ['atHospital', 'handedOver'].includes(r.status) ? 2 : order.indexOf(r.status);
    return '<div class="status-steps" role="group" aria-label="Unit status">' + steps.map((s, i) =>
      '<button type="button" class="ss' + (i === cur ? ' current' : i < cur ? ' done' : '') + '" ' + (i === cur + 1 && s[0] === 'atPatient' ? 'data-action="at-patient"' : 'disabled') + ' aria-current="' + (i === cur) + '">' +
      (i < cur ? UI.icon('check', 14) : '') + s[1] + '</button>').join('') + '</div>';
  }
  function turnCard(kind, trip) {
    return '<div class="turn-card" data-turn=\'' + JSON.stringify({ k: kind, s: trip.start, e: trip.end }) + '\' aria-live="polite"><span class="turn-ic"></span><div><strong class="turn-text"></strong><small class="turn-dist"></small></div></div>';
  }
  function hospitalBanner(r) {
    const h = Store.hosp(r.hospitalId);
    if (!h) return '<div class="banner banner-red" id="hosp-banner">' + UI.icon('alert', 20) + '<span>No hospital with free beds – contact dispatcher</span></div>';
    if (r.hospital.status === 'accepted') return '<div class="banner banner-green" id="hosp-banner">' + UI.icon('checkCircle', 20) + '<span><strong>Hospital ready – confirmed</strong>' + esc(h.name) + (r.hospital.reroutedFrom ? ' · rerouted from ' + esc(r.hospital.reroutedFrom) : '') + '</span></div>';
    if (r.hospital.reroutedFrom) return '<div class="banner banner-red" id="hosp-banner">' + UI.icon('alert', 20) + '<span><strong>Hospital declined – rerouting to ' + esc(h.name) + '</strong>' + esc(r.hospital.reroutedFrom) + ' cannot accept · waiting for confirmation</span></div>';
    if (r.hospital.status === 'pending') return '<div class="banner banner-orange" id="hosp-banner">' + UI.icon('hourglass', 20) + '<span><strong>Waiting for ' + esc(h.name) + '</strong>Hospital notified · ' + UI.Countdown(r.hospital.deadline) + '</span></div>';
    return '<div class="banner banner-gray" id="hosp-banner">' + UI.icon('hospital', 20) + '<span>' + esc(h.name) + ' will be notified</span></div>';
  }

  /* 16 – Login / shift start */
  function login() {
    const d = ui().drafts.shift = ui().drafts.shift || { unit: 'A-03', names: Store.amb('A-03').crew, status: 'available' };
    if (d._unit !== d.unit) { d._unit = d.unit; d.names = Store.amb(d.unit).crew; } // prefill crew of the chosen unit
    const units = Store.state.ambulances.filter((a) => !a.disabled);
    return UI.Header({ left: '<div class="brand-inline">' + UI.Logo(34) + '<strong>EAMS Crew</strong></div>', right: '<a class="icon-btn" href="#/" aria-label="All roles">' + UI.icon('home', 22) + '</a>' }) +
      '<form class="m-body stack" data-submit="start-shift" data-keep-scroll="cr-login">' +
      '<div class="crew-hero">' + UI.icon('ambulance', 40) + '<h2>Start your shift</h2><p class="muted">Sign in with your unit to receive assignments.</p></div>' +
      UI.Field({ id: 's-unit', label: 'Unit number', input: '<select id="s-unit" data-model="shift.unit" data-rerender>' + units.map((a) => '<option value="' + a.id + '"' + (a.id === d.unit ? ' selected' : '') + '>' + a.id + ' · ' + a.type + ' · ' + esc(a.plate || '') + '</option>').join('') + '</select>' }) +
      UI.Field({ id: 's-names', label: 'Crew names', input: '<input id="s-names" data-model="shift.names" value="' + esc(d.names === '—' ? '' : d.names) + '" placeholder="Driver, paramedic">' }) +
      '<div class="field"><span class="label-like">Status</span>' + UI.Segmented({ label: 'Status', action: 'shift-status', value: d.status, options: [{ value: 'available', label: 'Available', tone: 'green' }, { value: 'out', label: 'Out of service', tone: 'gray' }] }) + '</div>' +
      '</form><div class="m-footer">' + UI.Button({ label: 'Start shift', icon: 'power', block: true, size: 'lg', action: 'start-shift', attrs: 'id="btn-shift"' }) + '</div>';
  }

  /* 17 – Idle */
  function idle() {
    const a = myAmb(); const pos = Store.ambPos(a);
    const on = a.status === 'available';
    return header(a) + '<div class="m-body stack" data-keep-scroll="cr-idle">' +
      '<section class="card pad center-col idle-card"><span class="radar' + (on ? '' : ' off') + '">' + UI.icon(on ? 'ambulance' : 'power', 30) + '</span>' +
      '<h2 class="m-h2">' + (on ? 'Waiting for assignments' : 'Out of service') + '</h2><p class="muted center">' + (on ? 'You will be alerted here as soon as the dispatcher assigns an emergency.' : 'Switch to Available to receive emergencies.') + '</p>' +
      UI.Segmented({ label: 'Status', action: 'crew-status', value: on ? 'available' : 'out', options: [{ value: 'available', label: 'Available', tone: 'green' }, { value: 'out', label: 'Out of service', tone: 'gray' }] }) + '</section>' +
      '<section class="card"><div class="mini-map">' + MapView.render({ focus: [pos], minSpan: 30, ambulances: [a], highlightAmb: a.id, hospitals: Store.state.hospitals, label: 'Your position' }) + '</div>' +
      '<div class="pad">' + UI.KV([['Position', esc(Store.nearestPlace(pos).name)], ['Shift started', Store.fmtTime(session().startedAt)], ['Crew', esc(session().names)]]) + '</div></section>' +
      UI.Button({ label: 'End shift', icon: 'logout', variant: 'ghost', block: true, action: 'end-shift' }) + '</div>';
  }

  /* 18 – New assignment (green full-screen alert) */
  function assignment() {
    const r = myReq(); const a = myAmb();
    const km = Store.distKm(Store.ambPos(a), r.location).toFixed(1);
    return '<div class="alert-screen" role="alertdialog" aria-labelledby="as-title">' +
      '<span class="alert-badge">' + UI.icon('siren', 30) + '</span>' +
      '<p class="alert-kicker" id="as-title">NEW EMERGENCY ASSIGNMENT</p>' +
      '<section class="assign-card"><div class="row-between"><div class="assign-type"><span class="type-ic">' + UI.icon(UI.typeIcon(r.type), 24) + '</span><strong>' + esc(Store.TYPES[r.type]) + '</strong></div>' + UI.Badge(r.priority, { solid: true, label: r.priority.toUpperCase() }) + '</div>' +
      '<div class="assign-grid"><div><small>Patients</small><strong>' + r.patients + '</strong></div><div><small>Request</small><strong>' + r.id + '</strong></div></div>' +
      '<div class="assign-loc">' + UI.icon('pin', 20, 'red') + '<div><strong>' + esc(r.location.name) + '</strong><small>' + km + ' km away · ETA ' + Store.etaMin(+km) + ' min</small></div></div>' +
      (r.condition ? '<p class="assign-note">' + esc(r.condition) + '</p>' : '') + '</section>' +
      '<p class="alert-kicker sm">DECISION REQUIRED IN</p>' +
      '<div class="decision-timer">' + UI.Countdown(r.offer.expiresAt, 'mmss', 15000) + '<div class="bar"><span data-bar-until="' + r.offer.expiresAt + '" data-bar-total="' + Store.OFFER_MS + '"></span></div></div>' +
      '<div class="btn-row">' + UI.Button({ label: 'Decline', variant: 'outline-white', size: 'lg', action: 'decline', icon: 'x' }) + UI.Button({ label: 'Accept', variant: 'white', size: 'lg', action: 'accept', icon: 'check', attrs: 'id="btn-accept"' }) + '</div></div>';
  }

  /* 19 – Navigation to patient */
  function navPatient() {
    const r = myReq(); const a = myAmb(); const h = Store.hosp(r.hospitalId);
    return '<div class="track-screen">' + header(a) +
      '<div class="track-map">' + MapView.render({ focus: a.trip.route, pad: 6, ambulances: [a], highlightAmb: a.id, route: { points: a.trip.route }, dest: r.location, label: 'Route to patient' }) + turnCard('patient', a.trip) + '</div>' +
      '<section class="sheet"><span class="sheet-grip" aria-hidden="true"></span>' +
      '<div class="row-between"><div><span class="eta-big">' + UI.Countdown(a.trip.end, 'min') + ' · <span data-trip-km=\'' + JSON.stringify({ km: a.trip.km, s: a.trip.start, e: a.trip.end }) + '\'>' + a.trip.km + '</span> km</span><small class="muted block">to patient · ' + esc(r.location.name) + '</small></div>' + UI.Badge(r.priority) + '</div>' +
      '<p class="sheet-note"><strong>' + r.id + '</strong> · ' + esc(Store.TYPES[r.type]) + ' · ' + r.patients + ' patient(s)' + (r.condition ? ' – ' + esc(r.condition) : '') + '</p>' +
      '<div class="sheet-row">' + UI.icon('hospital', 18, 'green') + '<div><strong>' + (h ? esc(h.name) : 'No hospital yet') + '</strong><small>' + (r.hospital.status === 'accepted' ? 'Ready – confirmed' : r.hospital.status === 'pending' ? 'Notified – waiting for answer' : '—') + '</small></div></div>' +
      statusBar(r) +
      '<div class="btn-row">' + UI.Button({ label: 'Call caller', icon: 'phone', variant: 'secondary', action: 'call', arg: r.callerPhone }) + UI.Button({ label: 'At the patient', icon: 'pin', action: 'at-patient', attrs: 'id="btn-at-patient"' }) + '</div></section></div>';
  }

  /* 20 – At the patient */
  function patient() {
    const r = myReq(); const a = myAmb(); const h = Store.hosp(r.hospitalId);
    const key = 'vit' + r.id;
    const d = ui().drafts[key] = ui().drafts[key] || Object.assign({ bp: '', hr: '', spo2: '', avpu: 'Alert', notes: r.notes || '' }, r.vitals || {});
    const aid = (ui().drafts['aid' + r.id] = ui().drafts['aid' + r.id] || (r.firstAid || []).slice());
    const AIDS = ['Oxygen', 'Bleeding control', 'Splint', 'Neck collar', 'IV line', 'CPR'];
    return header(a) + '<div class="m-body stack" data-keep-scroll="cr-pat">' +
      '<div class="row-between"><h2 class="m-h2 left">' + r.id + ' · At the patient</h2>' + UI.Badge(r.priority) + '</div>' + statusBar(r) +
      '<section class="card pad stack"><h3 class="section-label">Vital signs</h3><div class="grid-2">' +
      UI.Field({ id: 'vt-bp', label: 'Blood pressure (mmHg)', input: '<input id="vt-bp" inputmode="numeric" data-model="' + key + '.bp" value="' + esc(d.bp) + '" placeholder="120/80">' }) +
      UI.Field({ id: 'vt-hr', label: 'Heart rate (bpm)', input: '<input id="vt-hr" type="number" min="0" max="250" data-model="' + key + '.hr" value="' + esc(d.hr) + '" placeholder="80">' }) +
      UI.Field({ id: 'vt-spo2', label: 'SpO₂ (%)', input: '<input id="vt-spo2" type="number" min="0" max="100" data-model="' + key + '.spo2" value="' + esc(d.spo2) + '" placeholder="98">' }) +
      UI.Field({ id: 'vt-avpu', label: 'Consciousness', input: '<select id="vt-avpu" data-model="' + key + '.avpu">' + ['Alert', 'Verbal', 'Pain', 'Unresponsive'].map((x) => '<option' + (d.avpu === x ? ' selected' : '') + '>' + x + '</option>').join('') + '</select>' }) + '</div>' +
      '<fieldset class="field"><legend>First aid given</legend><div class="chip-checks">' + AIDS.map((x) => '<button type="button" class="chip-check' + (aid.includes(x) ? ' on' : '') + '" aria-pressed="' + aid.includes(x) + '" data-action="toggle-aid" data-arg="' + x + '">' + (aid.includes(x) ? UI.icon('check', 14) : '') + x + '</button>').join('') + '</div></fieldset>' +
      UI.Field({ id: 'vt-notes', label: 'Notes', input: '<textarea id="vt-notes" rows="2" data-model="' + key + '.notes" placeholder="Observations, medication given…">' + esc(d.notes) + '</textarea>' }) +
      UI.Button({ label: 'Send vitals to hospital', icon: 'send', variant: 'secondary', block: true, action: 'save-vitals' }) + '</section>' +
      '<section class="card pad"><h3 class="section-label">Destination hospital</h3><div class="row-between"><div><strong>' + (h ? esc(h.name) : 'None selected') + '</strong><small class="muted block">' + (h ? h.beds.emergency + ' ER beds free · ' + Store.distKm(r.location, h).toFixed(1) + ' km' : '') + '</small></div>' +
      UI.Button({ label: 'Change', variant: 'secondary', size: 'sm', icon: 'pencil', action: 'change-hosp' }) + '</div>' + hospitalBanner(r) + '</section>' +
      '</div><div class="m-footer">' + UI.Button({ label: 'Start transport to hospital', icon: 'navigation', block: true, size: 'lg', action: 'start-transport', attrs: 'id="btn-transport"', disabled: !h }) + '</div>';
  }

  /* 21 – Navigation to hospital */
  function toHospital() {
    const r = myReq(); const a = myAmb(); const h = Store.hosp(r.hospitalId);
    return '<div class="track-screen">' + header(a) + hospitalBanner(r) +
      '<div class="track-map">' + MapView.render({ focus: a.trip.route, pad: 6, ambulances: [a], highlightAmb: a.id, route: { points: a.trip.route }, hospitals: [h], highlightHosp: h.id, dest: { x: h.x, y: h.y }, label: 'Route to hospital' }) + turnCard('hospital', a.trip) + '</div>' +
      '<section class="sheet"><span class="sheet-grip" aria-hidden="true"></span>' +
      '<div class="row-between"><div><span class="eta-big">' + UI.Countdown(a.trip.end, 'min') + ' · <span data-trip-km=\'' + JSON.stringify({ km: a.trip.km, s: a.trip.start, e: a.trip.end }) + '\'>' + a.trip.km + '</span> km</span><small class="muted block">to ' + esc(h.name) + '</small></div>' + UI.Badge(r.priority) + '</div>' +
      statusBar(r) +
      '<div class="btn-row">' + UI.Button({ label: 'Call hospital', icon: 'phone', variant: 'secondary', action: 'call', arg: h.name }) + UI.Button({ label: 'Arrived at hospital', icon: 'hospital', action: 'arrived', attrs: 'id="btn-arrived"' }) + '</div></section></div>';
  }

  /* 22 – Handover */
  function handover() {
    const r = myReq(); const a = myAmb(); const h = Store.hosp(r.hospitalId);
    const done = ['handedOver', 'closed'].includes(r.status);
    const T = r.times;
    const km = (Store.roadKm(r.location, h) + (T.accepted ? 3.2 : 0)).toFixed(1);
    return header(a) + '<div class="m-body stack" data-keep-scroll="cr-hand">' +
      '<section class="card pad center-col"><span class="big-check' + (done ? '' : ' pending') + '">' + UI.icon(done ? 'check' : 'hospital', 40) + '</span>' +
      '<h2 class="m-h2">' + (done ? 'Handover complete' : 'Arrived at ' + esc(h.name)) + '</h2>' +
      '<p class="muted center">' + r.id + ' · ' + esc(Store.TYPES[r.type]) + ' · ' + r.patients + ' patient(s)</p></section>' +
      '<section class="card pad"><h3 class="section-label">Trip summary</h3><dl class="kv kv-times">' +
      [['Assignment accepted', T.accepted], ['At the patient', T.atPatient], ['Left for hospital', T.toHospital], ['Arrived at hospital', T.atHospital], ['Handed over', T.handedOver]].map((x) => '<div><dt>' + x[0] + '</dt><dd>' + Store.fmtTime(x[1]) + '</dd></div>').join('') +
      '<div class="kv-total"><dt>Response time</dt><dd>' + UI.durMin(T.atPatient - T.received) + '</dd></div><div><dt>Distance (approx.)</dt><dd>' + km + ' km</dd></div></dl></section>' +
      '</div><div class="m-footer">' + (done ? UI.Button({ label: 'Return to Available', icon: 'checkCircle', block: true, size: 'lg', action: 'free', attrs: 'id="btn-free"' })
        : UI.Button({ label: 'Mark patient handed over', icon: 'check', block: true, size: 'lg', action: 'handover', attrs: 'id="btn-handover"' })) + '</div>';
  }

  function render(screen) {
    const want = screenFor();
    if (screen !== want) return EAMS.App.redirect('#/crew/' + want);
    return { login, idle, assignment, nav: navPatient, patient, 'to-hospital': toHospital, handover }[want]();
  }

  /** Live turn instructions and decision bar (called every second). */
  function tick() {
    const t = Date.now();
    document.querySelectorAll('[data-turn]').forEach((el) => {
      const d = JSON.parse(el.dataset.turn);
      const f = Math.min(0.999, Math.max(0, (t - d.s) / (d.e - d.s)));
      const list = TURNS[d.k]; const i = Math.floor(f * list.length); const step = list[i];
      const local = f * list.length - i;
      const m = Math.max(20, Math.round(step[2] * (1 - local) / 10) * 10);
      el.querySelector('.turn-ic').innerHTML = UI.icon(step[0], 30);
      el.querySelector('.turn-text').textContent = step[1];
      el.querySelector('.turn-dist').textContent = 'in ' + m + ' m';
    });
    document.querySelectorAll('[data-bar-until]').forEach((el) => {
      const rem = Math.max(0, +el.dataset.barUntil - t);
      el.style.width = (rem / +el.dataset.barTotal * 100) + '%';
    });
  }

  function result(res, msg) { if (res.ok) { if (msg) UI.toast(msg, 'success'); } else UI.toast(res.error, 'error'); return res.ok; }
  function collectVitals(r) {
    const d = ui().drafts['vit' + r.id] || {};
    return { vitals: { bp: d.bp, hr: d.hr, spo2: d.spo2, avpu: d.avpu || 'Alert' }, firstAid: ui().drafts['aid' + r.id] || [], notes: d.notes || '' };
  }

  const actions = {
    'shift-status'(el) { ui().drafts.shift.status = el.dataset.arg; EAMS.App.render(); },
    'start-shift'() {
      const d = ui().drafts.shift;
      const names = (document.getElementById('s-names') || {}).value || d.names;
      if (!names || !names.trim() || names === '—') return UI.toast('Enter the crew names', 'error');
      if (result(Store.startShift(d.unit, names.trim(), d.status), 'Shift started on ' + d.unit)) EAMS.App.navigate('#/crew/home');
    },
    'crew-status'(el) { result(Store.setCrewStatus(el.dataset.arg)); },
    'end-shift'() { if (result(Store.endShift(), 'Shift ended')) ui().drafts.shift = null; },
    accept() { const r = myReq(); result(Store.crewAccept(r.id), 'Accepted – navigate to the patient'); },
    async decline() {
      const r = myReq();
      const res = await UI.askReason({ title: 'Decline ' + r.id, text: 'The next nearest ambulance will be offered automatically.', options: ['Vehicle problem', 'Crew still busy with previous patient', 'Missing equipment for this case', 'Other'], confirmLabel: 'Decline', danger: true });
      if (res) result(Store.crewDecline(r.id, res.reason), 'Assignment declined');
    },
    'at-patient'() { result(Store.crewAtPatient(myReq().id), 'Arrived at the patient'); },
    call(el) { UI.toast('Calling ' + el.dataset.arg + '… (simulated)', 'info'); },
    'toggle-aid'(el) {
      const r = myReq(); const list = ui().drafts['aid' + r.id]; const x = el.dataset.arg;
      const i = list.indexOf(x); if (i >= 0) list.splice(i, 1); else list.push(x);
      EAMS.App.render();
    },
    'save-vitals'() { const r = myReq(); result(Store.saveVitals(r.id, collectVitals(r)), 'Vitals sent to hospital'); },
    async 'change-hosp'() {
      const r = myReq();
      const opts = Store.hospitalOptions(r);
      let pick = null;
      const v = await UI.modal({
        title: 'Choose hospital',
        body: '<div class="reason-opts">' + opts.map((o) => '<label class="radio-row' + (o.full || o.declined ? ' disabled' : '') + '"><input type="radio" name="hosp" value="' + o.h.id + '"' + (o.h.id === r.hospitalId ? ' checked' : '') + (o.full || o.declined ? ' disabled' : '') + '> <span><strong>' + esc(o.h.name) + '</strong><small class="muted block">' + o.km + ' km · ' + o.h.beds.emergency + ' ER beds free' + (o.full ? ' · FULL' : '') + (o.declined ? ' · declined' : '') + '</small></span></label>').join('') + '</div>',
        actions: [{ label: 'Cancel', variant: 'secondary', value: null }, { label: 'Use this hospital', value: 'ok' }],
        onAction(val, root) { const c = root.querySelector('input[name=hosp]:checked'); pick = c && c.value; return true; },
      });
      if (v && pick && pick !== r.hospitalId) result(Store.setHospital(r.id, pick, ROLE, 'changed by crew at the scene'), 'Hospital changed – new hospital notified');
    },
    'start-transport'() {
      const r = myReq();
      const v = collectVitals(r);
      if (v.vitals.bp || v.vitals.hr || v.vitals.spo2) Store.saveVitals(r.id, v);
      result(Store.startTransport(r.id), 'Transport started');
    },
    arrived() { result(Store.crewArrivedHospital(myReq().id), 'Arrived at hospital'); },
    handover() { result(Store.handover(myReq().id, ROLE), 'Patient handed over'); },
    free() { result(Store.crewReturnAvailable(), 'Unit available again'); },
  };

  return { layout: 'phone', render, actions, tick, screenFor };
})();
