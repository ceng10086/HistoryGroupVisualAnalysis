/* Single-person life-ribbon timeline, rendered as SVG (no ECharts). */
window.timelineView = (() => {
  let container;
  let lastPayload = null;
  let tooltipEl = null;

  const TYPE_META = {
    birth:  { color: "#d4a017", label: "出生", shape: "ring" },
    death:  { color: "#3a322a", label: "卒",   shape: "endbar" },
    entry:  { color: "#2f6fab", label: "入仕", shape: "diamond" },
    office: { color: "#5b8a6e", label: "任職", shape: "tick" },
    event:  { color: "#b8341d", label: "事件", shape: "circle" },
  };

  // Person ribbon color rotation, based on which seed slot they take.
  const RIBBON_PALETTE = ["#b85f3a", "#c49b3f", "#5b8a6e", "#7d6aa6", "#3b6ea5", "#a07c4d"];

  function init(containerId) {
    container = document.getElementById(containerId);
    container.classList.add("timeline-ribbon-root");
    tooltipEl = document.createElement("div");
    tooltipEl.className = "tooltip tl-tooltip";
    tooltipEl.style.display = "none";
    container.appendChild(tooltipEl);
    let raf = null;
    window.addEventListener("resize", () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => { if (lastPayload) setData(lastPayload); });
    });
  }

  function clearAndShowMessage(msg) {
    container.querySelectorAll("svg, .timeline-empty").forEach((n) => n.remove());
    const m = document.createElement("div");
    m.className = "timeline-empty";
    m.textContent = msg;
    container.appendChild(m);
  }

  function escapeHtml(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function showTooltip(ev, it) {
    const meta = TYPE_META[it.type] || TYPE_META.event;
    tooltipEl.innerHTML = `
      <div style="max-width:280px">
        <b style="color:${meta.color}">${meta.label}</b>
        <span style="opacity:.75;margin-left:6px">${it.year}</span>
        <div style="margin-top:4px;white-space:normal">${escapeHtml(it.detail || it.label)}</div>
      </div>`;
    tooltipEl.style.display = "block";
    moveTooltip(ev);
  }
  function moveTooltip(ev) {
    const r = container.getBoundingClientRect();
    let x = ev.clientX - r.left + 12;
    let y = ev.clientY - r.top + 12;
    // keep inside container
    const tw = tooltipEl.offsetWidth || 220;
    const th = tooltipEl.offsetHeight || 60;
    if (x + tw > r.width - 6) x = ev.clientX - r.left - tw - 12;
    if (y + th > r.height - 6) y = ev.clientY - r.top - th - 12;
    tooltipEl.style.left = x + "px";
    tooltipEl.style.top = y + "px";
  }
  function hideTooltip() { tooltipEl.style.display = "none"; }

  function setData(payload) {
    if (!container) return;
    lastPayload = payload;

    // wipe existing chart but preserve tooltip element
    container.querySelectorAll("svg, .timeline-empty").forEach((n) => n.remove());

    if (!payload || !payload.items || payload.items.length === 0) {
      clearAndShowMessage(payload && payload.person
        ? `${payload.person.name_chn || ""} 暫無年表事件`
        : "暫無年表數據");
      return;
    }

    const person = payload.person || {};
    const items = payload.items || [];

    // Year range: prefer birth/death; otherwise expand from event years.
    const yearsFromEvents = items.map((i) => i.year).filter((y) => y != null);
    if (yearsFromEvents.length === 0) {
      clearAndShowMessage(`${person.name_chn || ""} 暫無年表事件`);
      return;
    }
    let lo = Math.min(...yearsFromEvents, person.birth_year ?? Infinity);
    let hi = Math.max(...yearsFromEvents, person.death_year ?? -Infinity);
    if (!isFinite(lo)) lo = Math.min(...yearsFromEvents);
    if (!isFinite(hi)) hi = Math.max(...yearsFromEvents);
    if (lo === hi) { lo -= 5; hi += 5; }
    const span = hi - lo;
    const pad = Math.max(2, Math.ceil(span * 0.05));
    lo -= pad; hi += pad;

    // Geometry
    const W = container.clientWidth || 600;
    const H = Math.max(220, container.clientHeight || 260);
    const M = { left: 96, right: 28, top: 36, bottom: 30 };
    const innerW = Math.max(80, W - M.left - M.right);
    const innerH = H - M.top - M.bottom;
    const ribbonH = Math.min(28, Math.max(20, innerH * 0.20));
    const ribbonY = M.top + innerH / 2 - ribbonH / 2;
    const ribbonCY = ribbonY + ribbonH / 2;

    const xOf = (year) => M.left + ((year - lo) / (hi - lo)) * innerW;

    // Pick a ribbon color (deterministic per personId)
    const colorIdx = ((person.id || 0) % RIBBON_PALETTE.length + RIBBON_PALETTE.length) % RIBBON_PALETTE.length;
    const ribbonColor = RIBBON_PALETTE[colorIdx];

    // Build SVG
    const svgNs = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNs, "svg");
    svg.setAttribute("class", "tl-svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.style.width = "100%";
    svg.style.height = "100%";

    // ─── Background paper texture (subtle dots) ──────────────────────────────
    const defs = document.createElementNS(svgNs, "defs");
    const pat = document.createElementNS(svgNs, "pattern");
    pat.setAttribute("id", "tl-paper");
    pat.setAttribute("width", "8");
    pat.setAttribute("height", "8");
    pat.setAttribute("patternUnits", "userSpaceOnUse");
    const dot = document.createElementNS(svgNs, "circle");
    dot.setAttribute("cx", "1"); dot.setAttribute("cy", "1");
    dot.setAttribute("r", "0.6"); dot.setAttribute("fill", "rgba(184,138,68,0.25)");
    pat.appendChild(dot);
    defs.appendChild(pat);

    // ribbon linear gradient for slight warmth
    const grad = document.createElementNS(svgNs, "linearGradient");
    grad.setAttribute("id", `tl-grad-${person.id}`);
    grad.setAttribute("x1", "0"); grad.setAttribute("x2", "0");
    grad.setAttribute("y1", "0"); grad.setAttribute("y2", "1");
    const s1 = document.createElementNS(svgNs, "stop");
    s1.setAttribute("offset", "0%");
    s1.setAttribute("stop-color", lighten(ribbonColor, 14));
    const s2 = document.createElementNS(svgNs, "stop");
    s2.setAttribute("offset", "100%");
    s2.setAttribute("stop-color", darken(ribbonColor, 10));
    grad.appendChild(s1); grad.appendChild(s2);
    defs.appendChild(grad);
    svg.appendChild(defs);

    const bg = document.createElementNS(svgNs, "rect");
    bg.setAttribute("x", "0"); bg.setAttribute("y", "0");
    bg.setAttribute("width", W); bg.setAttribute("height", H);
    bg.setAttribute("fill", "url(#tl-paper)");
    svg.appendChild(bg);

    // ─── Year axis (faint decadal grid) ──────────────────────────────────────
    const axisG = document.createElementNS(svgNs, "g");
    axisG.setAttribute("class", "tl-axis");
    const tickStart = Math.ceil(lo / 10) * 10;
    for (let y = tickStart; y <= hi; y += 10) {
      const xx = xOf(y);
      const v = document.createElementNS(svgNs, "line");
      v.setAttribute("x1", xx); v.setAttribute("x2", xx);
      v.setAttribute("y1", M.top - 6); v.setAttribute("y2", H - M.bottom + 4);
      v.setAttribute("stroke", "rgba(184,138,68,0.25)");
      v.setAttribute("stroke-dasharray", "2 4");
      axisG.appendChild(v);
      const t = document.createElementNS(svgNs, "text");
      t.setAttribute("x", xx); t.setAttribute("y", H - M.bottom + 18);
      t.setAttribute("text-anchor", "middle");
      t.setAttribute("class", "tl-year-label");
      t.textContent = String(y);
      axisG.appendChild(t);
    }
    svg.appendChild(axisG);

    // ─── Avatar + name (left margin) ─────────────────────────────────────────
    const avatarG = document.createElementNS(svgNs, "g");
    avatarG.setAttribute("class", "tl-avatar");
    const avatarCx = 40, avatarCy = ribbonCY;
    const avatarR = Math.min(26, Math.max(18, ribbonH * 0.95));
    const a1 = document.createElementNS(svgNs, "circle");
    a1.setAttribute("cx", avatarCx); a1.setAttribute("cy", avatarCy);
    a1.setAttribute("r", avatarR + 2);
    a1.setAttribute("fill", "#f8eed1");
    a1.setAttribute("stroke", ribbonColor); a1.setAttribute("stroke-width", "2");
    avatarG.appendChild(a1);
    const a2 = document.createElementNS(svgNs, "circle");
    a2.setAttribute("cx", avatarCx); a2.setAttribute("cy", avatarCy);
    a2.setAttribute("r", avatarR);
    a2.setAttribute("fill", `url(#tl-grad-${person.id})`);
    avatarG.appendChild(a2);
    const initial = (person.name_chn || "?").trim().slice(0, 1);
    const ai = document.createElementNS(svgNs, "text");
    ai.setAttribute("x", avatarCx); ai.setAttribute("y", avatarCy);
    ai.setAttribute("text-anchor", "middle");
    ai.setAttribute("dominant-baseline", "central");
    ai.setAttribute("class", "tl-avatar-initial");
    ai.setAttribute("fill", "#fbf6ec");
    ai.textContent = initial;
    avatarG.appendChild(ai);

    // Name + lifespan
    const nameY = avatarCy + avatarR + 18;
    const nameT = document.createElementNS(svgNs, "text");
    nameT.setAttribute("x", avatarCx); nameT.setAttribute("y", nameY);
    nameT.setAttribute("text-anchor", "middle");
    nameT.setAttribute("class", "tl-name");
    nameT.textContent = person.name_chn || `#${person.id}`;
    avatarG.appendChild(nameT);

    if (person.birth_year || person.death_year) {
      const lifeT = document.createElementNS(svgNs, "text");
      lifeT.setAttribute("x", avatarCx); lifeT.setAttribute("y", nameY + 14);
      lifeT.setAttribute("text-anchor", "middle");
      lifeT.setAttribute("class", "tl-life");
      lifeT.textContent = `${person.birth_year ?? "?"}–${person.death_year ?? "?"}`;
      avatarG.appendChild(lifeT);
    }
    svg.appendChild(avatarG);

    // ─── Ribbon body (from birth to death; falls back to event-span) ─────────
    const ribbonLo = person.birth_year ?? Math.min(...yearsFromEvents);
    const ribbonHi = person.death_year ?? Math.max(...yearsFromEvents);
    const rx = xOf(ribbonLo);
    const rxEnd = xOf(ribbonHi);

    // background "shadow" pass for depth
    const shadow = document.createElementNS(svgNs, "rect");
    shadow.setAttribute("x", rx - 2);
    shadow.setAttribute("y", ribbonY + 3);
    shadow.setAttribute("width", Math.max(4, rxEnd - rx + 4));
    shadow.setAttribute("height", ribbonH);
    shadow.setAttribute("rx", ribbonH / 2);
    shadow.setAttribute("ry", ribbonH / 2);
    shadow.setAttribute("fill", "rgba(60,40,10,0.10)");
    svg.appendChild(shadow);

    const ribbon = document.createElementNS(svgNs, "rect");
    ribbon.setAttribute("x", rx);
    ribbon.setAttribute("y", ribbonY);
    ribbon.setAttribute("width", Math.max(4, rxEnd - rx));
    ribbon.setAttribute("height", ribbonH);
    ribbon.setAttribute("rx", ribbonH / 2);
    ribbon.setAttribute("ry", ribbonH / 2);
    ribbon.setAttribute("fill", `url(#tl-grad-${person.id})`);
    svg.appendChild(ribbon);

    // birth marker (filled disc at left end)
    if (person.birth_year != null) {
      const b = document.createElementNS(svgNs, "circle");
      b.setAttribute("cx", rx);
      b.setAttribute("cy", ribbonCY);
      b.setAttribute("r", ribbonH * 0.42);
      b.setAttribute("fill", TYPE_META.birth.color);
      b.setAttribute("stroke", "#fbf6ec");
      b.setAttribute("stroke-width", 2);
      b.setAttribute("class", "tl-marker tl-birth");
      attachHover(b, {
        year: person.birth_year, type: "birth", label: "出生",
        detail: `${person.name_chn || ""} 生於 ${person.birth_year} 年`,
      });
      svg.appendChild(b);
    }
    // death marker (thick vertical bar)
    if (person.death_year != null) {
      const d = document.createElementNS(svgNs, "line");
      d.setAttribute("x1", rxEnd);
      d.setAttribute("x2", rxEnd);
      d.setAttribute("y1", ribbonY - 6);
      d.setAttribute("y2", ribbonY + ribbonH + 6);
      d.setAttribute("stroke", TYPE_META.death.color);
      d.setAttribute("stroke-width", 4);
      d.setAttribute("stroke-linecap", "round");
      d.setAttribute("class", "tl-marker tl-death");
      attachHover(d, {
        year: person.death_year, type: "death", label: "卒",
        detail: `${person.name_chn || ""} 卒於 ${person.death_year} 年`,
      });
      svg.appendChild(d);
    }

    // ─── Events on ribbon ───────────────────────────────────────────────────
    const events = items.filter((it) => it.type !== "birth" && it.type !== "death");

    // Bucket events that fall on the same x-pixel, distribute them above/below
    // the ribbon in alternating fashion to avoid overlap.
    const buckets = new Map(); // px -> [items]
    events.sort((a, b) => a.year - b.year || a.type.localeCompare(b.type));
    events.forEach((it) => {
      const px = Math.round(xOf(it.year));
      const arr = buckets.get(px) || [];
      arr.push(it);
      buckets.set(px, arr);
    });

    buckets.forEach((arr, px) => {
      arr.forEach((it, idx) => {
        const meta = TYPE_META[it.type] || TYPE_META.event;
        // alternating offset from the ribbon center
        const sign = idx % 2 === 0 ? -1 : 1;
        const lane = Math.floor(idx / 2) + 1;
        const off = sign * (ribbonH / 2 + 6 + lane * 9);
        const cy = ribbonCY + off;
        const node = makeMarker(meta.shape, px, cy, meta.color);
        node.setAttribute("class", `tl-marker tl-${it.type}`);
        attachHover(node, it);
        svg.appendChild(node);

        // small connector from ribbon to marker for clarity
        const stem = document.createElementNS(svgNs, "line");
        stem.setAttribute("x1", px);
        stem.setAttribute("x2", px);
        stem.setAttribute("y1", ribbonCY + (sign > 0 ? ribbonH / 2 : -ribbonH / 2));
        stem.setAttribute("y2", cy);
        stem.setAttribute("stroke", meta.color);
        stem.setAttribute("stroke-width", 1);
        stem.setAttribute("stroke-opacity", 0.55);
        svg.insertBefore(stem, node);
      });
    });

    // ─── Title (overlay, top-left) ───────────────────────────────────────────
    const title = document.createElementNS(svgNs, "text");
    title.setAttribute("x", M.left);
    title.setAttribute("y", M.top - 16);
    title.setAttribute("class", "tl-title");
    title.textContent = `${person.name_chn || ""}（${person.birth_year ?? "?"}–${person.death_year ?? "?"}） 年表`;
    svg.appendChild(title);

    // Legend (mini, top-right)
    const legend = document.createElementNS(svgNs, "g");
    legend.setAttribute("class", "tl-legend");
    const legendItems = [
      { type: "entry", label: "入仕" },
      { type: "office", label: "任職" },
      { type: "event", label: "事件" },
    ];
    let lx = W - M.right;
    legendItems.slice().reverse().forEach((li) => {
      const meta = TYPE_META[li.type];
      const t = document.createElementNS(svgNs, "text");
      t.setAttribute("x", lx);
      t.setAttribute("y", M.top - 16);
      t.setAttribute("text-anchor", "end");
      t.setAttribute("class", "tl-legend-text");
      t.setAttribute("fill", meta.color);
      t.textContent = li.label;
      svg.appendChild(t);
      const tw = (li.label.length * 12) + 12;
      const c = makeMarker(meta.shape, lx - tw + 2, M.top - 20, meta.color);
      svg.appendChild(c);
      lx -= tw + 18;
    });

    container.appendChild(svg);
  }

  function makeMarker(shape, cx, cy, color) {
    const svgNs = "http://www.w3.org/2000/svg";
    if (shape === "tick") {
      const l = document.createElementNS(svgNs, "line");
      l.setAttribute("x1", cx); l.setAttribute("x2", cx);
      l.setAttribute("y1", cy - 5); l.setAttribute("y2", cy + 5);
      l.setAttribute("stroke", color);
      l.setAttribute("stroke-width", 2.5);
      l.setAttribute("stroke-linecap", "round");
      return l;
    }
    if (shape === "diamond") {
      const p = document.createElementNS(svgNs, "polygon");
      const s = 5;
      p.setAttribute("points", `${cx},${cy - s} ${cx + s},${cy} ${cx},${cy + s} ${cx - s},${cy}`);
      p.setAttribute("fill", color);
      p.setAttribute("stroke", "#fbf6ec");
      p.setAttribute("stroke-width", 1);
      return p;
    }
    // default: filled circle
    const c = document.createElementNS(svgNs, "circle");
    c.setAttribute("cx", cx); c.setAttribute("cy", cy);
    c.setAttribute("r", 4.2);
    c.setAttribute("fill", color);
    c.setAttribute("stroke", "#fbf6ec");
    c.setAttribute("stroke-width", 1);
    return c;
  }

  function attachHover(el, item) {
    el.style.cursor = "pointer";
    el.addEventListener("mouseenter", (ev) => showTooltip(ev, item));
    el.addEventListener("mousemove", moveTooltip);
    el.addEventListener("mouseleave", hideTooltip);
  }

  // small color utils
  function clamp(n) { return Math.max(0, Math.min(255, n)); }
  function hexToRgb(h) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(h);
    return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : { r: 128, g: 128, b: 128 };
  }
  function rgbToHex({ r, g, b }) {
    return "#" + [r, g, b].map((v) => clamp(Math.round(v)).toString(16).padStart(2, "0")).join("");
  }
  function lighten(hex, pct) {
    const { r, g, b } = hexToRgb(hex);
    const f = pct / 100;
    return rgbToHex({ r: r + (255 - r) * f, g: g + (255 - g) * f, b: b + (255 - b) * f });
  }
  function darken(hex, pct) {
    const { r, g, b } = hexToRgb(hex);
    const f = pct / 100;
    return rgbToHex({ r: r * (1 - f), g: g * (1 - f), b: b * (1 - f) });
  }

  return { init, setData };
})();
