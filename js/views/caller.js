/* CALLER mobile app – screens 1–7 */
EAMS.Views.caller = (function () {
  const { UI, Store, MapView, I18n } = EAMS;
  const t = I18n.t;
  const esc = UI.esc;
  const CALLER_ID = 'u-caller';
  const ui = () => EAMS.App.ui;
  const draft = () => (ui().drafts.req = ui().drafts.req || freshDraft());
  function freshDraft() {
    const gps = Store.PLACES[0];
    return { type: '', condition: '', patients: 1, location: { name: gps.name, detail: 'Kigali, Rwanda', x: gps.x, y: gps.y, source: 'gps', district: gps.district }, errors: {} };
  }
  const myRequests = () => Store.state.requests.filter((r) => r.callerId === CALLER_ID).sort((a, b) => b.createdAt - a.createdAt);
  const activeMine = () => myRequests().find((r) => !['closed', 'false'].includes(r.status));
  const tracking = (r) => ['enroute', 'atPatient', 'toHospital'].includes(r.status);

  function nav(active) {
    return UI.BottomNav([
      { key: 'home', label: t('navHome'), icon: 'home', route: '#/caller/home' },
      { key: 'history', label: t('navHistory'), icon: 'history', route: '#/caller/history' },
      { key: 'profile', label: t('navProfile'), icon: 'user', route: '#/caller/profile' },
    ], active);
  }
  const langToggle = () => {
    const l = Store.state.callerProfile.lang;
    return '<div class="lang-toggle" role="group" aria-label="Language">' +
      '<button class="' + (l === 'en' ? 'on' : '') + '" data-action="lang" data-arg="en" aria-pressed="' + (l === 'en') + '">EN</button>' +
      '<button class="' + (l === 'rw' ? 'on' : '') + '" data-action="lang" data-arg="rw" aria-pressed="' + (l === 'rw') + '">RW</button></div>';
  };

  /* 1 – Home */
  function home() {
    const act = activeMine();
    return UI.Header({ left: '<div class="brand-inline">' + UI.Logo(34) + '<strong>EAMS</strong></div>', right: langToggle() + UI.IconButton({ icon: 'help', label: t('help'), action: 'help' }) }) +
      '<div class="m-body" data-keep-scroll="c-home">' +
      (act ? '<a class="active-banner" href="#/caller/status/' + act.id + '">' + UI.icon('siren', 20) + '<span><strong>' + t('activeRequest') + ' ' + act.id + '</strong><small>' + esc(statusText(act)) + '</small></span>' + UI.icon('chevronRight', 18) + '</a>' : '') +
      '<div class="sos-wrap"><button class="sos-btn" data-action="go-request" id="sos-btn"><span class="sos-halo" aria-hidden="true"></span>' + UI.icon('ambulance', 54) + '<span class="sos-label">' + t('requestAmbulance') + '</span></button>' +
      '<a class="call-link" href="tel:912">' + UI.icon('phone', 18) + t('orCall') + '</a>' +
      '<p class="hint center">' + t('homeHint') + '</p></div>' +
      '<div class="info-grid">' +
      '<div class="info-card">' + UI.icon('globe', 22) + '<span><small>' + t('coverage') + '</small><strong>' + t('nationwide') + '</strong></span></div>' +
      '<div class="info-card">' + UI.icon('clock', 22) + '<span><small>' + t('avgArrival') + '</small><strong>' + t('avgArrivalVal') + '</strong></span></div></div>' +
      '</div>' + nav('home');
  }

  /* 2 – Request form (3 steps on one screen) */
  function request() {
    const d = draft();
    const types = [['accident', 'car'], ['medical', 'heartPulse'], ['maternity', 'baby'], ['other', 'more']];
    const loc = d.location;
    return UI.Header({ back: '#/caller/home', title: t('requestTitle') }) +
      '<div class="m-body" data-keep-scroll="c-req">' +
      '<section class="form-step"><h2 class="step-title"><span class="step-n">1</span>' + t('stepType') + ' <span class="req" aria-hidden="true">*</span></h2>' +
      '<div class="type-grid" role="radiogroup" aria-label="' + t('stepType') + '">' + types.map((ty) =>
        '<button type="button" role="radio" aria-checked="' + (d.type === ty[0]) + '" class="type-card' + (d.type === ty[0] ? ' on' : '') + '" data-action="pick-type" data-arg="' + ty[0] + '">' +
        '<span class="type-ic">' + UI.icon(ty[1], 26) + '</span>' + t(ty[0]) + (d.type === ty[0] ? '<span class="type-check">' + UI.icon('check', 14) + '</span>' : '') + '</button>').join('') + '</div>' +
      (d.errors.type ? '<p class="error" role="alert">' + t('errType') + '</p>' : '') + '</section>' +
      '<section class="form-step"><h2 class="step-title"><span class="step-n">2</span>' + t('stepPatient') + '</h2>' +
      UI.Field({ id: 'c-cond', label: t('condition'), input: '<textarea id="c-cond" rows="3" data-model="req.condition" placeholder="' + t('conditionPh') + '">' + esc(d.condition) + '</textarea>' }) +
      '<div class="row-between"><span class="label-like" id="pat-lbl">' + t('patients') + '</span>' + UI.Stepper({ label: t('patients'), value: d.patients, min: 1, max: 20, action: 'patients' }) + '</div></section>' +
      '<section class="form-step"><h2 class="step-title"><span class="step-n">3</span>' + t('stepLocation') + ' <span class="req" aria-hidden="true">*</span></h2>' +
      '<div class="loc-card' + (d.errors.location ? ' invalid' : '') + '">' +
      (loc ? '<div class="loc-map">' + MapView.render({ focus: [loc], minSpan: 18, markerScale: 2.2, pickup: loc, label: 'Pickup location map preview' }) + '</div>' : '<div class="loc-map loc-empty">' + UI.icon('pin', 28) + '</div>') +
      '<div class="loc-row">' + UI.icon('pin', 22, 'red') + '<div class="grow"><strong>' + (loc ? esc(loc.name) : '—') + '</strong><small>' + (loc ? esc(loc.detail) + (loc.source === 'gps' ? ' (' + t('currentGps') + ')' : '') : t('errLocation')) + '</small></div>' +
      UI.Button({ label: t('edit'), icon: 'pencil', variant: 'secondary', size: 'sm', action: 'edit-loc' }) + '</div></div>' +
      (d.errors.location ? '<p class="error" role="alert">' + t('errLocation') + '</p>' : '') + '</section>' +
      '</div><div class="m-footer">' + UI.Button({ label: t('sendRequest'), icon: 'send', action: 'send', block: true, size: 'lg', attrs: 'id="send-btn"' }) + '</div>';
  }

  function statusText(r) {
    if (r.status === 'received') return t('st_verification');
    if (r.status === 'waiting') return t('allBusy');
    if (['verified', 'offered'].includes(r.status)) return t('st_assigned') + '…';
    if (tracking(r)) return t('st_onway');
    return t('st_arrived');
  }
  function steps(r) {
    const T = r.times; const st = r.status;
    let cur = 5;
    if (st === 'received') cur = 1;
    else if (['verified', 'waiting', 'offered'].includes(st)) cur = 2;
    else if (tracking(r)) cur = 3;
    const state = (i) => (i < cur ? 'done' : i === cur ? (st === 'waiting' && i === 2 ? 'warn' : 'current') : 'todo');
    const amb = r.ambulanceId;
    const h = Store.hosp(r.hospitalId);
    const notes = [null, null, null, null, null];
    if (st === 'offered') notes[2] = esc(t('ambulanceAssignedTo', { a: amb })) + ' …';
    if (st === 'waiting') notes[2] = esc(t('allBusy'));
    if (cur > 2 && amb) notes[2] = esc(amb);
    if (st === 'enroute') notes[3] = 'ETA ' + UI.Countdown(Store.amb(amb).trip ? Store.amb(amb).trip.end : Date.now(), 'mmss');
    if (st === 'atPatient') notes[3] = esc(t('atPatient'));
    if (st === 'toHospital' && h) notes[3] = esc(t('goingTo', { h: h.name }));
    if (cur > 4 && h) notes[4] = esc(h.name);
    return [
      { label: t('st_received'), time: Store.fmtTime(T.received), state: 'done', note: notes[0] },
      { label: t('st_verification'), time: T.verified ? Store.fmtTime(T.verified) : '', state: state(1), note: notes[1] },
      { label: t('st_assigned'), time: T.accepted ? Store.fmtTime(T.accepted) : '', state: state(2), note: notes[2] },
      { label: t('st_onway'), time: T.accepted && cur >= 3 ? Store.fmtTime(T.accepted) : '', state: state(3), note: notes[3] },
      { label: t('st_arrived'), time: T.atHospital ? Store.fmtTime(T.atHospital) : '', state: state(4), note: notes[4] },
    ];
  }

  /* 3 – Request received / live status */
  function status(id) {
    const r = Store.get(id);
    if (!r || r.callerId !== CALLER_ID) return UI.Header({ back: '#/caller/home', title: 'EAMS' }) + '<div class="m-body">' + UI.EmptyState({ icon: 'search', title: 'Request not found' }) + '</div>';
    const pos = r.status === 'waiting' ? Store.waitingPosition(r.id) : null;
    const done = ['handedOver', 'closed'].includes(r.status);
    return UI.Header({ back: '#/caller/home', left: '<span class="hdr-check">' + UI.icon('check', 18) + '</span>', title: r.status === 'false' ? r.id : t('requestSent') }) +
      '<div class="m-body" data-keep-scroll="c-status">' +
      '<section class="incident-card"><div class="row-between"><span class="label-on-green">' + t('incidentId') + '</span>' + UI.Badge(r.priority, { solid: true }) + '</div>' +
      '<div class="incident-id">' + esc(r.id) + '</div>' +
      '<div class="incident-meta">' + UI.icon(UI.typeIcon(r.type), 16) + ' ' + esc(t(r.type)) + ' · ' + esc(t('patientsN', { n: r.patients })) + '</div>' +
      '<div class="incident-meta">' + UI.icon('pin', 16) + ' ' + esc(r.location.name) + ' · ' + Store.fmtTime(r.createdAt) + '</div></section>' +
      (pos ? '<div class="alert alert-orange waiting-card" role="status" id="waiting-card">' + UI.icon('hourglass', 22) + '<div><strong>' + t('allBusy') + ' – ' + (Store.state.callerProfile.lang === 'rw' ? 'uri uwa ' + pos : 'you are number ' + pos) + '</strong><p>' + esc(t('waitingPos', { n: pos })) + '</p></div></div>' : '') +
      (r.status === 'false' ? '<div class="alert alert-gray">' + UI.icon('info', 20) + '<span>' + t('falseCall') + '</span></div>' : '') +
      (r.status !== 'false' ? '<div class="card pad">' + UI.Timeline(steps(r)) + '</div>' : '') +
      '</div><div class="m-footer stack-sm">' +
      (done ? UI.Button({ label: t('handedOverAt', { h: (Store.hosp(r.hospitalId) || {}).short || '' }), icon: 'checkCircle', block: true, size: 'lg', action: 'nav', arg: '#/caller/arrival/' + r.id })
        : UI.Button({ label: t('trackAmbulance'), icon: 'navigation', block: true, size: 'lg', action: 'nav', arg: '#/caller/track/' + r.id, disabled: !tracking(r), attrs: 'id="track-btn"', title: tracking(r) ? '' : t('notTracked') })) +
      '<a class="btn btn-ghost btn-block" href="tel:912">' + UI.icon('phone', 18) + '<span>' + t('emergencyLine') + '</span></a></div>';
  }

  /* 4 – Track ambulance */
  function track(id) {
    const r = Store.get(id);
    if (!r || r.callerId !== CALLER_ID) return EAMS.App.redirect('#/caller/home');
    if (['handedOver', 'closed', 'atHospital'].includes(r.status)) return EAMS.App.redirect('#/caller/arrival/' + id);
    const a = Store.amb(r.ambulanceId);
    const h = Store.hosp(r.hospitalId);
    if (!a || !tracking(r)) {
      return UI.Header({ back: '#/caller/status/' + id, title: t('onTheWayTitle') }) + '<div class="m-body">' + UI.EmptyState({ icon: 'ambulance', title: t('notTracked') }) + '</div>';
    }
    const toHosp = r.status === 'toHospital';
    const dest = toHosp ? h : r.location;
    const pos = Store.ambPos(a);
    const mapHtml = MapView.render({
      focus: [pos, dest, a.trip ? a.trip.route[0] : pos], pad: 6, ambulances: [a], highlightAmb: a.id,
      route: a.trip ? { points: a.trip.route } : null, dest: { x: dest.x, y: dest.y }, hospitals: toHosp ? [h] : [], label: 'Live ambulance position',
    });
    const hospState = r.hospital.status === 'accepted' ? 'Hospital is ready' : t('hospNotified');
    return '<div class="track-screen">' +
      UI.Header({ back: '#/caller/status/' + id, title: t('onTheWayTitle') }) +
      '<div class="track-map" id="track-map">' + mapHtml + '</div>' +
      '<section class="sheet" aria-label="Ambulance details"><span class="sheet-grip" aria-hidden="true"></span>' +
      '<div class="row-between"><div class="amb-head"><span class="amb-ic">' + UI.icon('ambulance', 24) + '</span><div><strong>' + t('ambulance') + ' ' + esc(a.id) + '</strong>' +
      (r.status === 'atPatient' ? '<small>' + t('atPatient') + '</small>'
        : '<small><span data-trip-km=\'' + JSON.stringify({ km: a.trip.km, s: a.trip.start, e: a.trip.end }) + '\'>' + a.trip.km + '</span> km · ' + (toHosp ? t('toHospital') : (Store.state.callerProfile.lang === 'rw' ? 'izagera ' : 'arriving ') + Store.fmtTime12(a.trip.end)) + '</small>') + '</div></div>' +
      (a.trip ? '<span class="eta-badge" id="eta-badge"><small>ETA</small>' + UI.Countdown(a.trip.end, 'mmss') + '</span>' : '<span class="eta-badge done">' + UI.icon('check', 16) + '</span>') + '</div>' +
      '<div class="sheet-row">' + UI.icon('hospital', 20, 'green') + '<div><strong>' + esc(t('goingTo', { h: h ? h.name : '—' })) + '</strong><small>' + esc(hospState) + '</small></div></div>' +
      '<div class="sheet-row">' + UI.icon('pin', 20, 'red') + '<div><strong>' + t('pickup') + '</strong><small>' + esc(r.location.name) + '</small></div></div>' +
      '<div class="btn-row">' + UI.Button({ label: t('callCrew'), icon: 'phone', variant: 'secondary', action: 'call', arg: 'crew of ' + a.id }) +
      UI.Button({ label: t('call912'), icon: 'phone', variant: 'danger', action: 'call', arg: '912' }) + '</div></section></div>';
  }

  /* 5 – Arrival / handover */
  function arrival(id) {
    const r = Store.get(id);
    if (!r || r.callerId !== CALLER_ID) return EAMS.App.redirect('#/caller/home');
    const h = Store.hosp(r.hospitalId);
    const T = r.times;
    const done = ['handedOver', 'closed'].includes(r.status);
    const rows = [[t('t_sent'), T.received], [t('t_assigned'), T.accepted], [t('t_atPatient'), T.atPatient], [t('t_atHospital'), T.atHospital], [t('t_handover'), T.handedOver]];
    return UI.Header({ back: '#/caller/status/' + id, title: r.id }) +
      '<div class="m-body center-col" data-keep-scroll="c-arr">' +
      '<span class="big-check' + (done ? '' : ' pending') + '">' + UI.icon(done ? 'check' : 'hospital', 44) + '</span>' +
      '<h2 class="m-h2">' + esc(done ? t('handedOverAt', { h: h ? h.name : '' }) : t('st_arrived') + ' – ' + (h ? h.name : '')) + '</h2>' +
      '<p class="muted center">' + esc(Store.state.callerProfile.contactName) + ' · SMS ✓</p>' +
      '<div class="card pad full"><h3 class="section-label">' + t('times') + '</h3><dl class="kv kv-times">' + rows.map((x) => '<div><dt>' + esc(x[0]) + '</dt><dd>' + Store.fmtTime(x[1]) + '</dd></div>').join('') +
      '<div class="kv-total"><dt>' + t('totalResponse') + '</dt><dd>' + UI.durMin(T.atPatient - T.received) + '</dd></div></dl></div>' +
      '</div><div class="m-footer">' + UI.Button({ label: t('backHome'), icon: 'home', block: true, size: 'lg', action: 'nav', arg: '#/caller/home' }) + '</div>';
  }

  /* 6 – History */
  function history() {
    const list = myRequests();
    const chip = (r) => r.status === 'closed' ? '<span class="chip chip-gray">' + t('status_closed') + '</span>' : r.status === 'false' ? '<span class="chip chip-gray">' + t('status_false') + '</span>' : r.status === 'waiting' ? '<span class="chip chip-orange">' + t('status_waiting') + '</span>' : r.status === 'handedOver' ? '<span class="chip chip-green">' + t('t_handover') + '</span>' : '<span class="chip chip-orange">' + t('status_active') + '</span>';
    return UI.Header({ title: t('historyTitle') }) + '<div class="m-body" data-keep-scroll="c-hist">' +
      (list.length ? '<ul class="list-cards">' + list.map((r) => '<li><a class="hist-item" href="#/caller/status/' + r.id + '"><span class="type-ic sm">' + UI.icon(UI.typeIcon(r.type), 20) + '</span>' +
        '<span class="grow"><strong>' + esc(t(r.type)) + ' · ' + r.id + '</strong><small>' + Store.fmtDate(r.createdAt) + ' ' + Store.fmtTime(r.createdAt) + ' · ' + esc(r.location.name) + '</small></span>' + chip(r) + '</a></li>').join('') + '</ul>'
        : UI.EmptyState({ icon: 'history', title: t('noHistory') })) +
      '</div>' + nav('history');
  }

  /* 7 – Profile */
  function profile() {
    const p = Store.state.callerProfile;
    return UI.Header({ title: t('profileTitle'), right: langToggle() }) + '<div class="m-body" data-keep-scroll="c-prof">' +
      '<div class="profile-head"><span class="avatar lg">' + UI.initials(p.name) + '</span><div><strong>' + esc(p.name) + '</strong><small>' + esc(p.phone) + '</small></div></div>' +
      '<form class="card pad stack" data-submit="save-profile">' +
      UI.Field({ id: 'p-name', label: t('name'), input: '<input id="p-name" name="name" value="' + esc(p.name) + '" autocomplete="name">' }) +
      UI.Field({ id: 'p-phone', label: t('phoneLbl'), input: '<input id="p-phone" name="phone" type="tel" value="' + esc(p.phone) + '" autocomplete="tel">' }) +
      UI.Field({ id: 'p-lang', label: t('language'), input: '<select id="p-lang" name="lang"><option value="en"' + (p.lang === 'en' ? ' selected' : '') + '>English</option><option value="rw"' + (p.lang === 'rw' ? ' selected' : '') + '>Kinyarwanda</option></select>' }) +
      '<h3 class="section-label">' + t('emergencyContact') + '</h3>' +
      UI.Field({ id: 'p-cname', label: t('name'), input: '<input id="p-cname" name="contactName" value="' + esc(p.contactName) + '">' }) +
      UI.Field({ id: 'p-cphone', label: t('phoneLbl'), hint: t('contactNote'), input: '<input id="p-cphone" name="contactPhone" type="tel" value="' + esc(p.contactPhone) + '">' }) +
      UI.Button({ label: t('save'), type: 'submit', block: true }) + '</form>' +
      '<div class="alert alert-green">' + UI.icon('message', 22) + '<div><strong>' + t('offlineTitle') + '</strong><p>' + t('offlineNote') + '</p></div></div>' +
      '</div>' + nav('profile');
  }

  function render(screen, param) {
    switch (screen) {
      case 'home': return home();
      case 'request': return request();
      case 'status': return status(param);
      case 'track': return track(param);
      case 'arrival': return arrival(param);
      case 'history': return history();
      case 'profile': return profile();
      default: return EAMS.App.redirect('#/caller/home');
    }
  }

  const actions = {
    lang(el) { Store.updateCallerProfile({ lang: el.dataset.arg }); },
    help() { UI.modal({ title: t('help'), body: '<p>' + t('helpText') + '</p>', actions: [{ label: 'OK', value: 'ok' }] }); },
    'go-request'() { ui().drafts.req = freshDraft(); EAMS.App.navigate('#/caller/request'); },
    'pick-type'(el) { const d = draft(); d.type = el.dataset.arg; d.errors.type = false; EAMS.App.render(); },
    patients(el) { const d = draft(); d.patients = Math.min(20, Math.max(1, d.patients + +el.dataset.arg)); EAMS.App.render(); },
    async 'edit-loc'() {
      const d = draft();
      const v = await UI.modal({
        title: t('editLocation'),
        body: UI.Field({ id: 'loc-input', label: t('address'), hint: 'e.g. KG 7 Ave, Remera', input: '<input id="loc-input" list="places" value="' + esc(d.location && d.location.source === 'manual' ? d.location.name : '') + '" placeholder="Street, area or landmark">' }) +
          '<datalist id="places">' + Store.PLACES.map((p) => '<option value="' + esc(p.name) + '">').join('') + '</datalist>',
        actions: [{ label: t('useGps'), variant: 'secondary', value: 'gps' }, { label: t('save'), value: 'save' }],
        onAction(val, root) { d._typed = root.querySelector('#loc-input').value.trim(); return true; },
      });
      if (v === 'gps') { d.location = freshDraft().location; }
      else if (v === 'save') { d.location = d._typed ? Store.geocode(d._typed) : null; }
      d.errors.location = false;
      EAMS.App.render();
    },
    send() {
      const d = draft();
      d.errors = { type: !d.type, location: !d.location };
      if (d.errors.type || d.errors.location) { EAMS.App.render(); UI.toast(d.errors.type ? t('errType') : t('errLocation'), 'error'); return; }
      const p = Store.state.callerProfile;
      const res = Store.createRequest({ type: d.type, condition: d.condition.trim(), patients: d.patients, location: d.location, callerId: CALLER_ID, callerPhone: p.phone, callerName: p.name, channel: 'app' }, 'caller');
      ui().drafts.req = null;
      UI.toast(t('requestSent') + ' – ' + res.id, 'success');
      EAMS.App.navigate('#/caller/status/' + res.id);
    },
    call(el) { UI.toast('Calling ' + el.dataset.arg + '… (simulated)', 'info'); },
    'save-profile'(form) {
      const fd = new FormData(form);
      Store.updateCallerProfile({ name: fd.get('name'), phone: fd.get('phone'), lang: fd.get('lang'), contactName: fd.get('contactName'), contactPhone: fd.get('contactPhone') });
      UI.toast(t('save') + ' ✓', 'success');
    },
  };

  return { layout: 'phone', render, actions };
})();
