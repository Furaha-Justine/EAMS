/* MapView – stylised SVG map of Kigali (0–100 grid, 1 unit = 100 m).
 * Ambulances on a trip carry data-trip so Timers can animate them every second. */
EAMS.MapView = (function () {
  const { esc } = EAMS.UI;

  // Main roads (polylines) – loosely inspired by Kigali's KN/KG road network.
  const ROADS = [
    [[-40, 40], [10, 38], [24, 32], [38, 40], [55, 45], [74, 42], [100, 50], [150, 56]],
    [[38, 40], [36, 46], [32, 58], [22, 58], [0, 66], [-40, 70]],
    [[55, 45], [52, 32], [50, 10], [48, -40]],
    [[55, 45], [50, 54], [46, 62], [54, 84], [56, 140]],
    [[74, 42], [84, 30], [100, 22], [150, 10]],
    [[74, 42], [80, 54], [90, 58], [104, 70], [150, 90]],
    [[52, 32], [66, 20], [76, 18], [110, -20]],
    [[24, 32], [40, 20], [52, 32]],
    [[46, 62], [62, 74], [86, 78], [92, 84], [140, 110]],
  ];
  const AREAS = [
    { name: 'Nyarugenge', x: 30, y: 44 }, { name: 'Kimihurura', x: 58, y: 49 }, { name: 'Remera', x: 76, y: 46 },
    { name: 'Kacyiru', x: 47, y: 30 }, { name: 'Gisozi', x: 36, y: 16 }, { name: 'Nyamirambo', x: 14, y: 62 },
    { name: 'Gikondo', x: 40, y: 66 }, { name: 'Kicukiro', x: 66, y: 79 }, { name: 'Kimironko', x: 88, y: 26 },
    { name: 'Kanombe', x: 94, y: 62 }, { name: 'Nyabugogo', x: 18, y: 28 }, { name: 'Masaka', x: 96, y: 90 },
  ];

  /** Static base layer, drawn well beyond 0–100 so zoomed / letter-boxed views never show blank edges. */
  function base(s) {
    let g = '<rect x="-80" y="-80" width="260" height="260" fill="var(--map-bg)"/>';
    // parks & wetlands
    g += '<path d="M-40 18 C-10 10 10 22 20 26 C14 34 -10 36 -40 34Z" fill="var(--map-water)"/>';
    g += '<ellipse cx="60" cy="60" rx="7" ry="5" fill="var(--map-park)"/><ellipse cx="30" cy="80" rx="12" ry="7" fill="var(--map-park)"/>';
    g += '<ellipse cx="88" cy="40" rx="6" ry="9" fill="var(--map-park)"/><ellipse cx="20" cy="8" rx="14" ry="8" fill="var(--map-park)"/>';
    g += '<rect x="96" y="54" width="22" height="9" rx="2" fill="var(--map-airport)" transform="rotate(-18 107 58)"/>';
    // minor street grid
    let grid = '';
    for (let i = -60; i <= 160; i += 6) {
      grid += 'M' + i + ' -60 L' + (i + 4) + ' 160 ';
      grid += 'M-60 ' + i + ' L160 ' + (i - 3) + ' ';
    }
    g += '<path d="' + grid + '" stroke="var(--map-street)" stroke-width="1.2" vector-effect="non-scaling-stroke" fill="none"/>';
    // main roads (casing + fill)
    const d = ROADS.map((r) => 'M' + r.map((p) => p.join(' ')).join(' L')).join(' ');
    g += '<path d="' + d + '" stroke="var(--map-road-edge)" stroke-width="7" vector-effect="non-scaling-stroke" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
    g += '<path d="' + d + '" stroke="var(--map-road)" stroke-width="5" vector-effect="non-scaling-stroke" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
    g += AREAS.map((a) => '<text x="' + a.x + '" y="' + a.y + '" class="map-label" font-size="' + (2.4 * s) + '">' + a.name + '</text>').join('');
    return g;
  }

  function ambMarker(a, s, o) {
    const color = EAMS.UI.ambColor(a);
    const pos = EAMS.Store.ambPos(a);
    const trip = a.trip ? ' data-trip=\'' + JSON.stringify({ r: a.trip.route, s: a.trip.start, e: a.trip.end }) + '\'' : '';
    const big = o.highlightAmb === a.id;
    const k = s * (big ? 1.35 : 1);
    return '<g class="map-amb' + (big ? ' me' : '') + '"' + trip + ' style="transform:translate(' + pos.x + 'px,' + pos.y + 'px)"><g transform="scale(' + k + ')">' +
      (big ? '<circle r="5" fill="' + color + '" opacity=".18" class="pulse-ring"/>' : '') +
      '<circle r="2.7" fill="' + color + '" stroke="#fff" stroke-width=".7"/>' +
      '<svg x="-1.6" y="-1.6" width="3.2" height="3.2" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">' + EAMS.Icons.ambulance + '</svg>' +
      (o.labels !== false ? '<text y="-3.8" class="map-tag" font-size="2.2">' + esc(a.id) + '</text>' : '') +
      '</g><title>' + esc(a.id + ' – ' + (a.disabled ? 'out of service' : a.status)) + '</title></g>';
  }
  function pin(x, y, s, color, label, pulse) {
    return '<g class="map-pin" transform="translate(' + x + ' ' + y + ') scale(' + s + ')">' +
      (pulse ? '<circle r="3" fill="' + color + '" opacity=".25" class="pulse-ring"/>' : '') +
      '<ellipse cx="0" cy="0" rx="1.6" ry=".6" fill="rgba(0,0,0,.2)"/>' +
      '<path d="M0 0 C-1 -2 -3.2 -3.6 -3.2 -6 A3.2 3.2 0 1 1 3.2 -6 C3.2 -3.6 1 -2 0 0Z" fill="' + color + '" stroke="#fff" stroke-width=".6"/>' +
      '<circle cy="-6" r="1.2" fill="#fff"/>' + (label ? '<text y="-10.2" class="map-tag" font-size="2.2">' + esc(label) + '</text>' : '') + '</g>';
  }
  function hospMarker(h, s, o) {
    const full = h.beds.emergency <= 0;
    const sel = o.highlightHosp === h.id;
    return '<g class="map-hosp" transform="translate(' + h.x + ' ' + h.y + ') scale(' + s * (sel ? 1.3 : 1) + ')">' +
      '<rect x="-2.6" y="-2.6" width="5.2" height="5.2" rx="1.3" fill="#fff" stroke="' + (full ? '#94A3B8' : '#1B5E20') + '" stroke-width=".6"/>' +
      '<path d="M0 -1.6 V1.6 M-1.6 0 H1.6" stroke="' + (full ? '#94A3B8' : '#C62828') + '" stroke-width=".9" stroke-linecap="round"/>' +
      (o.labels !== false ? '<text y="5.4" class="map-tag" font-size="2">' + esc(h.short) + (full ? ' (full)' : '') + '</text>' : '') +
      '<title>' + esc(h.name + ' – ' + h.beds.emergency + ' emergency beds free') + '</title></g>';
  }

  /**
   * render(o)
   *  o.focus: [{x,y}] points to fit (default: whole city)
   *  o.ambulances, o.hospitals, o.emergencies [{x,y,priority,id}], o.route {points}, o.dest {x,y,label}, o.pickup {x,y}
   *  o.highlightAmb, o.highlightHosp, o.pickAction (click → data-action), o.cls, o.label (aria)
   */
  function render(o = {}) {
    let vb = [0, 4, 100, 92];
    if (o.focus && o.focus.length) {
      const xs = o.focus.map((p) => p.x), ys = o.focus.map((p) => p.y);
      const pad = o.pad || 9;
      let x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad, y0 = Math.min(...ys) - pad, y1 = Math.max(...ys) + pad;
      const minSpan = o.minSpan || 22;
      if (x1 - x0 < minSpan) { const c = (x0 + x1) / 2; x0 = c - minSpan / 2; x1 = c + minSpan / 2; }
      if (y1 - y0 < minSpan) { const c = (y0 + y1) / 2; y0 = c - minSpan / 2; y1 = c + minSpan / 2; }
      vb = [x0, y0, x1 - x0, y1 - y0];
    }
    const s = Math.max(vb[2], vb[3]) / 100 * (o.markerScale || 1);
    let svg = '<svg class="map-svg ' + (o.cls || '') + '" viewBox="' + vb.map((v) => v.toFixed(2)).join(' ') + '" preserveAspectRatio="xMidYMid ' + (o.slice ? 'slice' : 'meet') + '" role="img" aria-label="' + esc(o.label || 'Map of Kigali') + '"' +
      (o.pickAction ? ' data-action="' + o.pickAction + '" style="cursor:crosshair"' : '') + '>';
    svg += base(s);
    if (o.route && o.route.points) {
      const d = 'M' + o.route.points.map((p) => p.x + ' ' + p.y).join(' L');
      svg += '<path d="' + d + '" stroke="#fff" stroke-width="9" vector-effect="non-scaling-stroke" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
      svg += '<path d="' + d + '" stroke="' + (o.route.color || '#1B5E20') + '" stroke-width="5" vector-effect="non-scaling-stroke" fill="none" stroke-linecap="round" stroke-linejoin="round"' + (o.route.dashed ? ' stroke-dasharray="2 8"' : '') + '/>';
    }
    (o.hospitals || []).forEach((h) => { svg += hospMarker(h, s, o); });
    (o.emergencies || []).forEach((e) => { svg += pin(e.x, e.y, s * 0.85, e.priority === 'critical' ? '#E05252' : e.priority === 'urgent' ? '#EA7A1E' : '#2E7D32', o.labels === false ? '' : e.id, e.priority === 'critical'); });
    if (o.pickup) svg += pin(o.pickup.x, o.pickup.y, s, '#E05252', o.pickup.label || '', true);
    if (o.dest) svg += pin(o.dest.x, o.dest.y, s, '#E05252', o.dest.label || '', false);
    (o.ambulances || []).forEach((a) => { svg += ambMarker(a, s, o); });
    svg += '</svg>';
    return svg;
  }

  function Legend() {
    return '<div class="map-legend" aria-label="Map legend">' +
      '<span><i class="lg-dot" style="background:#1B5E20"></i>Available</span>' +
      '<span><i class="lg-dot" style="background:#EA7A1E"></i>Busy / on the way</span>' +
      '<span><i class="lg-dot" style="background:#94A3B8"></i>Out of service</span>' +
      '<span><i class="lg-pin"></i>Emergency</span>' +
      '<span><i class="lg-hosp">+</i>Hospital</span></div>';
  }

  /** Convert a click on the SVG to map coordinates. */
  function toMapPoint(svgEl, ev) {
    const pt = svgEl.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
    const p = pt.matrixTransform(svgEl.getScreenCTM().inverse());
    return { x: +p.x.toFixed(1), y: +p.y.toFixed(1) };
  }

  return { render, Legend, toMapPoint };
})();
