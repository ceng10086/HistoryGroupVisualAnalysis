/* Right-side person detail panel renderer. */
window.detailView = (() => {
  let container;
  let onPersonNav = () => {};

  function init(containerId) { container = document.getElementById(containerId); }
  function onNav(fn) { onPersonNav = fn; }

  function escapeHtml(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function fmtYear(y) { return y == null ? "?" : (y < 0 ? `前${-y}` : `${y}`); }

  function setEmpty() {
    container.innerHTML = `<div class="detail-empty">點擊網絡中的節點查看人物詳情</div>`;
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
      const yr = r.first_year || r.last_year
        ? ` <span style="color:#8b7a5d;font-size:11px">(${fmtYear(r.first_year)}–${fmtYear(r.last_year)})</span>` : "";
      const name = r.person_chn || `#${r.person_id}`;
      const collapsed = idx >= initial ? ' data-collapsed="1"' : "";
      return `<li${collapsed}>
        <span style="color:#8b7a5d">${escapeHtml(r.desc_chn || "")}：</span>
        <span class="linkish" data-pid="${r.person_id}">${escapeHtml(name)}</span>
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

  function renderOffices(offices) {
    if (!offices || !offices.length) return "";
    const sectionId = `sec-office-${Math.random().toString(36).slice(2, 8)}`;
    const initial = 10;
    const rows = offices.map((o, idx) => {
      const fy = o.first_year || "?", ly = o.last_year || "?";
      const collapsed = idx >= initial ? ' data-collapsed="1"' : "";
      return `<li${collapsed}>
        <span style="color:#8b7a5d">${fy}${fy !== ly && o.last_year ? `–${ly}` : ""}：</span>
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
        ${a.first_year || a.last_year ? ` <span style="color:#8b7a5d;font-size:11px">(${fmtYear(a.first_year)}–${fmtYear(a.last_year)})</span>` : ""}
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

      ${statuses.length ? `<div class="detail-section">
        <div class="detail-section-h">社會身份</div>
        ${renderTags(statuses, "status")}
      </div>` : ""}

      ${renderAddresses(p.addresses)}
      ${renderOffices(p.offices)}
      ${renderRelList("社會交往", p.associations, "assoc")}
      ${renderRelList("親屬關係", p.kinships, "kin")}
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
    container.scrollTop = 0;
  }

  return { init, setData, setEmpty, onNav };
})();
