/* Top-level orchestration: search, chips, render, dispatch to view modules. */
(function () {
  const state = {
    seeds: [],          // [{id, name}]
    nodes: [],
    edges: [],
    selectedPid: null,
  };

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

  function showSuggestions(rows) {
    if (!rows || rows.length === 0) {
      els.searchSuggest.classList.remove("show");
      els.searchSuggest.innerHTML = "";
      return;
    }
    els.searchSuggest.innerHTML = rows
      .map((r, i) => {
        const yr = r.birth_year || r.death_year
          ? `${r.birth_year ?? "?"}–${r.death_year ?? "?"}`
          : (r.index_year ? String(r.index_year) : "");
        const altNote = r.alt_name_chn ? ` 字號:${r.alt_name_chn}` : "";
        return `<li data-idx="${i}" role="option">
          <span class="suggest-name">${r.name_chn || "—"}</span>
          <span class="suggest-meta">
            ${r.dynasty_chn || ""}
            ${yr ? " · " + yr : ""}
            ${r.index_addr_chn ? " · " + r.index_addr_chn : ""}
            ${altNote}
          </span>
        </li>`;
      })
      .join("");
    els.searchSuggest.classList.add("show");
    activeSugIdx = -1;
    [...els.searchSuggest.querySelectorAll("li")].forEach((li, i) => {
      li.addEventListener("mousedown", (e) => {
        e.preventDefault();
        addSeed(rows[i]);
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
        showSuggestions(data.results || []);
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

  // --- wire view callbacks ---
  networkView.onSelect((d) => selectPerson(d.id));
  detailView.onNav((pid) => {
    selectPerson(pid);
    // also lazily add to seeds? keep no-op so user has to click "render" again
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
