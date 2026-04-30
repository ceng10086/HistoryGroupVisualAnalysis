/* Person timeline visualization using ECharts custom series. */
window.timelineView = (() => {
  let chart;
  const TYPE_META = {
    birth:  { color: "#d4a017", label: "出生" },
    death:  { color: "#666",    label: "卒" },
    entry:  { color: "#3b6ea5", label: "入仕" },
    office: { color: "#5b8a6e", label: "任職" },
    event:  { color: "#b8341d", label: "事件" },
  };

  function init(containerId) {
    const el = document.getElementById(containerId);
    chart = echarts.init(el, null, { renderer: "canvas" });
    window.addEventListener("resize", () => chart && chart.resize());
  }

  function clearAndShowMessage(msg) {
    chart.clear();
    chart.setOption({
      title: { text: msg, left: "center", top: "center",
               textStyle: { color: "#8b7a5d", fontFamily: "Noto Sans SC", fontSize: 13 } },
    });
  }

  function setData(payload) {
    if (!chart) return;
    if (!payload || !payload.items || payload.items.length === 0) {
      clearAndShowMessage(payload && payload.person
        ? `${payload.person.name_chn || ""} 暫無年表事件`
        : "暫無年表數據");
      return;
    }
    const items = payload.items;
    const minY = Math.min(...items.map((i) => i.year));
    const maxY = Math.max(...items.map((i) => i.year));
    const types = ["birth", "entry", "office", "event", "death"];

    const seriesData = items.map((it) => {
      const meta = TYPE_META[it.type] || TYPE_META.event;
      return {
        name: it.label,
        value: [it.year, types.indexOf(it.type), it],
        itemStyle: { color: meta.color },
      };
    });

    chart.clear();
    chart.setOption({
      title: {
        text: `${payload.person.name_chn || ""}（${payload.person.birth_year ?? "?"}–${payload.person.death_year ?? "?"}） 年表`,
        left: 12, top: 6,
        textStyle: { fontFamily: "Noto Serif SC", fontSize: 14, color: "#2b2418", fontWeight: 700 },
      },
      grid: { left: 60, right: 30, top: 40, bottom: 50 },
      tooltip: {
        trigger: "item",
        formatter: (p) => {
          const it = p.data.value[2];
          const meta = TYPE_META[it.type] || TYPE_META.event;
          return `<div style="max-width:280px">
            <b style="color:${meta.color}">${meta.label}</b>
            <span style="color:#888;margin-left:6px">${it.year}</span>
            <div style="margin-top:4px;color:#222;white-space:normal">${it.detail || it.label}</div>
          </div>`;
        },
      },
      xAxis: {
        type: "value",
        name: "年份",
        nameTextStyle: { color: "#5a4a35" },
        min: minY - 2,
        max: maxY + 2,
        axisLine: { lineStyle: { color: "#b88a44" } },
        axisLabel: { color: "#5a4a35", formatter: (v) => Math.round(v) },
        splitLine: { lineStyle: { color: "#e8d8b4", type: "dashed" } },
      },
      yAxis: {
        type: "category",
        data: types.map((t) => TYPE_META[t].label),
        axisLine: { lineStyle: { color: "#b88a44" } },
        axisLabel: { color: "#2b2418", fontFamily: "Noto Serif SC", fontSize: 12 },
        splitLine: { show: false },
      },
      dataZoom: [
        { type: "slider", xAxisIndex: 0, height: 18, bottom: 18, brushSelect: false,
          backgroundColor: "rgba(184,138,68,0.10)" },
        { type: "inside", xAxisIndex: 0 },
      ],
      series: [
        {
          type: "scatter",
          symbolSize: 12,
          data: seriesData,
          emphasis: { focus: "self", itemStyle: { borderColor: "#fff8c5", borderWidth: 2 } },
          label: {
            show: true,
            position: "top",
            distance: 6,
            formatter: (p) => {
              const it = p.data.value[2];
              const txt = it.label || "";
              return txt.length > 8 ? txt.slice(0, 8) + "…" : txt;
            },
            fontSize: 11,
            color: "#2b2418",
            fontFamily: "Noto Serif SC",
          },
        },
      ],
    });
  }
  return { init, setData };
})();
