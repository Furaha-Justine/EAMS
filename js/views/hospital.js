/* HOSPITAL STAFF web app – screens 23–25.
 * Staff only see patients routed to their own hospital (privacy rule). */
EAMS.Views.hospital = (function () {
  const { UI, Store } = EAMS;
  const esc = UI.esc;
  const ui = () => EAMS.App.ui;
  const ROLE = 'hospital';
  const myHosp = () => Store.hosp(Store.currentHospitalId());

  const incoming = (h) => Store.state.requests.filter((r) => !r.archived && r.hospitalId === h.id &&
    ['enroute', 'atPatient', 'toHospital', 'atHospital'].includes(r.status) && ['pending', 'accepted'].includes(r.hospital.status))
    .sort((a, b) => Store.RANK[a.priority] - Store.RANK[b.priority]);

  function shell(active, title, body, subtitle) {
    const u = Store.user(Store.state.sessions.hospital); const h = myHosp();
    const n = incoming(h).filter((r) => r.hospital.status === 'pending').length;
    return UI.Shell({
      roleLabel: 'Hospital staff', active, title, subtitle, body,
      nav: [
        { key: 'incoming', label: 'Incoming patients', icon: 'ambulance', route: '#/hospital/incoming', count: n || '', hot: n > 0 },
        { key: 'beds', label: 'Bed availability', icon: 'bed', route: '#/hospital/beds' },
        { key: 'patients', label: "Today's patients", icon: 'users', route: '#/hospital/patients' },
      ],
      userName: u.name, userRole: h.name,
      notifications: Store.notificationsFor(ROLE), notifRoute: () => '#/hospital/incoming',
    });
  }

  const STAGE = { enroute: 'Ambulance on the way to patient', atPatient: 'Crew with the patient', toHospital: 'Transporting to you', atHospital: 'Arrived at your emergency entrance' };

  /* 23 – Incoming patients */
  function incomingScreen() {
    const h = myHosp(); const list = incoming(h);
    const cards = list.map((r) => {
      const a = Store.amb(r.ambulanceId); const eta = Store.hospitalEta(r);
      const pending = r.hospital.status === 'pending';
      return '<article class="inc-card inc-' + r.priority + (pending ? ' pending' : '') + '" id="inc-' + r.id + '" aria-labelledby="inc-t-' + r.id + '">' +
        '<header class="inc-head"><div><span class="section-label light">' + (pending ? 'INCOMING PATIENT – RESPONSE REQUIRED' : 'INCOMING PATIENT – ACCEPTED') + '</span><h2 id="inc-t-' + r.id + '">' + r.id + ' · ' + esc(Store.TYPES[r.type]) + '</h2></div>' + UI.Badge(r.priority, { lg: true, solid: true }) + '</header>' +
        '<div class="inc-body"><div class="inc-eta"><small>ETA</small>' + (r.status === 'atHospital' ? '<strong>Arrived</strong>' : '<strong>' + UI.Countdown(eta || Date.now(), 'mmss') + '</strong><span>at ' + Store.fmtTime(eta) + '</span>') + '</div>' +
        '<div class="inc-info">' + UI.KV([['Ambulance', esc(a.id) + ' · ' + a.type + ' · ' + esc(a.crew)], ['Stage', esc(STAGE[r.status])], ['Patients', String(r.patients)], ['Condition', esc(r.condition || '—')]]) + '</div></div>' +
        '<div class="inc-vitals">' + (r.vitals ? '<span class="section-label">Vitals from crew · ' + Store.fmtTime((r.log.filter((l) => /Vital/.test(l.text)).pop() || {}).at) + '</span><div class="vitals-grid">' + EAMS.Views.dispatcher.vitalsTiles(r.vitals) + '</div>' + (r.firstAid.length ? '<p class="muted">First aid: ' + esc(r.firstAid.join(', ')) + '</p>' : '')
          : '<p class="muted">' + UI.icon('activity', 16) + ' Waiting for vital signs from the crew…</p>') + '</div>' +
        (pending ? '<footer class="inc-foot"><div class="resp-timer"><small>Respond within</small>' + UI.Countdown(r.hospital.deadline, 'mmss', 60000) + (r.hospital.overdue ? '<span class="chip chip-red">Overdue – dispatcher alerted</span>' : '') + '</div>' +
          '<div class="btn-row">' + UI.Button({ label: 'Cannot accept (no space)', variant: 'danger-outline', action: 'decline', arg: r.id, size: 'lg' }) + UI.Button({ label: 'Accept patient', icon: 'check', action: 'accept', arg: r.id, size: 'lg', attrs: 'id="btn-accept-' + r.id + '"' }) + '</div></footer>'
          : '<footer class="inc-foot ok">' + UI.icon('checkCircle', 20) + '<span>Accepted at ' + Store.fmtTime(r.hospital.acceptedAt) + ' – emergency bed reserved. Prepare the trauma team.</span>' + UI.Button({ label: 'Release (no space)', variant: 'ghost', size: 'sm', action: 'decline', arg: r.id }) + '</footer>') +
        '</article>';
    }).join('');
    const body = '<div class="hosp-grid"><div class="stack">' + (list.length ? cards : '<div class="card">' + UI.EmptyState({ icon: 'ambulance', title: 'No incoming patients', text: 'You will be alerted here as soon as an ambulance is heading to ' + h.name + '.' }) + '</div>') + '</div>' +
      '<aside class="stack">' + bedPanel(h, true) + '</aside></div>';
    return shell('incoming', 'Incoming patients', body, esc(h.name) + ' · <span data-clock></span>');
  }

  /* 24 – Bed availability */
  function bedPanel(h, compact) {
    // Draft of the +/- values; reset when the real capacity changes elsewhere (e.g. a bed was reserved).
    let d = ui().drafts.beds;
    if (!d || d.h !== h.id || d.base !== JSON.stringify(h.beds)) d = ui().drafts.beds = { h: h.id, base: JSON.stringify(h.beds), emergency: h.beds.emergency, icu: h.beds.icu, theatre: h.beds.theatre };
    const changed = d.emergency !== h.beds.emergency || d.icu !== h.beds.icu || d.theatre !== h.beds.theatre;
    const row = (k, label, ic) => '<div class="bed-row"><span class="bed-ic">' + UI.icon(ic, 20) + '</span><div class="grow"><strong>' + label + '</strong><small>' + (h.beds[k] === 0 ? 'Full' : h.beds[k] + ' free now') + '</small></div>' +
      UI.Stepper({ label: label, value: d[k], min: 0, max: 99, action: 'bed-' + k }) + '</div>';
    return '<section class="card pad bed-panel" id="bed-panel"><div class="card-head flat"><h2>Bed availability</h2>' + (h.beds.emergency === 0 ? '<span class="chip chip-red">Full</span>' : '<span class="chip chip-green">Accepting</span>') + '</div>' +
      row('emergency', 'Emergency beds', 'bed') + row('icu', 'ICU beds', 'activity') + row('theatre', 'Operating theatre', 'heartPulse') +
      UI.Button({ label: 'Update capacity', icon: 'check', block: true, action: 'update-cap', disabled: !changed }) +
      (compact ? '' : '<p class="hint">Dispatchers see the new capacity immediately. A hospital with 0 emergency beds is greyed out for new patients.</p>') + '</section>';
  }

  /* 25 – Today's patients */
  function patients() {
    const h = myHosp();
    const list = Store.state.requests.filter((r) => !r.archived && (r.hospital.declined.includes(h.id) || (r.hospitalId === h.id && r.hospital.status)))
      .sort((a, b) => b.createdAt - a.createdAt);
    const stateOf = (r) => {
      if (r.hospital.declined.includes(h.id) && r.hospitalId !== h.id) return '<span class="chip chip-gray">Declined – rerouted</span>';
      if (['handedOver', 'closed'].includes(r.status)) return '<span class="chip chip-green">Handed over</span>';
      if (r.status === 'atHospital') return '<span class="chip chip-blue">Arrived</span>';
      return '<span class="chip chip-orange">Incoming</span>';
    };
    const body = '<div class="card">' + (list.length ? '<div class="table-wrap"><table class="table"><thead><tr><th>Request</th><th>Priority</th><th>Type</th><th>Ambulance</th><th>Accepted</th><th>Arrived</th><th>Handed over</th><th>Status</th></tr></thead><tbody>' +
      list.map((r) => '<tr><td><strong>' + r.id + '</strong></td><td>' + UI.Badge(r.priority) + '</td><td>' + esc(Store.TYPES[r.type]) + '</td><td>' + (r.ambulanceId || '—') + '</td><td>' + Store.fmtTime(r.hospital.acceptedAt) + '</td><td>' + Store.fmtTime(r.times.atHospital) + '</td><td>' + Store.fmtTime(r.times.handedOver) + '</td><td>' + stateOf(r) + '</td></tr>').join('') + '</tbody></table></div>'
      : UI.EmptyState({ icon: 'users', title: 'No patients yet today' })) + '</div>';
    return shell('patients', "Today's patients", body, esc(h.name));
  }

  function render(screen) {
    if (screen === 'login') {
      if (Store.state.sessions.hospital) return EAMS.App.redirect('#/hospital/incoming');
      const l = ui().login.hospital || {};
      return UI.LoginCard({ roleLabel: 'Hospital staff', error: l.error, locked: l.locked, username: l.username, creds: Store.state.users.filter((u) => u.role === 'hospital').map((u) => ({ username: u.username, label: Store.hosp(u.hospitalId).name })) });
    }
    if (!Store.state.sessions.hospital) return EAMS.App.redirect('#/hospital/login');
    if (screen === 'incoming') return incomingScreen();
    if (screen === 'beds') return shell('beds', 'Bed availability', '<div class="narrow">' + bedPanel(myHosp(), false) + '</div>', esc(myHosp().name));
    if (screen === 'patients') return patients();
    return EAMS.App.redirect('#/hospital/incoming');
  }
  function onEnter(screen) {
    if (screen === 'beds' || screen === 'incoming') ui().drafts.beds = null;
    if (screen === 'incoming' && Store.state.sessions.hospital) incoming(myHosp()).forEach((r) => Store.logView(ROLE, r.id));
  }

  const bedStep = (k) => (el) => { const d = ui().drafts.beds; d[k] = Math.max(0, d[k] + +el.dataset.arg); EAMS.App.render(); };
  const actions = {
    accept(el) { const res = Store.hospitalAccept(el.dataset.arg); UI.toast(res.ok ? 'Patient ' + el.dataset.arg + ' accepted – crew informed' : res.error, res.ok ? 'success' : 'error'); },
    async decline(el) {
      const id = el.dataset.arg;
      const r = await UI.askReason({ title: 'Cannot accept ' + id, text: 'The ambulance is rerouted automatically to the next nearest hospital with free beds.', options: ['No free emergency beds', 'No specialist available', 'Equipment out of order', 'Other'], confirmLabel: 'Decline patient', danger: true });
      if (r) { const res = Store.hospitalDecline(id, r.reason); UI.toast(res.ok ? id + ' declined – ambulance rerouted' : res.error, res.ok ? 'warn' : 'error'); }
    },
    'bed-emergency': bedStep('emergency'), 'bed-icu': bedStep('icu'), 'bed-theatre': bedStep('theatre'),
    'update-cap'() {
      const d = ui().drafts.beds; const res = Store.updateCapacity(d.h, { emergency: d.emergency, icu: d.icu, theatre: d.theatre });
      if (res.ok) { ui().drafts.beds = null; UI.toast('Capacity updated', 'success'); EAMS.App.render(); }
    },
  };
  return { layout: 'desktop', render, actions, onEnter };
})();
