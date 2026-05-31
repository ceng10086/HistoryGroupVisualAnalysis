/* Right-side person detail panel renderer. */
window.detailView = (() => {
  let container;
  let onPersonNav = () => {};
  let onSupplementRequest = () => {};

  function init(containerId) { container = document.getElementById(containerId); }
  function onNav(fn) { onPersonNav = fn; }
  function onSupplement(fn) { onSupplementRequest = fn; }

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
  function fmtYear(y) {
    if (!isValidYear(y)) return "?";
    return y < 0 ? `前${-y}` : `${y}`;
  }
  function fmtRange(first, last) {
    if (!isValidYear(first) && !isValidYear(last)) return "";
    return isValidYear(first) && isValidYear(last) && first !== last
      ? `${fmtYear(first)}–${fmtYear(last)}`
      : fmtYear(isValidYear(first) ? first : last);
  }
  function fmtConfidence(value) {
    return ({ high: "高", medium: "中", low: "低" })[value] || "低";
  }

  const FIELD_LABELS = {
    birth_year: "生年",
    death_year: "卒年",
    dynasty_chn: "朝代",
    index_addr_chn: "籍貫",
    alt_names: "字號別名",
    statuses: "社會身份",
    addresses: "地址",
    entries: "入仕",
    offices: "仕宦",
    events: "事件",
    associations: "社會交往",
    kinships: "親屬關係",
  };

  function setEmpty() {
    container.innerHTML = `<div class="detail-empty">點擊網絡中的節點查看人物詳情</div>`;
  }

  function setLoading(message) {
    container.innerHTML = `<div class="detail-empty">${escapeHtml(message || "載入中…")}</div>`;
  }

  function renderTags(items, kind) {
    if (!items || !items.length) return "—";
    return `<div class="tag-list">${items
      .map((it) => `<span class="tag tag-${kind}">${escapeHtml(it)}</span>`)
      .join("")}</div>`;
  }

  function renderRelList(label, items, kind, initial = 12) {
    if (!items || !items.length) return "";
    const sectionId = `sec-${kind}-${Math.random().toString(36).slice(2, 8)}`;
    const rows = items.map((r, idx) => {
      const yr = isValidYear(r.first_year) || isValidYear(r.last_year)
        ? ` <span style="color:#8b7a5d;font-size:11px">(${fmtYear(r.first_year)}–${fmtYear(r.last_year)})</span>` : "";
      const name = r.person_chn || `#${r.person_id}`;
      const collapsed = idx >= initial ? ' data-collapsed="1"' : "";
      const nameHtml = r.person_id
        ? `<span class="linkish" data-pid="${r.person_id}">${escapeHtml(name)}</span>`
        : `<span>${escapeHtml(name)}</span>`;
      return `<li${collapsed}>
        <span style="color:#8b7a5d">${escapeHtml(r.desc_chn || "")}：</span>
        ${nameHtml}
        ${r.dynasty_chn ? `<span style="color:#8b7a5d;font-size:11px"> · ${escapeHtml(r.dynasty_chn)}</span>` : ""}
        ${yr}
      </li>`;
    }).join("");
    const expandBtn = items.length > initial
      ? `<li class="expand-toggle" data-section="${sectionId}" data-mode="expand"
            style="list-style:none;color:var(--accent);cursor:pointer;text-decoration:underline dotted;font-size:12px;margin-top:2px">
            ▾ 展開全部（還有 ${items.length - initial} 條）
         </li>`
      : "";
    return `<div class="detail-section" id="${sectionId}">
      <div class="detail-section-h">${label} <span style="color:#8b7a5d;font-weight:400;font-size:11px">(${items.length})</span></div>
      <ul class="detail-list">${rows}${expandBtn}</ul>
    </div>`;
  }

  function renderSimpleList(label, items, formatter) {
    if (!items || !items.length) return "";
    return `<div class="llm-subsection">
      <div class="detail-section-h">${escapeHtml(label)}</div>
      <ul class="detail-list">${items.map((it) => `<li>${formatter(it)}</li>`).join("")}</ul>
    </div>`;
  }

  function renderMissingBox(p) {
    const missing = (p.missing_fields || []).map((f) => FIELD_LABELS[f] || f);
    if (!missing.length) return "";
    const disabled = p.llm_available ? "" : " disabled";
    const hint = p.llm_available
      ? "CBDB 中以下欄位缺失，可按需使用 DeepSeek 補充。"
      : "未設定 DEEPSEEK_API_KEY，暫不能使用 AI 補充。";
    return `<div class="detail-section llm-box">
      <div class="llm-box-head">
        <span class="llm-badge">AI 補充</span>
        <button class="btn btn-ghost btn-sm" data-llm-supplement="${p.id}"${disabled}>補充缺失欄位</button>
      </div>
      <div class="llm-hint">${escapeHtml(hint)}</div>
      <div class="llm-missing">${missing.map((m) => `<span>${escapeHtml(m)}</span>`).join("")}</div>
      <div id="llm-supplement-body" class="llm-supplement-body"></div>
    </div>`;
  }

  function renderLlmMeta(p) {
    if (p.source !== "llm") return "";
    const meta = p.llm_meta || {};
    const warnings = meta.warnings && meta.warnings.length
      ? `<div class="llm-warnings">${meta.warnings.map((w) => `<div>注意：${escapeHtml(w)}</div>`).join("")}</div>`
      : "";
    return `<div class="detail-section llm-box">
      <div class="llm-box-head">
        <span class="llm-badge">DeepSeek 補充</span>
        <span class="llm-confidence">可信度：${fmtConfidence(meta.confidence)}</span>
      </div>
      <div class="llm-hint">${escapeHtml(meta.note || "此資料由 AI 補充，需由研究者核驗。")}</div>
      ${warnings}
    </div>`;
  }

  function renderSummary(p) {
    if (!p.summary) return "";
    return `<div class="detail-section">
      <div class="detail-section-h">人物概述</div>
      <div class="detail-summary">${escapeHtml(p.summary)}</div>
    </div>`;
  }

  function renderEntries(entries) {
    return renderSimpleList("入仕", entries, (e) => {
      const year = e.year != null ? `<span style="color:#8b7a5d">${fmtYear(e.year)}：</span>` : "";
      const field = e.exam_field ? ` <span style="color:#8b7a5d;font-size:11px">· ${escapeHtml(e.exam_field)}</span>` : "";
      return `${year}${escapeHtml(e.desc_chn || "入仕")}${field}`;
    });
  }

  function renderEvents(events) {
    return renderSimpleList("事件", events, (e) => {
      const year = e.year != null ? `<span style="color:#8b7a5d">${fmtYear(e.year)}：</span>` : "";
      const addr = e.addr_chn ? ` <span style="color:#8b7a5d;font-size:11px">· ${escapeHtml(e.addr_chn)}</span>` : "";
      return `${year}${escapeHtml(e.event_text || e.name_chn || "事件")}${addr}`;
    });
  }

  function renderSupplementContent(payload) {
    if (!payload || payload.skipped) {
      return `<div class="llm-hint">${escapeHtml(payload && payload.message || "無需補充。")}</div>`;
    }
    const sup = payload.supplement || {};
    const facts = [];
    if (isValidYear(sup.birth_year)) facts.push(["生年", fmtYear(sup.birth_year)]);
    if (isValidYear(sup.death_year)) facts.push(["卒年", fmtYear(sup.death_year)]);
    if (sup.dynasty_chn) facts.push(["朝代", sup.dynasty_chn]);
    if (sup.index_addr_chn) facts.push(["籍貫", sup.index_addr_chn]);
    const factHtml = facts.length
      ? `<div class="llm-facts">${facts.map(([k, v]) =>
          `<div><span>${escapeHtml(k)}</span>${escapeHtml(v)}</div>`).join("")}</div>`
      : "";
    const warnings = payload.warnings && payload.warnings.length
      ? `<div class="llm-warnings">${payload.warnings.map((w) => `<div>注意：${escapeHtml(w)}</div>`).join("")}</div>`
      : "";

    return `
      <div class="llm-result-head">
        <span>DeepSeek · ${escapeHtml(payload.model || "")}</span>
        <span>可信度：${fmtConfidence(payload.confidence)}</span>
      </div>
      ${payload.summary ? `<div class="detail-summary">${escapeHtml(payload.summary)}</div>` : ""}
      ${warnings}
      ${factHtml}
      ${sup.alt_names && sup.alt_names.length ? `<div class="llm-subsection">
        <div class="detail-section-h">字號別名</div>
        ${renderTags(sup.alt_names.map((a) => `${a.type_chn || "別名"}：${a.name_chn}`), "altname")}
      </div>` : ""}
      ${sup.statuses && sup.statuses.length ? `<div class="llm-subsection">
        <div class="detail-section-h">社會身份</div>
        ${renderTags(sup.statuses.map((s) => s.desc_chn).filter(Boolean), "status")}
      </div>` : ""}
      ${renderSimpleList("地址", sup.addresses, (a) => {
        const range = fmtRange(a.first_year, a.last_year);
        return `<span style="color:#8b7a5d">${escapeHtml(a.type_chn || "相關地")}：</span>${escapeHtml(a.name_chn || "未詳")}${range ? ` <span style="color:#8b7a5d;font-size:11px">(${range})</span>` : ""}`;
      })}
      ${renderEntries(sup.entries)}
      ${renderSimpleList("仕宦", sup.offices, (o) => {
        const range = fmtRange(o.first_year, o.last_year);
        return `${range ? `<span style="color:#8b7a5d">${range}：</span>` : ""}${escapeHtml(o.office_chn || "—")}${o.category_1 ? ` <span style="color:#8b7a5d;font-size:11px">· ${escapeHtml(o.category_1)}</span>` : ""}`;
      })}
      ${renderEvents(sup.events)}
      ${renderSimpleList("社會交往", sup.associations, (r) =>
        `<span style="color:#8b7a5d">${escapeHtml(r.desc_chn || "相關")}：</span>${escapeHtml(r.person_chn || "未詳")}${r.dynasty_chn ? ` <span style="color:#8b7a5d;font-size:11px">· ${escapeHtml(r.dynasty_chn)}</span>` : ""}`
      )}
      ${renderSimpleList("親屬關係", sup.kinships, (r) =>
        `<span style="color:#8b7a5d">${escapeHtml(r.desc_chn || "親屬")}：</span>${escapeHtml(r.person_chn || "未詳")}${r.dynasty_chn ? ` <span style="color:#8b7a5d;font-size:11px">· ${escapeHtml(r.dynasty_chn)}</span>` : ""}`
      )}
      ${payload.note ? `<div class="llm-hint">${escapeHtml(payload.note)}</div>` : ""}
    `;
  }

  function renderOffices(offices) {
    if (!offices || !offices.length) return "";
    const sectionId = `sec-office-${Math.random().toString(36).slice(2, 8)}`;
    const initial = 10;
    const rows = offices.map((o, idx) => {
      const fy = fmtYear(o.first_year), ly = fmtYear(o.last_year);
      const collapsed = idx >= initial ? ' data-collapsed="1"' : "";
      return `<li${collapsed}>
        <span style="color:#8b7a5d">${fy}${fy !== ly && isValidYear(o.last_year) ? `–${ly}` : ""}：</span>
        ${escapeHtml(o.office_chn || "—")}
        ${o.category_1 ? `<span style="color:#8b7a5d;font-size:11px"> · ${escapeHtml(o.category_1)}</span>` : ""}
      </li>`;
    }).join("");
    const expandBtn = offices.length > initial
      ? `<li class="expand-toggle" data-section="${sectionId}" data-mode="expand"
            style="list-style:none;color:var(--accent);cursor:pointer;text-decoration:underline dotted;font-size:12px;margin-top:2px">
            ▾ 展開全部（還有 ${offices.length - initial} 條）
         </li>`
      : "";
    return `<div class="detail-section" id="${sectionId}">
      <div class="detail-section-h">仕宦履歷 <span style="color:#8b7a5d;font-weight:400;font-size:11px">(${offices.length})</span></div>
      <ul class="detail-list">${rows}${expandBtn}</ul>
    </div>`;
  }

  function renderAddresses(addresses) {
    if (!addresses || !addresses.length) return "";
    const sectionId = `sec-addr-${Math.random().toString(36).slice(2, 8)}`;
    const initial = 8;
    const rows = addresses.map((a, idx) => {
      const collapsed = idx >= initial ? ' data-collapsed="1"' : "";
      return `<li${collapsed}>
        <span style="color:#8b7a5d">${escapeHtml(a.type_chn || "—")}：</span>
        ${escapeHtml(a.name_chn || "未詳")}
        ${isValidYear(a.first_year) || isValidYear(a.last_year) ? ` <span style="color:#8b7a5d;font-size:11px">(${fmtYear(a.first_year)}–${fmtYear(a.last_year)})</span>` : ""}
      </li>`;
    }).join("");
    const expandBtn = addresses.length > initial
      ? `<li class="expand-toggle" data-section="${sectionId}" data-mode="expand"
            style="list-style:none;color:var(--accent);cursor:pointer;text-decoration:underline dotted;font-size:12px;margin-top:2px">
            ▾ 展開全部（還有 ${addresses.length - initial} 條）
         </li>`
      : "";
    return `<div class="detail-section" id="${sectionId}">
      <div class="detail-section-h">地址 <span style="color:#8b7a5d;font-weight:400;font-size:11px">(${addresses.length})</span></div>
      <ul class="detail-list">${rows}${expandBtn}</ul>
    </div>`;
  }

  function setData(p) {
    if (!p) { setEmpty(); return; }
    const altByType = {};
    (p.alt_names || []).forEach((a) => {
      const k = a.type_chn || "別號";
      if (!altByType[k]) altByType[k] = [];
      altByType[k].push(a.name_chn);
    });
    const altRows = Object.keys(altByType).map((k) =>
      `<div class="kv-row"><div class="kv-key">${escapeHtml(k)}</div><div class="kv-val">${
        renderTags(altByType[k], "altname")}</div></div>`).join("");

    const statuses = (p.statuses || []).map((s) => s.desc_chn).filter(Boolean);

    const html = `
      <div class="detail-name">${escapeHtml(p.name_chn || `#${p.id}`)}</div>
      <div class="detail-name-py">${escapeHtml(p.name_py || "")}</div>
      <div class="detail-life">
        ${p.dynasty_chn ? escapeHtml(p.dynasty_chn) + " · " : ""}
        ${fmtYear(p.birth_year)}–${fmtYear(p.death_year)}
        ${p.index_addr_chn ? ` · 籍貫 ${escapeHtml(p.index_addr_chn)}` : ""}
      </div>

      ${altRows ? `<div class="detail-section">
        <div class="detail-section-h">字、號、別名</div>${altRows}
      </div>` : ""}

      ${renderLlmMeta(p)}
      ${renderSummary(p)}

      ${statuses.length ? `<div class="detail-section">
        <div class="detail-section-h">社會身份</div>
        ${renderTags(statuses, "status")}
      </div>` : ""}

      ${renderAddresses(p.addresses)}
      ${renderOffices(p.offices)}
      ${renderEntries(p.entries)}
      ${renderEvents(p.events)}
      ${renderRelList("社會交往", p.associations, "assoc")}
      ${renderRelList("親屬關係", p.kinships, "kin")}
      ${renderMissingBox(p)}
    `;
    container.innerHTML = html;
    container.querySelectorAll(".linkish[data-pid]").forEach((el) => {
      el.addEventListener("click", () => {
        const pid = Number(el.getAttribute("data-pid"));
        if (pid) onPersonNav(pid);
      });
    });
    container.querySelectorAll(".expand-toggle").forEach((el) => {
      el.addEventListener("click", () => {
        const sec = document.getElementById(el.dataset.section);
        if (!sec) return;
        const mode = el.dataset.mode;
        if (mode === "expand") {
          sec.querySelectorAll('li[data-collapsed="1"]')
            .forEach((li) => li.removeAttribute("data-collapsed"));
          el.dataset.mode = "collapse";
          el.textContent = "▴ 收起";
        } else {
          // re-collapse: hide everything past the original initial-window
          // (the easiest correct re-collapse is to leave it expanded — but
          // user explicitly clicked, so toggle visibility on overflow rows)
          const ul = el.parentElement;
          const lis = Array.from(ul.querySelectorAll("li:not(.expand-toggle)"));
          // figure out original initial window per kind
          const isAddr = sec.id.startsWith("sec-addr-");
          const isOffice = sec.id.startsWith("sec-office-");
          const initial = isAddr ? 8 : isOffice ? 10 : 12;
          lis.slice(initial).forEach((li) => li.setAttribute("data-collapsed", "1"));
          el.dataset.mode = "expand";
          el.textContent = `▾ 展開全部（還有 ${lis.length - initial} 條）`;
        }
      });
    });
    const supplementBtn = container.querySelector("[data-llm-supplement]");
    if (supplementBtn) {
      supplementBtn.addEventListener("click", () => {
        const pid = Number(supplementBtn.getAttribute("data-llm-supplement"));
        if (pid) onSupplementRequest(pid);
      });
    }
    container.scrollTop = 0;
  }

  function setSupplementLoading() {
    const body = container.querySelector("#llm-supplement-body");
    const btn = container.querySelector("[data-llm-supplement]");
    if (btn) btn.disabled = true;
    if (body) body.innerHTML = `<div class="llm-loading">DeepSeek 補充查詢中…</div>`;
  }

  function setLlmSupplement(payload) {
    const body = container.querySelector("#llm-supplement-body");
    if (!body) return;
    body.innerHTML = renderSupplementContent(payload);
  }

  function setSupplementError(message) {
    const body = container.querySelector("#llm-supplement-body");
    const btn = container.querySelector("[data-llm-supplement]");
    if (btn) btn.disabled = false;
    if (body) body.innerHTML = `<div class="llm-error">${escapeHtml(message || "AI 補充失敗")}</div>`;
  }

  return {
    init,
    setData,
    setEmpty,
    setLoading,
    onNav,
    onSupplement,
    setSupplementLoading,
    setLlmSupplement,
    setSupplementError,
  };
})();
