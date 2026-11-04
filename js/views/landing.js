/* Screen 0 – Role picker / landing page */
EAMS.Views = EAMS.Views || {};
EAMS.Views.landing = (function () {
  const { UI, Store } = EAMS;
  const ROLE_INFO = {
    caller: 'Request an ambulance, follow its status live and track it on the map.',
    dispatcher: 'Verify requests, allocate the nearest ambulance and manage the waiting list.',
    crew: 'Accept assignments, navigate, record vitals and hand over the patient.',
    hospital: 'Receive incoming patients, accept or decline and manage bed capacity.',
    admin: 'Manage users, ambulances and hospitals, reports and the audit log.',
  };

  function render() {
    const roles = EAMS.App.ROLES;
    const active = Store.activeRequests().length;
    const free = Store.availableAmbulances().length;
    return '<div class="landing">' +
      '<header class="landing-head">' + UI.Logo(64) +
      '<div><p class="eyebrow">AUCA · Requirements Engineering · Group 6 · Kigali, Rwanda</p>' +
      '<h1>EAMS <span>Emergency and Ambulance Management System</span></h1>' +
      '<p class="lead">One system that connects callers, dispatchers, ambulance crews, hospital staff and the system administrator.</p></div></header>' +
      '<ol class="flow" aria-label="Core activities">' +
      [['siren', 'Emergency request'], ['ambulance', 'Ambulance allocation'], ['navigation', 'Routing'], ['hospital', 'Hospital notification']].map((s, i) =>
        '<li><span class="flow-ic">' + UI.icon(s[0], 20) + '</span><span><small>Step ' + (i + 1) + '</small>' + s[1] + '</span></li>').join('') + '</ol>' +
      '<div class="landing-actions">' +
      UI.Button({ label: 'Run full demo', icon: 'play', action: 'demo', size: 'lg' }) +
      UI.Button({ label: 'Reset demo data', icon: 'reset', variant: 'secondary', action: 'reset', size: 'lg' }) +
      '<span class="live-pill"><span class="live-dot"></span>' + active + ' active emergencies · ' + free + ' ambulances free</span></div>' +
      '<h2 class="section-label">Choose a role</h2>' +
      '<div class="role-grid">' + roles.map((r) =>
        '<a class="role-card" href="' + r.home + '"><span class="role-ic">' + UI.icon(r.icon, 28) + '</span>' +
        '<span class="role-tag">' + r.platform + '</span><h3>' + r.label + '</h3><p>' + ROLE_INFO[r.key] + '</p>' +
        '<span class="role-go">Open ' + UI.icon('chevronRight', 16) + '</span></a>').join('') + '</div>' +
      '<p class="landing-foot">Prototype – no backend. All roles share one live data store saved in this browser (open several tabs to see real-time updates). Demo password for every account: <code>demo123</code>.</p>' +
      '</div>';
  }
  const actions = {
    demo() { EAMS.Demo.start(); },
    async reset() {
      const ok = await UI.modal({ title: 'Reset demo data?', body: '<p>All requests, changes and logs created in this browser are removed and the sample data is loaded again.</p>', actions: [{ label: 'Cancel', variant: 'secondary', value: null }, { label: 'Reset data', variant: 'danger', value: 'ok' }] });
      if (ok) { Store.reset(); UI.toast('Demo data reset', 'success'); }
    },
  };
  return { layout: 'plain', render, actions };
})();
