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

  function renderRelList(label, items, kind, max = 12) {
    if (!items || !items.length) return "";
    const rows = items.slice(0, max).map((r) => {
      const yr = r.first_year || r.last_year
        ? ` <span style="color:#8b7a5d;font-size:11px">(${fmtYear(r.first_year)}–${fmtYear(r.last_year)})</span>` : "";
      const name = r.person_chn || `#${r.person_id}`;
      return `<li>
        <span style="color:#8b7a5d">${escapeHtml(r.desc_chn || "")}：</span>
        <span class="linkish" data-pid="${r.person_id}">${escapeHtml(name)}</span>
        ${r.dynasty_chn ? `<span style="color:#8b7a5d;font-size:11px"> · ${escapeHtml(r.dynasty_chn)}</span>` : ""}
        ${yr}
      </li>`;
    }).join("");
    const more = items.length > max
      ? `<li style="color:#8b7a5d;list-style:none">… 共 ${items.length} 條，已顯示前 ${max} 條</li>`
      : "";
    return `<div class="detail-section">
      <div class="detail-section-h">${label} <span style="color:#8b7a5d;font-weight:400;font-size:11px">(${items.length})</span></div>
      <ul class="detail-list">${rows}${more}</ul>
    </div>`;
  }

  function renderOffices(offices) {
    if (!offices || !offices.length) return "";
    const rows = offices.slice(0, 10).map((o) => {
      const fy = o.first_year || "?", ly = o.last_year || "?";
      return `<li>
        <span style="color:#8b7a5d">${fy}${fy !== ly && o.last_year ? `–${ly}` : ""}：</span>
        ${escapeHtml(o.office_chn || "—")}
        ${o.category_1 ? `<span style="color:#8b7a5d;font-size:11px"> · ${escapeHtml(o.category_1)}</span>` : ""}
      </li>`;
    }).join("");
    return `<div class="detail-section">
      <div class="detail-section-h">仕宦履歷 <span style="color:#8b7a5d;font-weight:400;font-size:11px">(${offices.length})</span></div>
      <ul class="detail-list">${rows}</ul>
    </div>`;
  }

  function renderAddresses(addresses) {
    if (!addresses || !addresses.length) return "";
    const rows = addresses.slice(0, 8).map((a) => `
      <li>
        <span style="color:#8b7a5d">${escapeHtml(a.type_chn || "—")}：</span>
        ${escapeHtml(a.name_chn || "未詳")}
        ${a.first_year || a.last_year ? ` <span style="color:#8b7a5d;font-size:11px">(${fmtYear(a.first_year)}–${fmtYear(a.last_year)})</span>` : ""}
      </li>`).join("");
    return `<div class="detail-section">
      <div class="detail-section-h">地址</div>
      <ul class="detail-list">${rows}</ul>
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
    container.scrollTop = 0;
  }

  return { init, setData, setEmpty, onNav };
})();
