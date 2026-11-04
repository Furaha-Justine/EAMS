/* EAMS shared store
 * ------------------------------------------------------------------
 * One in-memory state object shared by every role, persisted to
 * localStorage and synced between browser tabs. Every business rule
 * of the system lives here, so the views stay thin:
 *   - verify before assign, Critical first, nearest available suggested
 *   - one ambulance ↔ one emergency, out-of-service units never offered
 *   - 60 s crew acceptance window, then the next nearest unit is offered
 *   - waiting list when no unit is free (with caller position)
 *   - nearest hospital with free beds; hospitals can decline → reroute
 *   - only the crew hands over; only then the dispatcher closes the case
 *   - every change is written to the case log and the audit log
 */
EAMS.Store = (function () {
  const KEY = 'eams-state-v1';
  const MIN = 60 * 1000;
  const OFFER_MS = 60 * 1000;          // crew must accept within 60 s
  const HOSPITAL_MS = 3 * MIN;         // hospital must answer within 3 min
  const SPEED_KMH = 27;                // average urban ambulance speed
  const ROAD_FACTOR = 1.78;            // road distance vs straight line
  const KM_PER_UNIT = 0.1;             // map grid: 100 units = 10 km
  const RANK = { critical: 0, urgent: 1, normal: 2 };
  const ACTIVE = ['received', 'verified', 'waiting', 'offered', 'enroute', 'atPatient', 'toHospital', 'atHospital', 'handedOver'];

  /* Known places in Kigali on the 0–100 map grid */
  const PLACES = [
    { name: 'Kimihurura, Gasabo', district: 'Gasabo', x: 55, y: 45 },
    { name: 'Nyamirambo, Nyarugenge', district: 'Nyarugenge', x: 22, y: 58 },
    { name: 'Remera, Gasabo', district: 'Gasabo', x: 74, y: 42 },
    { name: 'Kicukiro Centre, Kicukiro', district: 'Kicukiro', x: 62, y: 74 },
    { name: 'Kacyiru, Gasabo', district: 'Gasabo', x: 52, y: 32 },
    { name: 'City Centre, Nyarugenge', district: 'Nyarugenge', x: 38, y: 40 },
    { name: 'Gikondo, Kicukiro', district: 'Kicukiro', x: 46, y: 62 },
    { name: 'Kimironko, Gasabo', district: 'Gasabo', x: 84, y: 30 },
    { name: 'Gisozi, Gasabo', district: 'Gasabo', x: 40, y: 20 },
    { name: 'Kanombe, Kicukiro', district: 'Kicukiro', x: 90, y: 58 },
    { name: 'Nyabugogo, Nyarugenge', district: 'Nyarugenge', x: 24, y: 32 },
    { name: 'Kagarama, Kicukiro', district: 'Kicukiro', x: 54, y: 84 },
    { name: 'Nyarutarama, Gasabo', district: 'Gasabo', x: 66, y: 20 },
  ];

  const TYPES = {
    accident: 'Road accident', medical: 'Medical', maternity: 'Maternity',
    breathing: 'Breathing problem', fall: 'Fall', other: 'Other',
  };

  let state = null;
  const listeners = new Set();
  const now = () => Date.now();

  /* ---------- geometry & routing ---------- */
  const distKm = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) * KM_PER_UNIT;
  const roadKm = (a, b) => distKm(a, b) * ROAD_FACTOR;
  const etaMin = (km) => Math.max(1, Math.round((km * ROAD_FACTOR) / SPEED_KMH * 60));

  /** Street-like route: vertical, horizontal, vertical (follows the grid). */
  function streetRoute(a, b) {
    const m = (a.y + b.y) / 2;
    return [{ x: a.x, y: a.y }, { x: a.x, y: m }, { x: b.x, y: m }, { x: b.x, y: b.y }];
  }
  function makeTrip(from, to, t = now()) {
    const km = roadKm(from, to);
    const mins = etaMin(distKm(from, to));
    return { route: streetRoute(from, to), start: t, end: t + mins * MIN, km: +km.toFixed(1), to: { x: to.x, y: to.y } };
  }
  /** Position along a trip polyline at time t. */
  function pointAlong(trip, t = now()) {
    const f = Math.min(1, Math.max(0, (t - trip.start) / Math.max(1, trip.end - trip.start)));
    const pts = trip.route;
    const lens = [];
    let total = 0;
    for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); lens.push(l); total += l; }
    let d = f * total;
    for (let i = 1; i < pts.length; i++) {
      if (d <= lens[i - 1] || i === pts.length - 1) {
        const k = lens[i - 1] ? Math.min(1, d / lens[i - 1]) : 1;
        return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * k, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * k, f };
      }
      d -= lens[i - 1];
    }
    return { x: pts[pts.length - 1].x, y: pts[pts.length - 1].y, f: 1 };
  }
  function ambPos(a, t = now()) { return a.trip ? pointAlong(a.trip, t) : { x: a.x, y: a.y }; }
  /** Freeze a moving ambulance where it currently is. */
  function park(a, at) { const p = at || ambPos(a); a.x = +p.x.toFixed(2); a.y = +p.y.toFixed(2); a.trip = null; }
  function nearestPlace(p) {
    return PLACES.slice().sort((a, b) => distKm(a, p) - distKm(b, p))[0];
  }
  /** Match a typed address to a known place (falls back to a point near the centre). */
  function geocode(text) {
    const q = text.toLowerCase();
    const p = PLACES.find((pl) => q.includes(pl.name.split(',')[0].toLowerCase()));
    if (p) return { name: text, detail: 'Kigali, Rwanda', x: p.x, y: p.y, district: p.district, source: 'manual' };
    const c = { x: 45 + Math.random() * 20, y: 40 + Math.random() * 20 };
    const n = nearestPlace(c);
    return { name: text, detail: 'near ' + n.name.split(',')[0] + ', Kigali', x: +c.x.toFixed(1), y: +c.y.toFixed(1), district: n.district, source: 'manual' };
  }

  /* ---------- seed data ---------- */
  function rng(seed) { return function () { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const reqId = (n) => 'EMR-' + String(n).padStart(4, '0');

  function blankRequest(fields) {
    return Object.assign({
      id: '', type: 'other', priority: 'normal', patients: 1, condition: '',
      location: null, callerPhone: '', callerName: '', callerId: null, channel: 'app',
      status: 'received', createdAt: now(), times: {}, ambulanceId: null, offer: null,
      hospitalId: null, hospital: { status: null, deadline: null, declined: [], reroutedFrom: null, overdue: false },
      vitals: null, firstAid: [], notes: '', log: [], autoAssign: false, archived: false, falseReason: '',
    }, fields);
  }

  function seed(opts = {}) {
    const t = now();
    const ten44 = new Date(); ten44.setHours(10, 44, 0, 0);
    const place = (name) => Object.assign({ detail: 'Kigali, Rwanda', source: 'gps' }, PLACES.find((p) => p.name.startsWith(name)));
    const s = {
      version: 1,
      clockOffset: ten44.getTime() - t,   // demo clock starts at 10:44 AM
      seq: 428, nextId: 1,
      requests: [],
      ambulances: [
        { id: 'A-03', type: 'ALS', status: 'available', x: 66, y: 30.8, base: 'Kacyiru station', crew: 'Jean Habimana, Eric Nshuti', requestId: null, trip: null, disabled: false, plate: 'RAC 403 E' },
        { id: 'A-07', type: 'BLS', status: 'busy', x: 37, y: 48.5, base: 'CHUK', crew: 'Alice Mukeshimana, Yves Ganza', requestId: null, trip: null, disabled: false, job: 'Inter-hospital transfer', plate: 'RAC 407 E' },
        { id: 'A-09', type: 'ALS', status: 'available', x: 85, y: 73, base: 'Kanombe station', crew: 'Diane Uwera, Patrick Mugisha', requestId: null, trip: null, disabled: false, plate: 'RAC 409 E' },
        { id: 'A-12', type: 'BLS', status: 'enroute', x: 28, y: 60, base: 'Nyamirambo station', crew: 'Olivier Hakizimana, Sandrine Iradukunda', requestId: null, trip: null, disabled: false, job: 'Patient pickup (Gikondo)', sim: true, plate: 'RAC 412 E' },
        { id: 'A-15', type: 'BLS', status: 'available', x: 37, y: 63.8, base: 'Gikondo station', crew: 'Moses Niyonzima, Ange Umutoni', requestId: null, trip: null, disabled: false, plate: 'RAC 415 E' },
        { id: 'A-20', type: 'BLS', status: 'out', x: 50, y: 88, base: 'Central garage', crew: '—', requestId: null, trip: null, disabled: false, job: 'Maintenance', plate: 'RAC 420 E' },
      ],
      hospitals: [
        { id: 'chuk', name: 'CHUK Emergency', short: 'CHUK', district: 'Nyarugenge', x: 36, y: 46, beds: { emergency: 3, icu: 1, theatre: 1 }, emergencyCare: true, disabled: false, phone: '0788 300 100' },
        { id: 'kfh', name: 'King Faisal Hospital', short: 'KFH', district: 'Gasabo', x: 64, y: 21, beds: { emergency: 2, icu: 1, theatre: 2 }, emergencyCare: true, disabled: false, phone: '0788 300 200' },
        { id: 'kib', name: 'Kibagabaga Hospital', short: 'Kibagabaga', district: 'Gasabo', x: 76, y: 18, beds: { emergency: 0, icu: 0, theatre: 1 }, emergencyCare: true, disabled: false, phone: '0788 300 300' },
        { id: 'mas', name: 'Masaka Hospital', short: 'Masaka', district: 'Kicukiro', x: 92, y: 84, beds: { emergency: 4, icu: 1, theatre: 1 }, emergencyCare: true, disabled: false, phone: '0788 300 400' },
      ],
      users: [
        { id: 'u-disp', name: 'Grace Mukamana', username: 'dispatcher', password: 'demo123', role: 'dispatcher', phone: '078x xxx 501', disabled: false, failed: 0, locked: false },
        { id: 'u-crew1', name: 'Jean Habimana, Eric Nshuti', username: 'crew.a03', password: 'demo123', role: 'crew', ambulanceId: 'A-03', phone: '078x xxx 603', disabled: false, failed: 0, locked: false },
        { id: 'u-crew2', name: 'Diane Uwera, Patrick Mugisha', username: 'crew.a09', password: 'demo123', role: 'crew', ambulanceId: 'A-09', phone: '078x xxx 609', disabled: false, failed: 0, locked: false },
        { id: 'u-n-chuk', name: 'Claudine Ingabire', username: 'nurse.chuk', password: 'demo123', role: 'hospital', hospitalId: 'chuk', phone: '078x xxx 701', disabled: false, failed: 0, locked: false },
        { id: 'u-n-kfh', name: 'Samuel Kayitare', username: 'nurse.kfh', password: 'demo123', role: 'hospital', hospitalId: 'kfh', phone: '078x xxx 702', disabled: false, failed: 0, locked: false },
        { id: 'u-n-kib', name: 'Josiane Uwimana', username: 'nurse.kib', password: 'demo123', role: 'hospital', hospitalId: 'kib', phone: '078x xxx 703', disabled: false, failed: 0, locked: false },
        { id: 'u-n-mas', name: 'Emmanuel Bizimana', username: 'nurse.mas', password: 'demo123', role: 'hospital', hospitalId: 'mas', phone: '078x xxx 704', disabled: false, failed: 0, locked: false },
        { id: 'u-admin', name: 'Eric Ndayisaba', username: 'admin', password: 'demo123', role: 'admin', phone: '078x xxx 900', disabled: false, failed: 0, locked: false },
      ],
      callerProfile: { id: 'u-caller', name: 'Aline Uwase', phone: '078x xxx 123', lang: 'en', contactName: 'Didier Uwase (brother)', contactPhone: '078x xxx 456' },
      audit: [], notifications: [],
      sessions: { dispatcher: null, hospital: null, admin: null, crew: null },
    };

    // A-12 is driving a simulated job so the live map has motion.
    const a12 = s.ambulances.find((a) => a.id === 'A-12');
    a12.trip = makeTrip({ x: 28, y: 60 }, { x: 46, y: 62 }, t);

    // Historical (archived) cases – feed History, Reports and the waiting-time KPIs.
    const r = rng(6);
    const units = ['A-03', 'A-07', 'A-09', 'A-12', 'A-15', 'A-20'];
    const types = ['accident', 'medical', 'maternity', 'breathing', 'fall', 'medical', 'accident'];
    const hosp = ['chuk', 'kfh', 'mas', 'chuk', 'kib'];
    let n = 376;
    for (let week = 8; week >= 1; week--) {
      const perWeek = 4 + Math.floor(r() * 4);
      for (let i = 0; i < perWeek && n < 424; i++) {
        const p = PLACES[Math.floor(r() * PLACES.length)];
        const created = t - week * 7 * 24 * 60 * MIN + Math.floor(r() * 6 * 24 * 60) * MIN;
        const resp = (8 + week * 0.55 + r() * 4) * MIN; // response improves week by week
        const amb = units[Math.floor(r() * units.length)];
        const pr = ['critical', 'urgent', 'normal'][Math.floor(r() * 3)];
        s.requests.push(blankRequest({
          id: reqId(n++), type: types[Math.floor(r() * types.length)], priority: pr, patients: 1 + Math.floor(r() * 2),
          location: Object.assign({ detail: 'Kigali, Rwanda', source: 'gps' }, p), status: 'closed', archived: true,
          createdAt: created, ambulanceId: amb, hospitalId: hosp[Math.floor(r() * hosp.length)],
          times: { received: created, verified: created + MIN, accepted: created + 2 * MIN, atPatient: created + resp, toHospital: created + resp + 8 * MIN, atHospital: created + resp + 20 * MIN, handedOver: created + resp + 25 * MIN, closed: created + resp + 30 * MIN },
          callerPhone: '078x xxx ' + (100 + Math.floor(r() * 899)),
        }));
      }
    }
    // Two of those belong to our demo caller (History screen).
    const mine = s.requests.filter((q) => q.archived).slice(-9);
    [mine[0], mine[5]].forEach((q) => { if (q) { q.callerId = 'u-caller'; q.callerPhone = s.callerProfile.phone; q.callerName = s.callerProfile.name; } });

    // Today's live requests.
    const live = [
      { id: 'EMR-0424', type: 'fall', priority: 'normal', patients: 1, condition: 'Elderly woman fell at home, pain in the hip, conscious.', location: place('Kicukiro'), callerPhone: '078x xxx 288', channel: 'phone', createdAt: t - 11 * MIN },
      { id: 'EMR-0425', type: 'breathing', priority: 'urgent', patients: 1, condition: 'Man, 60, short of breath, known asthma, inhaler not helping.', location: place('Remera'), callerPhone: '078x xxx 732', channel: 'app', createdAt: t - 7 * MIN },
      { id: 'EMR-0426', type: 'maternity', priority: 'urgent', patients: 1, condition: 'Woman in labour, contractions every 3 minutes, first baby.', location: place('Nyamirambo'), callerPhone: '078x xxx 914', channel: 'sms', createdAt: t - 5 * MIN },
    ];
    if (!opts.withoutActive) {
      live.push({ id: 'EMR-0427', type: 'accident', priority: 'critical', patients: 2, condition: 'Severe impact, one patient unconscious, second patient with a broken leg.', location: place('Kimihurura'), callerPhone: '078x xxx 123', callerId: 'u-caller', callerName: 'Aline Uwase', channel: 'app', createdAt: t - 2 * MIN });
    } else {
      s.seq = 427;
    }
    live.forEach((l) => {
      const q = blankRequest(Object.assign(l, { times: { received: l.createdAt } }));
      q.log.push({ at: l.createdAt, by: l.channel === 'phone' ? 'Grace Mukamana' : 'Caller', role: l.channel === 'phone' ? 'dispatcher' : 'caller', text: 'Request created via ' + channelLabel(l.channel) });
      s.requests.push(q);
    });
    s.audit.push({ id: 1, at: t, user: 'EAMS system', role: 'system', action: 'Demo data loaded', record: '—' });
    return s;
  }

  /* ---------- persistence ---------- */
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { const s = JSON.parse(raw); if (s && s.version === 1) return s; }
    } catch (e) { /* ignore corrupt data */ }
    return seed();
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage full or blocked */ } }
  function emit(info) { listeners.forEach((fn) => fn(info || {})); }
  /** Run a mutation, persist and notify subscribers. */
  function mutate(fn) {
    const res = fn(state) || { ok: true };
    if (res.ok !== false) { save(); emit(); }
    return res;
  }
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY || !e.newValue) return;
    try { state = JSON.parse(e.newValue); api.state = state; emit({ remote: true }); } catch (err) { /* ignore */ }
  });

  /* ---------- helpers ---------- */
  function channelLabel(c) { return { app: 'mobile app', phone: 'phone call to 912', sms: 'SMS to 912' }[c] || c; }
  const getReq = (id) => state.requests.find((r) => r.id === id);
  const getAmb = (id) => state.ambulances.find((a) => a.id === id);
  const getHosp = (id) => state.hospitals.find((h) => h.id === id);
  const getUser = (id) => state.users.find((u) => u.id === id);

  /** The person acting for a role (from the role's session). */
  function actor(role) {
    if (role === 'caller') return { name: state.callerProfile.name + ' (caller)', role };
    if (role === 'crew') { const c = state.sessions.crew; return { name: c ? 'Crew ' + c.ambulanceId + ' (' + c.names + ')' : 'Crew', role }; }
    if (role === 'system') return { name: 'EAMS system', role };
    const u = getUser(state.sessions[role]);
    return { name: u ? u.name : role, role };
  }
  function addLog(req, role, text) {
    const a = actor(role);
    req.log.push({ at: now(), by: a.name, role, text });
    audit(role, text, req.id);
  }
  function audit(role, action, record) {
    const a = actor(role);
    state.audit.unshift({ id: (state.audit[0] ? state.audit[0].id : 0) + 1, at: now(), user: a.name, role, action, record: record || '—' });
    if (state.audit.length > 600) state.audit.length = 600;
  }
  /** target: { role, hospitalId?, ambulanceId?, callerId? } */
  function notify(target, text, extra) {
    state.nextId = (state.nextId || 1) + 1;
    state.notifications.unshift(Object.assign({ id: state.nextId, at: now(), target, text, read: false }, extra || {}));
    if (state.notifications.length > 120) state.notifications.length = 120;
  }
  const sortQueue = (a, b) => (RANK[a.priority] - RANK[b.priority]) || (a.createdAt - b.createdAt);
  const activeRequests = () => state.requests.filter((r) => !r.archived && ACTIVE.includes(r.status)).sort(sortQueue);
  const waitingList = () => state.requests.filter((r) => r.status === 'waiting').sort(sortQueue);
  function waitingPosition(id) { const i = waitingList().findIndex((r) => r.id === id); return i < 0 ? null : i + 1; }
  /** Available = in service, free, not reserved. Out-of-service units never appear. */
  const availableAmbulances = () => state.ambulances.filter((a) => a.status === 'available' && !a.disabled && !a.requestId);

  /** Free ambulances sorted by distance to the request (nearest first). */
  function candidates(req, exclude = []) {
    return availableAmbulances().filter((a) => !exclude.includes(a.id)).map((a) => {
      const km = distKm(ambPos(a), req.location);
      return { amb: a, km: +km.toFixed(1), eta: etaMin(km) };
    }).sort((x, y) => x.km - y.km);
  }
  /** Nearest suitable unit: Critical cases prefer an ALS unit when one is free. */
  function suggestedOf(list, req) {
    if (!list.length) return null;
    if (req.priority === 'critical') { const als = list.find((c) => c.amb.type === 'ALS'); if (als && als.km - list[0].km < 2) return als; }
    return list[0];
  }
  /** Hospitals with emergency care sorted by distance; full ones flagged. */
  function hospitalOptions(req) {
    const at = req.location;
    return state.hospitals.filter((h) => !h.disabled && h.emergencyCare).map((h) => ({
      h, km: +distKm(h, at).toFixed(1), eta: etaMin(distKm(h, at)), full: h.beds.emergency <= 0,
      declined: req.hospital.declined.includes(h.id),
    })).sort((a, b) => a.km - b.km);
  }
  function suggestedHospital(req) { return hospitalOptions(req).find((o) => !o.full && !o.declined) || null; }

  /** Estimated arrival at hospital (ms timestamp). */
  function hospitalEta(req) {
    const h = getHosp(req.hospitalId); const a = getAmb(req.ambulanceId);
    if (!h) return null;
    const leg = etaMin(distKm(req.location, h)) * MIN;
    if (req.status === 'toHospital' && a && a.trip) return a.trip.end;
    if (req.status === 'atPatient') return Math.max(now(), (req.times.atPatient || now()) + 6 * MIN) + leg;
    if ((req.status === 'enroute') && a && a.trip) return a.trip.end + 6 * MIN + leg;
    if (req.status === 'offered' && a) return now() + etaMin(distKm(ambPos(a), req.location)) * MIN + 6 * MIN + leg;
    return null;
  }

  /* ---------- request lifecycle (internal, inside mutate) ---------- */
  function setOffer(req, amb, tried) {
    req.offer = { ambulanceId: amb.id, startedAt: now(), expiresAt: now() + OFFER_MS, tried: tried || [] };
    req.ambulanceId = amb.id; req.status = 'offered'; req.times.offered = now();
    amb.requestId = req.id; amb.status = 'assigned';
    if (!req.hospitalId) { const sh = suggestedHospital(req); if (sh) req.hospitalId = sh.h.id; }
    notify({ role: 'crew', ambulanceId: amb.id }, 'New emergency assignment ' + req.id + ' – accept within 60 s', { requestId: req.id, kind: 'offer' });
  }
  function releaseAmb(req) {
    const a = getAmb(req.ambulanceId);
    if (a && a.requestId === req.id) { a.requestId = null; a.status = 'available'; }
    req.ambulanceId = null;
  }
  /** Offer the next nearest free unit, or put the request on the waiting list. */
  function offerNext(req) {
    const tried = req.offer ? req.offer.tried.concat(req.offer.ambulanceId) : [];
    releaseAmb(req); req.offer = null;
    const next = suggestedOf(candidates(req, tried), req);
    if (next) {
      setOffer(req, next.amb, tried);
      addLog(req, 'system', 'Automatically offered to next nearest ambulance ' + next.amb.id + ' (' + next.km + ' km)');
      notify({ role: 'dispatcher' }, req.id + ': next nearest ambulance ' + next.amb.id + ' offered automatically', { requestId: req.id, kind: 'warn' });
    } else {
      toWaiting(req, 'No other ambulance free – added to waiting list');
    }
  }
  function toWaiting(req, text) {
    req.status = 'waiting'; req.times.waiting = now(); req.offer = null;
    addLog(req, 'system', text);
    notify({ role: 'dispatcher' }, req.id + ' added to the waiting list (no ambulance free)', { requestId: req.id, kind: 'warn' });
    notify({ role: 'caller', callerId: req.callerId }, 'All ambulances are busy – you are on the waiting list', { requestId: req.id, kind: 'warn' });
  }
  function notifyHospital(req) {
    const h = getHosp(req.hospitalId);
    if (!h) return;
    req.hospital.status = 'pending'; req.hospital.deadline = now() + HOSPITAL_MS; req.hospital.overdue = false;
    notify({ role: 'hospital', hospitalId: h.id }, 'Incoming ' + req.priority + ' patient ' + req.id + ' – please respond within 3 min', { requestId: req.id, kind: 'incoming' });
    addLog(req, 'system', h.name + ' notified of incoming patient');
  }
  /** Called whenever a unit becomes free: serve the waiting list. */
  function ambulanceFreed(amb) {
    const list = waitingList();
    if (!list.length) return;
    const top = list[0];
    if (top.autoAssign) {
      setOffer(top, amb, []);
      addLog(top, 'system', 'Auto-assigned ' + amb.id + ' as soon as it became free');
      notify({ role: 'dispatcher' }, amb.id + ' became free and was offered to ' + top.id, { requestId: top.id, kind: 'info' });
    } else {
      notify({ role: 'dispatcher' }, amb.id + ' is free – ' + list.length + ' request(s) waiting (next: ' + top.id + ')', { requestId: top.id, kind: 'warn' });
    }
  }
  function triage(d) {
    const txt = (d.condition || '').toLowerCase();
    if (/unconscious|not breathing|bleeding heavily|cardiac|severe/.test(txt)) return 'critical';
    if (d.type === 'accident' && (d.patients || 1) > 1) return 'critical';
    if (['maternity', 'breathing', 'accident'].includes(d.type)) return 'urgent';
    return 'normal';
  }
  function err(m) { return { ok: false, error: m }; }

  /* ---------- public actions ---------- */
  const actions = {
    createRequest(d, role) {
      return mutate((s) => {
        const id = reqId(s.seq++);
        const req = blankRequest({
          id, type: d.type, priority: d.priority || triage(d), patients: d.patients || 1, condition: d.condition || '',
          location: Object.assign({}, d.location), callerPhone: d.callerPhone || '', callerName: d.callerName || '',
          callerId: d.callerId || null, channel: d.channel || 'app', createdAt: now(), times: { received: now() },
        });
        s.requests.push(req);
        addLog(req, role, 'Request created via ' + channelLabel(req.channel));
        notify({ role: 'dispatcher' }, 'New ' + req.priority + ' request ' + id + ' – ' + TYPES[req.type] + ', ' + req.location.name, { requestId: id, kind: req.priority === 'critical' ? 'critical' : 'new' });
        return { ok: true, id };
      });
    },
    updateRequest(id, patch, role = 'dispatcher') {
      return mutate(() => {
        const req = getReq(id); if (!req) return err('Request not found');
        const changes = [];
        if (patch.priority && patch.priority !== req.priority) { changes.push('priority ' + req.priority + ' → ' + patch.priority); req.priority = patch.priority; }
        if (patch.location && patch.location.name !== req.location.name) { changes.push('location → ' + patch.location.name); req.location = Object.assign({}, req.location, patch.location); }
        if (!changes.length) return err('Nothing changed');
        addLog(req, role, 'Edited: ' + changes.join(', '));
        return { ok: true };
      });
    },
    /** Rule: a request must be verified before it can be allocated. */
    verifyRequest(id, patch) {
      return mutate(() => {
        const req = getReq(id); if (!req) return err('Request not found');
        if (req.status !== 'received') return err('Request ' + id + ' is already ' + req.status);
        if (patch && patch.priority) req.priority = patch.priority;
        if (patch && patch.location) req.location = Object.assign({}, req.location, patch.location);
        req.status = 'verified'; req.times.verified = now();
        addLog(req, 'dispatcher', 'Request verified as ' + req.priority.toUpperCase());
        notify({ role: 'caller', callerId: req.callerId }, 'Your request ' + id + ' has been verified', { requestId: id, kind: 'info' });
        if (!availableAmbulances().length) { toWaiting(req, 'No ambulance free – added to waiting list'); return { ok: true, waiting: true }; }
        return { ok: true };
      });
    },
    markFalseCall(id, reason) {
      return mutate(() => {
        const req = getReq(id); if (!req) return err('Request not found');
        if (!['received', 'verified', 'waiting'].includes(req.status)) return err('Only unallocated requests can be marked as false calls');
        req.status = 'false'; req.falseReason = reason; req.flagged = true; req.times.closed = now();
        addLog(req, 'dispatcher', 'Marked as FALSE CALL – ' + reason + ' (caller ' + req.callerPhone + ' flagged)');
        return { ok: true };
      });
    },
    /** Rules: verified first; unit must be free and in service; never two emergencies. */
    assignAmbulance(id, ambId, reason) {
      return mutate(() => {
        const req = getReq(id); if (!req) return err('Request not found');
        if (req.status === 'received') return err('Verify the request before allocating an ambulance');
        if (!['verified', 'waiting'].includes(req.status)) return err(id + ' already has an ambulance');
        const amb = getAmb(ambId);
        if (!amb || amb.disabled || amb.status === 'out') return err(ambId + ' is out of service');
        if (amb.status !== 'available' || amb.requestId) return err(ambId + ' is already serving another emergency');
        setOffer(req, amb, []);
        addLog(req, 'dispatcher', 'Assigned ' + amb.id + (reason ? ' instead of suggested unit – reason: ' + reason : ' (suggested – nearest)') + '; waiting for crew to accept');
        return { ok: true };
      });
    },
    setAutoAssign(id, on) {
      return mutate(() => {
        const req = getReq(id); if (!req || req.status !== 'waiting') return err('Request is not on the waiting list');
        req.autoAssign = on;
        addLog(req, 'dispatcher', on ? 'Will be assigned automatically as soon as a unit is free' : 'Automatic assignment cancelled');
        const free = availableAmbulances();
        if (on && free.length && waitingList()[0] === req) {
          const c = suggestedOf(candidates(req), req); setOffer(req, c.amb, []);
          addLog(req, 'system', 'Auto-assigned ' + c.amb.id);
        }
        return { ok: true };
      });
    },
    crewAccept(id) {
      return mutate(() => {
        const req = getReq(id); if (!req || req.status !== 'offered') return err('This assignment is no longer open');
        const amb = getAmb(req.ambulanceId);
        req.status = 'enroute'; req.times.accepted = now(); req.offer = null;
        amb.status = 'enroute'; amb.trip = makeTrip(ambPos(amb), req.location);
        addLog(req, 'crew', 'Crew accepted – ' + amb.id + ' on the way to the patient (' + amb.trip.km + ' km)');
        notify({ role: 'dispatcher' }, amb.id + ' accepted ' + id + ' and is on the way', { requestId: id, kind: 'success' });
        notify({ role: 'caller', callerId: req.callerId }, 'Ambulance ' + amb.id + ' is on the way', { requestId: id, kind: 'success' });
        if (req.hospitalId && !req.hospital.status) notifyHospital(req);
        return { ok: true };
      });
    },
    crewDecline(id, reason) {
      return mutate(() => {
        const req = getReq(id); if (!req || req.status !== 'offered') return err('This assignment is no longer open');
        addLog(req, 'crew', 'Crew of ' + req.ambulanceId + ' declined – ' + reason);
        notify({ role: 'dispatcher' }, req.ambulanceId + ' declined ' + id + ': ' + reason, { requestId: id, kind: 'warn' });
        offerNext(req);
        return { ok: true };
      });
    },
    /** Dispatcher or crew picks a different hospital. */
    setHospital(id, hid, role, reason) {
      return mutate(() => {
        const req = getReq(id); const h = getHosp(hid);
        if (!req || !h) return err('Not found');
        if (h.beds.emergency <= 0) return err(h.name + ' has no free emergency beds');
        if (req.hospitalId === hid) return err(h.name + ' is already selected');
        const prev = getHosp(req.hospitalId);
        if (prev && req.hospital.status === 'accepted') prev.beds.emergency += 1; // release reserved bed
        req.hospitalId = hid; req.hospital.status = null; req.hospital.reroutedFrom = null;
        addLog(req, role, 'Hospital set to ' + h.name + (prev ? ' (was ' + prev.name + ')' : '') + (reason ? ' – ' + reason : ''));
        if (['enroute', 'atPatient', 'toHospital'].includes(req.status)) notifyHospital(req);
        const amb = getAmb(req.ambulanceId);
        if (req.status === 'toHospital' && amb) { amb.trip = makeTrip(ambPos(amb), h); }
        return { ok: true };
      });
    },
    hospitalAccept(id) {
      return mutate(() => {
        const req = getReq(id); const hid = currentHospitalId();
        if (!req || req.hospitalId !== hid || req.hospital.status !== 'pending') return err('Nothing to accept');
        const h = getHosp(hid);
        req.hospital.status = 'accepted'; req.hospital.acceptedAt = now();
        h.beds.emergency = Math.max(0, h.beds.emergency - 1);
        addLog(req, 'hospital', h.name + ' accepted the patient – emergency bed reserved');
        notify({ role: 'crew', ambulanceId: req.ambulanceId }, h.name + ' is ready – confirmed', { requestId: id, kind: 'success' });
        notify({ role: 'dispatcher' }, h.name + ' accepted ' + id, { requestId: id, kind: 'success' });
        return { ok: true };
      });
    },
    /** Hospital declines → the system reroutes to the next nearest hospital with free beds. */
    hospitalDecline(id, reason) {
      return mutate(() => {
        const req = getReq(id); const hid = currentHospitalId();
        if (!req || req.hospitalId !== hid || !['pending', 'accepted'].includes(req.hospital.status)) return err('Nothing to decline');
        const h = getHosp(hid);
        if (req.hospital.status === 'accepted') h.beds.emergency += 1;
        req.hospital.declined.push(hid);
        addLog(req, 'hospital', h.name + ' cannot accept – ' + reason);
        const next = suggestedHospital(req);
        if (next) {
          req.hospitalId = next.h.id; req.hospital.reroutedFrom = h.name; req.hospital.status = null;
          notifyHospital(req);
          const amb = getAmb(req.ambulanceId);
          if (req.status === 'toHospital' && amb) amb.trip = makeTrip(ambPos(amb), next.h);
          addLog(req, 'system', 'Rerouted to ' + next.h.name + ' (nearest with free beds)');
          notify({ role: 'crew', ambulanceId: req.ambulanceId }, h.name + ' declined – rerouting to ' + next.h.name, { requestId: id, kind: 'warn' });
          notify({ role: 'dispatcher' }, h.name + ' declined ' + id + ' – rerouted to ' + next.h.name, { requestId: id, kind: 'warn' });
        } else {
          req.hospitalId = null; req.hospital.status = null;
          notify({ role: 'dispatcher' }, 'No hospital with free beds for ' + id + ' – choose one manually', { requestId: id, kind: 'critical' });
        }
        return { ok: true };
      });
    },
    crewAtPatient(id) {
      return mutate(() => {
        const req = getReq(id); if (!req || req.status !== 'enroute') return err('Not on the way to the patient');
        const amb = getAmb(req.ambulanceId);
        park(amb, req.location); amb.status = 'busy';
        req.status = 'atPatient'; req.times.atPatient = now();
        addLog(req, 'crew', 'Crew arrived at the patient');
        notify({ role: 'caller', callerId: req.callerId }, 'The ambulance has arrived', { requestId: id, kind: 'success' });
        return { ok: true };
      });
    },
    saveVitals(id, v) {
      return mutate(() => {
        const req = getReq(id); if (!req) return err('Not found');
        req.vitals = v.vitals; req.firstAid = v.firstAid || []; req.notes = v.notes || '';
        addLog(req, 'crew', 'Vital signs recorded (BP ' + (v.vitals.bp || '–') + ', HR ' + (v.vitals.hr || '–') + ', SpO₂ ' + (v.vitals.spo2 || '–') + '%, ' + v.vitals.avpu + ')');
        if (req.hospitalId) notify({ role: 'hospital', hospitalId: req.hospitalId }, 'Vitals received for ' + id, { requestId: id, kind: 'info' });
        return { ok: true };
      });
    },
    startTransport(id) {
      return mutate(() => {
        const req = getReq(id); if (!req || req.status !== 'atPatient') return err('Crew must be at the patient first');
        const h = getHosp(req.hospitalId); if (!h) return err('Choose a hospital first');
        const amb = getAmb(req.ambulanceId);
        req.status = 'toHospital'; req.times.toHospital = now();
        amb.status = 'enroute'; amb.trip = makeTrip(req.location, h);
        if (!req.hospital.status) notifyHospital(req);
        addLog(req, 'crew', 'Transport started to ' + h.name);
        return { ok: true };
      });
    },
    crewArrivedHospital(id) {
      return mutate(() => {
        const req = getReq(id); if (!req || req.status !== 'toHospital') return err('Not travelling to the hospital');
        const h = getHosp(req.hospitalId); const amb = getAmb(req.ambulanceId);
        park(amb, h); amb.status = 'busy';
        req.status = 'atHospital'; req.times.atHospital = now();
        addLog(req, 'crew', 'Arrived at ' + h.name);
        notify({ role: 'hospital', hospitalId: h.id }, amb.id + ' has arrived with ' + id, { requestId: id, kind: 'info' });
        return { ok: true };
      });
    },
    /** Rule: only the crew can mark the handover. */
    handover(id, role) {
      return mutate(() => {
        if (role !== 'crew') return err('Only the ambulance crew can mark a patient as handed over');
        const req = getReq(id); if (!req || req.status !== 'atHospital') return err('Arrive at the hospital first');
        const h = getHosp(req.hospitalId);
        req.status = 'handedOver'; req.times.handedOver = now();
        addLog(req, 'crew', 'Patient handed over to ' + h.name + ' staff');
        addLog(req, 'system', 'SMS sent to family contact: patient admitted at ' + h.name);
        notify({ role: 'dispatcher' }, id + ' handed over at ' + h.short + ' – case can be closed', { requestId: id, kind: 'success' });
        notify({ role: 'caller', callerId: req.callerId }, 'Patient handed over at ' + h.name, { requestId: id, kind: 'success' });
        return { ok: true };
      });
    },
    crewReturnAvailable() {
      return mutate(() => {
        const c = state.sessions.crew; if (!c) return err('No crew on shift');
        const amb = getAmb(c.ambulanceId);
        const req = amb.requestId && getReq(amb.requestId);
        if (req && !['handedOver', 'closed'].includes(req.status)) return err('Finish the current emergency first');
        amb.requestId = null; amb.status = 'available'; amb.trip = null;
        audit('crew', amb.id + ' back in service (Available)', amb.id);
        ambulanceFreed(amb);
        return { ok: true };
      });
    },
    /** Rule: close only after handover. */
    closeCase(id) {
      return mutate(() => {
        const req = getReq(id); if (!req) return err('Not found');
        if (req.status !== 'handedOver') return err('A case can only be closed after the crew marks the patient as handed over');
        req.status = 'closed'; req.times.closed = now();
        addLog(req, 'dispatcher', 'Case closed');
        return { ok: true };
      });
    },

    /* ----- sessions ----- */
    login(role, username, password) {
      return mutate(() => {
        const u = state.users.find((x) => x.username === username.trim() && x.role === role);
        if (!u) return err('Unknown username for this role');
        if (u.disabled) return err('This account is disabled – contact the administrator');
        if (u.locked) return { ok: false, locked: true, error: 'Account locked' };
        if (u.password !== password) {
          u.failed = (u.failed || 0) + 1;
          if (u.failed >= 5) { u.locked = true; audit('system', 'Account locked after 5 failed logins', u.username); save(); emit(); return { ok: false, locked: true, error: 'Account locked' }; }
          save(); emit();
          return { ok: false, error: 'Wrong password – ' + (5 - u.failed) + ' attempt(s) left' };
        }
        u.failed = 0; state.sessions[role] = u.id;
        audit(role, 'Signed in', u.username);
        return { ok: true };
      });
    },
    logout(role) { return mutate(() => { audit(role, 'Signed out', '—'); state.sessions[role] = null; return { ok: true }; }); },
    startShift(ambulanceId, names, status) {
      return mutate(() => {
        const amb = getAmb(ambulanceId); if (!amb || amb.disabled) return err('Unit not available');
        state.sessions.crew = { ambulanceId, names, startedAt: now() };
        amb.crew = names;
        if (!amb.requestId && !amb.sim && amb.status !== 'enroute') amb.status = status;
        if (amb.sim) { amb.sim = false; park(amb); amb.job = null; amb.status = status; }
        audit('crew', 'Shift started (' + (status === 'available' ? 'Available' : 'Out of service') + ')', amb.id);
        if (amb.status === 'available') ambulanceFreed(amb);
        return { ok: true };
      });
    },
    setCrewStatus(status) {
      return mutate(() => {
        const c = state.sessions.crew; if (!c) return err('No shift');
        const amb = getAmb(c.ambulanceId);
        if (amb.requestId) return err('Unit is serving an emergency');
        amb.status = status; amb.job = null;
        audit('crew', 'Status changed to ' + (status === 'available' ? 'Available' : 'Out of service'), amb.id);
        if (status === 'available') ambulanceFreed(amb);
        return { ok: true };
      });
    },
    endShift() {
      return mutate(() => {
        const c = state.sessions.crew; if (!c) return err('No shift');
        const amb = getAmb(c.ambulanceId);
        if (amb.requestId) return err('Finish the current emergency first');
        audit('crew', 'Shift ended', amb.id);
        state.sessions.crew = null;
        return { ok: true };
      });
    },

    /* ----- hospital capacity ----- */
    updateCapacity(hid, beds) {
      return mutate(() => {
        const h = getHosp(hid); if (!h) return err('Not found');
        h.beds = Object.assign({}, beds);
        audit('hospital', 'Capacity updated: ER ' + beds.emergency + ', ICU ' + beds.icu + ', theatre ' + beds.theatre, h.name);
        notify({ role: 'dispatcher' }, h.name + ' updated capacity: ' + beds.emergency + ' emergency bed(s) free', { kind: 'info' });
        return { ok: true };
      });
    },

    /* ----- admin data management (never interrupts the service) ----- */
    upsertUser(d) {
      return mutate(() => {
        if (state.users.some((u) => u.username === d.username && u.id !== d.id)) return err('Username already exists');
        let u = d.id && getUser(d.id);
        if (u) { Object.assign(u, d); audit('admin', 'Edited user', u.username); }
        else { u = Object.assign({ id: 'u-' + now(), password: 'demo123', disabled: false, failed: 0, locked: false }, d); state.users.push(u); audit('admin', 'Added user (' + u.role + ')', u.username); }
        return { ok: true };
      });
    },
    toggleUser(id) {
      return mutate(() => { const u = getUser(id); u.disabled = !u.disabled; audit('admin', (u.disabled ? 'Disabled' : 'Enabled') + ' user', u.username); return { ok: true }; });
    },
    unlockUser(id) {
      return mutate(() => { const u = getUser(id); u.locked = false; u.failed = 0; audit('admin', 'Unlocked account', u.username); return { ok: true }; });
    },
    upsertAmbulance(d) {
      return mutate(() => {
        let a = getAmb(d.id);
        if (a && !d.isNew) { a.type = d.type; a.base = d.base; a.plate = d.plate; audit('admin', 'Edited ambulance', a.id); return { ok: true }; }
        if (a) return err('Unit ' + d.id + ' already exists');
        const base = PLACES.find((p) => p.name === d.base) || PLACES[5];
        a = { id: d.id, type: d.type, status: 'available', x: base.x + 1, y: base.y + 1, base: d.base, crew: '—', requestId: null, trip: null, disabled: false, plate: d.plate };
        state.ambulances.push(a);
        audit('admin', 'Added ambulance', a.id);
        ambulanceFreed(a);
        return { ok: true };
      });
    },
    toggleAmbulance(id) {
      return mutate(() => {
        const a = getAmb(id);
        if (!a.disabled && a.requestId) return err(id + ' is serving an emergency – disable it after the case');
        a.disabled = !a.disabled;
        if (a.disabled) { park(a); a.status = 'out'; a.sim = false; } else { a.status = 'available'; a.job = null; ambulanceFreed(a); }
        audit('admin', (a.disabled ? 'Disabled (out of service)' : 'Enabled') + ' ambulance', a.id);
        return { ok: true };
      });
    },
    upsertHospital(d) {
      return mutate(() => {
        let h = d.id && getHosp(d.id);
        if (h) { h.name = d.name; h.district = d.district; h.short = d.short || d.name; h.beds = d.beds; h.phone = d.phone; audit('admin', 'Edited hospital', h.name); return { ok: true }; }
        const p = PLACES.find((x) => x.district === d.district) || PLACES[0];
        h = { id: 'h-' + now(), name: d.name, short: d.short || d.name, district: d.district, x: p.x + 3, y: p.y + 3, beds: d.beds, emergencyCare: true, disabled: false, phone: d.phone };
        state.hospitals.push(h);
        audit('admin', 'Added hospital', h.name);
        return { ok: true };
      });
    },
    toggleHospital(id) {
      return mutate(() => { const h = getHosp(id); h.disabled = !h.disabled; audit('admin', (h.disabled ? 'Disabled' : 'Enabled') + ' hospital', h.name); return { ok: true }; });
    },

    /* ----- misc ----- */
    updateCallerProfile(p) {
      return mutate(() => { Object.assign(state.callerProfile, p); audit('caller', 'Profile updated', 'caller profile'); return { ok: true }; });
    },
    markRead(role) {
      return mutate(() => { notificationsFor(role).forEach((n) => { n.read = true; }); return { ok: true }; });
    },
    /** Record that a user viewed a record (audit "who viewed"), without re-rendering. */
    logView(role, record) {
      const last = state.audit[0];
      if (last && last.record === record && last.action === 'Viewed record' && now() - last.at < 5000) return;
      audit(role, 'Viewed record', record); save();
    },
    reset(opts) { state = seed(opts); api.state = state; save(); emit({ reset: true }); },
  };

  function currentHospitalId() { const u = getUser(state.sessions.hospital); return u ? u.hospitalId : null; }
  function notificationsFor(role) {
    return state.notifications.filter((n) => {
      const t = n.target; if (t.role !== role) return false;
      if (role === 'hospital') return t.hospitalId === currentHospitalId();
      if (role === 'crew') return state.sessions.crew && t.ambulanceId === state.sessions.crew.ambulanceId;
      if (role === 'caller') return t.callerId === state.callerProfile.id;
      return true;
    });
  }

  /** Called every second by the app: expiring offers, overdue hospitals, simulated traffic. */
  function tick() {
    const t = now(); let changed = false;
    state.requests.forEach((req) => {
      if (req.status === 'offered' && req.offer && t > req.offer.expiresAt) {
        addLog(req, 'system', 'Crew of ' + req.offer.ambulanceId + ' did not accept within 60 s');
        offerNext(req); changed = true;
      }
      if (req.hospital.status === 'pending' && req.hospital.deadline && t > req.hospital.deadline && !req.hospital.overdue) {
        req.hospital.overdue = true; changed = true;
        const h = getHosp(req.hospitalId);
        addLog(req, 'system', h.name + ' did not respond within 3 min – dispatcher alerted');
        notify({ role: 'dispatcher' }, h.name + ' has not answered for ' + req.id + ' – consider another hospital', { requestId: req.id, kind: 'critical' });
      }
    });
    state.ambulances.forEach((a) => {
      if (a.sim && a.trip && t > a.trip.end) {
        const p = PLACES[Math.floor(Math.random() * PLACES.length)];
        a.trip = makeTrip(a.trip.to, p, t); changed = true;
      }
    });
    if (changed) { save(); emit(); }
  }

  state = load();
  const api = {
    state, subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); }, tick,
    get: getReq, amb: getAmb, hosp: getHosp, user: getUser,
    activeRequests, waitingList, waitingPosition, availableAmbulances, candidates, suggestedOf,
    hospitalOptions, suggestedHospital, hospitalEta, notificationsFor, currentHospitalId, nearestPlace, geocode,
    ambPos, pointAlong, distKm, roadKm, etaMin, makeTrip, streetRoute,
    PLACES, TYPES, RANK, MIN, OFFER_MS, HOSPITAL_MS, channelLabel,
    /** Format a timestamp on the demo clock (starts at 10:44 AM on reset). */
    fmtTime(ts) { if (!ts) return '—'; return new Date(ts + state.clockOffset).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }).replace(/^0/, ''); },
    fmtTime12(ts) { if (!ts) return '—'; return new Date(ts + state.clockOffset).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); },
    fmtDate(ts) { return new Date(ts + state.clockOffset).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); },
    isToday(ts) { const a = new Date(ts + state.clockOffset), b = new Date(now() + state.clockOffset); return a.toDateString() === b.toDateString(); },
  };
  Object.assign(api, actions);
  // keep api.state in sync if replaced
  Object.defineProperty(api, 'state', { get: () => state, set: (v) => { state = v; } });
  return api;
})();
