/* Identity (社會身份) bar chart using ECharts. */
window.identityView = (() => {
  let chart;
  function init(containerId) {
    const el = document.getElementById(containerId);
    chart = echarts.init(el, null, { renderer: "canvas" });
    window.addEventListener("resize", () => chart && chart.resize());
  }
  function setData(items) {
    if (!chart) return;
    if (!items || items.length === 0) {
      chart.clear();
      chart.setOption({
        title: { text: "暫無身份數據", left: "center", top: "center",
                 textStyle: { color: "#8b7a5d", fontFamily: "Noto Sans SC", fontSize: 13 } },
      });
      return;
    }
    const top = items.slice(0, 12).reverse(); // horizontal bar — biggest at top
    chart.clear();
    chart.setOption({
      grid: { left: 110, right: 30, top: 10, bottom: 26, containLabel: false },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (p) => {
          const d = p[0];
          return `<b>${d.name}</b><br/>群體中 ${d.value} 人`;
        },
      },
      xAxis: {
        type: "value",
        axisLine: { lineStyle: { color: "#b88a44" } },
        axisLabel: { color: "#5a4a35", fontSize: 11 },
        splitLine: { lineStyle: { color: "#e8d8b4", type: "dashed" } },
      },
      yAxis: {
        type: "category",
        data: top.map((it) => it.desc_chn),
        axisLine: { lineStyle: { color: "#b88a44" } },
        axisLabel: {
          color: "#2b2418", fontFamily: "Noto Serif SC", fontSize: 12,
          formatter: (v) => (v.length > 8 ? v.slice(0, 8) + "…" : v),
        },
      },
      series: [
        {
          type: "bar",
          data: top.map((it) => it.cnt),
          itemStyle: {
            color: (params) => {
              const palette = [
                "#b85f3a", "#c49b3f", "#5b8a6e", "#7d6aa6", "#3b6ea5",
                "#a07c4d", "#8b7a5d", "#666666", "#d4a017", "#9c2614",
                "#4a7d6e", "#6c8eb6",
              ];
              return palette[params.dataIndex % palette.length];
            },
            borderRadius: [0, 4, 4, 0],
          },
          label: {
            show: true, position: "right",
            formatter: "{c}", color: "#5a4a35", fontSize: 11,
          },
        },
      ],
    });
  }
  return { init, setData };
})();
