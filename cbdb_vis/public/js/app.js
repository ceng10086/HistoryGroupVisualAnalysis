/* Top-level orchestration: search, chips, render, dispatch to view modules. */
(function () {
  const state = {
    seeds: [],          // [{id, name}]
    nodes: [],
    edges: [],
    selectedPid: null,
  };

  function escapeHtml(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function isValidYear(y) {
    const n = Number(y);
    return Number.isInteger(n) && n !== 0 && n !== -9999 && n !== 32767 && n <= 2100 && n >= -3000;
  }

  function fmtYearRange(start, end) {
    if (isValidYear(start) || isValidYear(end)) {
      return `${isValidYear(start) ? start : "?"}–${isValidYear(end) ? end : "?"}`;
    }
    return "";
  }

  const els = {
    seedChips: document.getElementById("seed-chips"),
    searchInput: document.getElementById("search-input"),
    searchSuggest: document.getElementById("search-suggest"),
    btnRender: document.getElementById("btn-render"),
    btnClear: document.getElementById("btn-clear"),
    btnFit: document.getElementById("btn-fit"),
    presetSelect: document.getElementById("preset-select"),
    depthSelect: document.getElementById("depth-select"),
    capSelect: document.getElementById("cap-select"),
    labelDensity: document.getElementById("label-density"),
    netSearch: document.getElementById("net-search"),
    netStatus: document.getElementById("network-status"),
    timelineHint: document.getElementById("timeline-hint"),
  };

  // --- chips ---
  function renderChips() {
    els.seedChips.innerHTML = "";
    if (state.seeds.length === 0) {
      els.seedChips.innerHTML = `<span style="color:#8b7a5d;padding:4px 8px">（請添加中心人物）</span>`;
      return;
    }
    state.seeds.forEach((s) => {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.innerHTML = `${s.name}<span class="chip-x" title="移除">×</span>`;
      chip.querySelector(".chip-x").addEventListener("click", () => {
        state.seeds = state.seeds.filter((x) => x.id !== s.id);
        renderChips();
      });
      els.seedChips.appendChild(chip);
    });
  }

  function addSeed(person) {
    if (state.seeds.find((s) => s.id === person.id)) return;
    state.seeds.push({ id: person.id, name: person.name_chn || person.name || `#${person.id}` });
    renderChips();
  }

  // --- search & suggestions ---
  let searchTimer = null;
  let activeSugIdx = -1;

  function showSuggestions(rows, query = "") {
    if (!rows || rows.length === 0) {
      if (!query) {
        els.searchSuggest.classList.remove("show");
        els.searchSuggest.innerHTML = "";
        return;
      }
      rows = [{
        source: "llm_prompt",
        query,
        name_chn: `AI 查詢「${query}」`,
        meta: "CBDB 無結果，使用 DeepSeek 補充人物資料",
      }];
    }
    els.searchSuggest.innerHTML = rows
      .map((r, i) => {
        if (r.source === "llm_prompt") {
          return `<li data-idx="${i}" role="option" class="suggest-ai">
            <span class="suggest-name">${escapeHtml(r.name_chn)}</span>
            <span class="suggest-meta">${escapeHtml(r.meta)}</span>
          </li>`;
        }
        const yr = fmtYearRange(r.birth_year, r.death_year)
          || (isValidYear(r.index_year) ? String(r.index_year) : "");
        const altNote = r.alt_name_chn ? ` 字號:${r.alt_name_chn}` : "";
        return `<li data-idx="${i}" role="option">
          <span class="suggest-name">${escapeHtml(r.name_chn || "—")}</span>
          <span class="suggest-meta">
            ${escapeHtml(r.dynasty_chn || "")}
            ${yr ? " · " + escapeHtml(yr) : ""}
            ${r.index_addr_chn ? " · " + escapeHtml(r.index_addr_chn) : ""}
            ${escapeHtml(altNote)}
          </span>
        </li>`;
      })
      .join("");
    els.searchSuggest.classList.add("show");
    activeSugIdx = -1;
    [...els.searchSuggest.querySelectorAll("li")].forEach((li, i) => {
      li.addEventListener("mousedown", (e) => {
        e.preventDefault();
        if (rows[i].source === "llm_prompt") {
          lookupLlmPerson(rows[i].query);
        } else {
          addSeed(rows[i]);
        }
        els.searchInput.value = "";
        els.searchSuggest.classList.remove("show");
      });
    });
  }

  els.searchInput.addEventListener("input", () => {
    const q = els.searchInput.value.trim();
    clearTimeout(searchTimer);
    if (!q) { els.searchSuggest.classList.remove("show"); return; }
    searchTimer = setTimeout(async () => {
      try {
        const data = await api.search(q);
        showSuggestions(data.results || [], q);
      } catch (e) { console.error(e); }
    }, 200);
  });
  els.searchInput.addEventListener("blur", () =>
    setTimeout(() => els.searchSuggest.classList.remove("show"), 120)
  );
  els.searchInput.addEventListener("focus", () => {
    if (els.searchSuggest.children.length) els.searchSuggest.classList.add("show");
  });
  els.searchInput.addEventListener("keydown", (ev) => {
    const items = [...els.searchSuggest.querySelectorAll("li")];
    if (ev.key === "ArrowDown" && items.length) {
      ev.preventDefault();
      activeSugIdx = (activeSugIdx + 1) % items.length;
      items.forEach((li, i) => li.classList.toggle("active", i === activeSugIdx));
    } else if (ev.key === "ArrowUp" && items.length) {
      ev.preventDefault();
      activeSugIdx = (activeSugIdx - 1 + items.length) % items.length;
      items.forEach((li, i) => li.classList.toggle("active", i === activeSugIdx));
    } else if (ev.key === "Enter") {
      if (activeSugIdx >= 0 && items[activeSugIdx]) {
        items[activeSugIdx].dispatchEvent(new Event("mousedown"));
      } else {
        // pick first suggestion if any
        items[0] && items[0].dispatchEvent(new Event("mousedown"));
      }
    } else if (ev.key === "Escape") {
      els.searchSuggest.classList.remove("show");
    }
  });

  els.btnClear.addEventListener("click", () => {
    state.seeds = [];
    renderChips();
  });

  // --- presets ---
  async function loadPresets() {
    try {
      const data = await api.presets();
      (data.items || []).forEach((p) => {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.title;
        opt.dataset.preset = JSON.stringify(p);
        els.presetSelect.appendChild(opt);
      });
    } catch (e) { console.error(e); }
  }
  els.presetSelect.addEventListener("change", () => {
    const opt = els.presetSelect.selectedOptions[0];
    if (!opt || !opt.dataset.preset) return;
    const p = JSON.parse(opt.dataset.preset);
    state.seeds = p.seeds.map((s) => ({ id: s.id, name: s.name }));
    renderChips();
    render();
  });

  // --- main render pipeline ---
  async function render() {
    if (state.seeds.length === 0) {
      els.netStatus.textContent = "請選擇/搜索中心人物";
      return;
    }
    const seedIds = state.seeds.map((s) => s.id);
    const depth = Number(els.depthSelect.value) || 1;
    const cap = Number(els.capSelect.value) || 120;
    els.netStatus.textContent = "載入中…";

    try {
      const net = await api.network(seedIds, depth, cap);
      state.nodes = net.nodes;
      state.edges = net.edges;
      networkView.setData(structuredClone(net.nodes), structuredClone(net.edges));

      const ids = net.nodes.map((n) => n.id);
      const [identity, geo] = await Promise.all([
        api.identity(ids),
        api.geo(ids),
      ]);
      identityView.setData(identity.items || []);
      geoView.setData(geo.clusters || []);

      // Default the timeline to the first seed
      if (state.seeds[0]) await selectPerson(state.seeds[0].id);

      els.netStatus.textContent =
        `共 ${net.nodes.length} 位人物 / ${net.edges.length} 條關係` +
        (net.truncated ? `（已達節點上限，部分鄰居未顯示，可調高上限）` : "");
    } catch (e) {
      console.error(e);
      els.netStatus.textContent = "載入失敗：" + (e.message || e);
    }
  }

  async function selectPerson(pid) {
    if (!pid) return;
    state.selectedPid = pid;
    try {
      const [person, timeline] = await Promise.all([
        api.person(pid),
        api.timeline(pid),
      ]);
      detailView.setData(person);
      timelineView.setData(timeline);
      els.timelineHint.textContent = `當前：${person.name_chn || "#"+pid}`;
    } catch (e) {
      console.error(e);
    }
  }

  function timelineFromLlmPerson(person) {
    const items = [];
    if (isValidYear(person.birth_year)) {
      items.push({
        year: person.birth_year,
        type: "birth",
        label: "出生",
        detail: `${person.name_chn || ""} 生於 ${person.birth_year} 年`,
      });
    }
    if (isValidYear(person.death_year)) {
      items.push({
        year: person.death_year,
        type: "death",
        label: "卒",
        detail: `${person.name_chn || ""} 卒於 ${person.death_year} 年`,
      });
    }
    (person.entries || []).forEach((e) => {
      if (!isValidYear(e.year)) return;
      items.push({
        year: e.year,
        type: "entry",
        label: e.desc_chn || "入仕",
        detail: e.exam_field ? `${e.desc_chn || "入仕"}（${e.exam_field}）` : (e.desc_chn || "入仕"),
      });
    });
    (person.offices || []).forEach((o) => {
      const year = o.first_year ?? o.last_year;
      if (!isValidYear(year)) return;
      items.push({
        year,
        type: "office",
        label: o.office_chn || "任職",
        detail: o.office_chn || "任職",
      });
    });
    (person.events || []).forEach((ev) => {
      if (!isValidYear(ev.year)) return;
      items.push({
        year: ev.year,
        type: "event",
        label: ev.name_chn || "事件",
        detail: ev.event_text || ev.name_chn || "事件",
      });
    });
    items.sort((a, b) => a.year - b.year);
    return { person, items };
  }

  async function lookupLlmPerson(query) {
    const q = String(query || "").trim();
    if (!q) return;
    els.netStatus.textContent = `AI 查詢「${q}」中…`;
    detailView.setLoading(`DeepSeek 正在補充「${q}」…`);
    timelineView.setData({ person: { name_chn: q }, items: [] });
    try {
      const result = await api.llmPerson(q);
      if (!result.found) {
        detailView.setLoading(`未能可靠確認「${q}」的人物資料`);
        els.netStatus.textContent = `CBDB 未命中，AI 亦未能可靠確認「${q}」`;
        return;
      }
      detailView.setData(result.person);
      timelineView.setData(timelineFromLlmPerson(result.person));
      els.timelineHint.textContent = `AI 補充：${result.person.name_chn || q}`;
      els.netStatus.textContent = "CBDB 未命中，已顯示 AI 補充資料；不納入網絡計算";
    } catch (e) {
      console.error(e);
      detailView.setLoading("AI 查詢失敗：" + (e.message || e));
      els.netStatus.textContent = "AI 查詢失敗：" + (e.message || e);
    }
  }

  // --- wire view callbacks ---
  networkView.onSelect((d) => selectPerson(d.id));
  detailView.onNav((pid) => {
    selectPerson(pid);
    // also lazily add to seeds? keep no-op so user has to click "render" again
  });
  detailView.onSupplement(async (pid) => {
    detailView.setSupplementLoading();
    try {
      const supplement = await api.llmSupplement(pid);
      detailView.setLlmSupplement(supplement);
    } catch (e) {
      console.error(e);
      detailView.setSupplementError(e.message || e);
    }
  });

  // --- buttons ---
  els.btnRender.addEventListener("click", render);
  els.btnFit.addEventListener("click", () => networkView.fit());
  els.labelDensity.addEventListener("change", () =>
    networkView.setLabelMode(els.labelDensity.value));

  let netSearchTimer = null;
  els.netSearch.addEventListener("input", () => {
    clearTimeout(netSearchTimer);
    netSearchTimer = setTimeout(
      () => networkView.setSearch(els.netSearch.value),
      120
    );
  });

  // --- boot ---
  function boot() {
    networkView.init("network");
    identityView.init("identity");
    geoView.init("geo");
    timelineView.init("timeline");
    detailView.init("detail");
    renderChips();
    loadPresets();
  }

  document.addEventListener("DOMContentLoaded", boot);
  // also boot immediately if DOM already parsed (e.g. when this script is at end of body)
  if (document.readyState !== "loading") boot();
})();
