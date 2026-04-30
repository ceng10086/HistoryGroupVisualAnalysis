/* Geographic distribution map using Leaflet (no API key needed). */
window.geoView = (() => {
  let map, layer;
  function init(containerId) {
    map = L.map(containerId, {
      preferCanvas: true,
      worldCopyJump: true,
      attributionControl: true,
      minZoom: 3,
      maxZoom: 12,
      zoomControl: true,
    }).setView([34.0, 110.0], 4);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 12,
      subdomains: ["a", "b", "c"],
      attribution: '© OpenStreetMap',
    }).addTo(map);

    layer = L.layerGroup().addTo(map);
    setTimeout(() => map.invalidateSize(), 100);
    window.addEventListener("resize", () => map && map.invalidateSize());
  }

  function setData(clusters) {
    if (!map) return;
    layer.clearLayers();
    if (!clusters || clusters.length === 0) {
      const note = L.popup({ closeButton: false })
        .setLatLng([34, 110])
        .setContent('<span style="color:#5a4a35">未發現可定位的籍貫資料</span>')
        .openOn(map);
      return;
    }

    const palette = ["#b85f3a", "#c49b3f", "#5b8a6e", "#7d6aa6", "#3b6ea5"];
    const maxCount = Math.max(...clusters.map((c) => c.persons.length));

    const bounds = [];
    clusters.forEach((c, i) => {
      if (c.x == null || c.y == null) return;
      const cnt = c.persons.length;
      const radius = 4 + Math.sqrt(cnt) * 4;
      const color = palette[i % palette.length];
      const marker = L.circleMarker([c.y, c.x], {
        radius,
        color,
        weight: 1.5,
        fillColor: color,
        fillOpacity: 0.55,
      });
      const persons = c.persons.slice(0, 12).map((p) => p.name_chn).join("、")
        + (c.persons.length > 12 ? "…" : "");
      marker.bindPopup(
        `<div style="font-family:'Noto Serif SC',serif">
           <b style="font-size:14px;color:#b8341d">${c.addr_chn || "未詳"}</b><br/>
           <span style="color:#5a4a35">人物 ${cnt} 人</span><br/>
           <span style="font-size:12px;color:#2b2418">${persons}</span>
         </div>`,
        { maxWidth: 280 }
      );
      marker.bindTooltip(`${c.addr_chn} (${cnt})`, { direction: "top" });
      marker.addTo(layer);
      bounds.push([c.y, c.x]);
    });

    if (bounds.length) {
      try {
        map.fitBounds(bounds, { padding: [30, 30], maxZoom: 8 });
      } catch (_) { /* single point or invalid */ }
    }
    setTimeout(() => map.invalidateSize(), 50);
  }

  return { init, setData };
})();
