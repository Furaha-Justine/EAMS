/* "Run full demo" – walks one emergency through every role, step by step.
 * Each step opens a screen, highlights the element about to be used, then
 * clicks it through the real UI so the shared store drives every update. */
EAMS.Demo = (function () {
  const { Store, UI } = EAMS;
  const ID = 'EMR-0427';
  const STEP_MS = 4200;
  let i = 0, running = false, paused = false, timer = null;
  const app = () => EAMS.App;
  const click = (sel) => { const el = document.querySelector(sel); if (el && !el.disabled) el.click(); };

  const steps = [
    { role: 'Overview', title: 'One emergency, five roles', text: 'Emergency request → ambulance allocation → routing → hospital notification. Every screen shares the same live data.', route: '#/', hl: '.flow' },
    { role: 'Caller', title: 'Aline requests an ambulance', text: 'A road accident in Kimihurura. She presses the big green button.', route: '#/caller/home', hl: '#sos-btn', act: () => click('#sos-btn') },
    {
      role: 'Caller', title: 'Three quick steps', text: 'Type: Accident · condition · 2 patients · GPS location Kimihurura, Gasabo. Then “Send Request”.', route: '#/caller/request', hl: '#send-btn',
      before() { const d = app().ui.drafts.req; Object.assign(d, { type: 'accident', condition: 'Severe impact, one patient unconscious, second patient with a broken leg.', patients: 2 }); },
      act: () => click('#send-btn'),
    },
    { role: 'Caller', title: 'Request received', text: 'Incident ' + ID + ' is created. The timeline updates live – now “Verification in progress”.', route: '#/caller/status/' + ID, hl: '.timeline' },
    { role: 'Dispatcher', title: 'New critical request in the queue', text: 'Critical requests are sorted first. The waiting timer is running.', route: '#/dispatcher/dashboard', hl: '#q-' + ID },
    {
      role: 'Dispatcher', title: 'Verify before assigning', text: 'The dispatcher checks the details, confirms priority CRITICAL and verifies.', route: '#/dispatcher/verify/' + ID, hl: '#btn-verify',
      before() { app().ui.drafts['v' + ID] = { priority: 'critical' }; }, act: () => click('#btn-verify'),
    },
    { role: 'Dispatcher', title: 'Nearest suitable ambulance suggested', text: 'A-03 (ALS, 1.8 km) is highlighted as “Suggested – nearest”. Out-of-service units are never shown.', route: '#/dispatcher/allocate/' + ID, hl: '#row-suggested' },
    { role: 'Dispatcher', title: 'Assign A-03', text: 'The unit is reserved – it can never be given to a second emergency.', route: '#/dispatcher/allocate/' + ID, hl: '#btn-assign', act: () => click('#btn-assign') },
    { role: 'Dispatcher', title: 'Waiting for the crew – 60 s', text: 'If the crew declines or does not answer, the next nearest ambulance is offered automatically. CHUK Emergency was pre-selected as nearest hospital with free beds.', route: '#/dispatcher/allocate/' + ID, hl: '#offer-panel' },
    { role: 'Crew', title: 'New emergency assignment', text: 'The A-03 crew gets a full-screen alert with a live 60-second countdown and accepts.', route: '#/crew/home', hl: '#btn-accept', act: () => click('#btn-accept') },
    { role: 'Crew', title: 'Navigation to the patient', text: 'Route, moving marker and turn-by-turn card. CHUK has now been notified.', route: '#/crew/home', hl: '.turn-card' },
    { role: 'Caller', title: 'Caller tracks the ambulance', text: 'The marker moves along the route and the ETA counts down.', route: '#/caller/track/' + ID, hl: '#eta-badge' },
    { role: 'Hospital', title: 'Hospital notification', text: 'CHUK sees the incoming critical patient with ETA and a 3-minute response timer – and accepts. A bed is reserved.', route: '#/hospital/incoming', hl: '#btn-accept-' + ID, act: () => click('#btn-accept-' + ID) },
    { role: 'Crew', title: 'At the patient', text: 'The crew updates its status.', route: '#/crew/home', hl: '#btn-at-patient', act: () => click('#btn-at-patient') },
    {
      role: 'Crew', title: 'Vital signs & first aid', text: 'BP 90/60, HR 118, SpO₂ 93 %, Verbal. Hospital confirmed. Start transport.', route: '#/crew/home', hl: '#btn-transport',
      before() { app().ui.drafts['vit' + ID] = { bp: '90/60', hr: '118', spo2: '93', avpu: 'Verbal', notes: 'Patient 1 unconscious → responds to voice. Patient 2: closed fracture, left leg.' }; app().ui.drafts['aid' + ID] = ['Oxygen', 'Bleeding control', 'Splint', 'Neck collar']; },
      act: () => click('#btn-transport'),
    },
    { role: 'Crew', title: 'Navigation to hospital', text: '“Hospital ready – confirmed”. (If CHUK had declined, the crew would see “rerouting to King Faisal Hospital”.)', route: '#/crew/home', hl: '#hosp-banner', act: () => click('#btn-arrived') },
    { role: 'Crew', title: 'Handover', text: 'Only the crew can mark the patient as handed over.', route: '#/crew/home', hl: '#btn-handover', act: () => click('#btn-handover') },
    { role: 'Caller', title: 'Caller sees the handover', text: 'Times summary. The family contact also received an SMS.', route: '#/caller/arrival/' + ID, hl: '.big-check' },
    { role: 'Dispatcher', title: 'Close the case', text: 'Enabled only now that the crew has handed over. Every step is in the read-only case log.', route: '#/dispatcher/case/' + ID, hl: '#btn-close', act: () => click('#btn-close') },
    { role: 'Crew', title: 'Back in service', text: 'A-03 returns to Available and can serve the waiting list.', route: '#/crew/home', hl: '#btn-free', act: () => click('#btn-free') },
    { role: 'Done', title: 'Demo complete', text: 'Explore any role with the switcher, or check Admin → Audit log to see every action with user and time.', route: '#/', hl: null },
  ];

  function start() {
    stop(true);
    Store.reset({ withoutActive: true });
    Store.login('dispatcher', 'dispatcher', 'demo123');
    Store.login('hospital', 'nurse.chuk', 'demo123');
    Store.startShift('A-03', 'Jean Habimana, Eric Nshuti', 'available');
    app().ui.drafts = {};
    running = true; paused = false; i = 0;
    show();
  }
  function show() {
    if (!running) return;
    const s = steps[i];
    if (s.before) s.before();
    app().ui.highlight = s.hl;
    if (location.hash !== s.route && !(s.route === '#/' && location.hash === '')) location.hash = s.route; else app().render();
    setTimeout(() => app().render(), 50); // re-apply highlight after any guard redirect
    panel();
    schedule();
  }
  function schedule() { clearTimeout(timer); if (!paused && running) timer = setTimeout(advance, STEP_MS); }
  function advance() {
    clearTimeout(timer);
    const s = steps[i];
    if (s.act) s.act();
    app().ui.highlight = null;
    i++;
    if (i >= steps.length) return stop();
    setTimeout(show, s.act ? 700 : 150);
  }
  function stop(silent) {
    clearTimeout(timer); running = false; app().ui.highlight = null;
    document.getElementById('demo-root').innerHTML = '';
    if (!silent) { app().render(); UI.toast('Demo finished', 'success'); }
  }
  function panel() {
    const s = steps[i];
    const el = document.getElementById('demo-root');
    el.innerHTML = '<aside class="demo-panel" aria-live="polite" aria-label="Guided demo">' +
      '<div class="demo-top"><span class="demo-role">' + UI.esc(s.role) + '</span><span class="demo-count">Step ' + (i + 1) + ' / ' + steps.length + '</span></div>' +
      '<h2>' + UI.esc(s.title) + '</h2><p>' + UI.esc(s.text) + '</p>' +
      '<div class="demo-progress"><i style="width:' + ((i + 1) / steps.length * 100) + '%"></i></div>' +
      '<div class="demo-btns"><button class="btn btn-secondary btn-sm" data-demo="pause">' + UI.icon(paused ? 'play' : 'pause', 16) + '<span>' + (paused ? 'Play' : 'Pause') + '</span></button>' +
      '<button class="btn btn-primary btn-sm" data-demo="next">' + UI.icon('skip', 16) + '<span>' + (i === steps.length - 1 ? 'Finish' : 'Next') + '</span></button>' +
      '<button class="btn btn-ghost btn-sm" data-demo="stop">' + UI.icon('x', 16) + '<span>Exit</span></button></div></aside>';
  }
  document.getElementById('demo-root').addEventListener('click', (e) => {
    const b = e.target.closest('[data-demo]'); if (!b) return;
    const a = b.dataset.demo;
    if (a === 'pause') { paused = !paused; panel(); schedule(); }
    if (a === 'next') advance();
    if (a === 'stop') stop();
  });
  return { start, stop, isRunning: () => running };
})();
