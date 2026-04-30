/* Force-directed social network using D3. Exposes window.networkView. */
window.networkView = (() => {
  let svgRoot, gAll, gLink, gNode, gLabel, simulation;
  let width = 0, height = 0;
  let zoomBehavior;
  let tooltip;
  let onNodeSelect = () => {};
  let lastNodes = [], lastEdges = [];
  let labelMode = "auto"; // 'auto' | 'all' | 'seeds'
  let searchTerm = "";

  // Color palette based on identity (most common identities get stable colors).
  const IDENTITY_COLORS = {
    "畫家": "#b85f3a",
    "詩人": "#5b8a6e",
    "文士": "#7d6aa6",
    "官員": "#3b6ea5",
    "[隱居（有隱德）]": "#8b7a5d",
    "高僧": "#a07c4d",
    "[宦官]": "#666666",
    "進士": "#c49b3f",
  };
  const FALLBACK_COLOR = "#6c8eb6";

  function init(containerId) {
    const el = document.getElementById(containerId);
    width = el.clientWidth;
    height = el.clientHeight;

    svgRoot = d3.select(el).append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet");

    // background defs (subtle)
    const defs = svgRoot.append("defs");
    const grad = defs.append("radialGradient").attr("id", "bg-grad");
    grad.append("stop").attr("offset", "0%").attr("stop-color", "#fbf6ec");
    grad.append("stop").attr("offset", "100%").attr("stop-color", "#ead7af");
    svgRoot.append("rect")
      .attr("width", width).attr("height", height)
      .attr("fill", "url(#bg-grad)");

    gAll = svgRoot.append("g").attr("class", "g-all");
    gLink = gAll.append("g").attr("class", "g-links");
    gNode = gAll.append("g").attr("class", "g-nodes");
    gLabel = gAll.append("g").attr("class", "g-labels");

    zoomBehavior = d3.zoom()
      .scaleExtent([0.15, 6])
      .on("zoom", (ev) => gAll.attr("transform", ev.transform));
    svgRoot.call(zoomBehavior);

    tooltip = d3.select(el).append("div")
      .attr("class", "tooltip")
      .style("display", "none");

    window.addEventListener("resize", () => {
      const w = el.clientWidth, h = el.clientHeight;
      if (w === width && h === height) return;
      width = w; height = h;
      svgRoot.attr("viewBox", `0 0 ${width} ${height}`);
      svgRoot.select("rect").attr("width", width).attr("height", height);
      if (simulation) {
        simulation.force("center", d3.forceCenter(width / 2, height / 2));
        simulation.alpha(0.3).restart();
      }
    });
  }

  // Decide which nodes get a label, given the current mode and graph size.
  function labelFilter(nodes) {
    if (labelMode === "all") return nodes;
    if (labelMode === "seeds") return nodes.filter((n) => n.isSeed);
    // auto: scale label density with node count
    const n = nodes.length;
    if (n <= 60) return nodes.filter((d) => d.isSeed || d.degree >= 2);
    if (n <= 150) return nodes.filter((d) => d.isSeed || d.degree >= 4);
    if (n <= 350) return nodes.filter((d) => d.isSeed || d.degree >= 7);
    return nodes.filter((d) => d.isSeed || d.degree >= 12);
  }

  function relayoutLabels() {
    const labelData = labelFilter(lastNodes);
    const sel = gLabel.selectAll("text.node-label").data(labelData, (d) => d.id);
    sel.exit().remove();
    const enter = sel.enter().append("text")
      .attr("class", "node-label")
      .attr("dy", "0.32em");
    enter.merge(sel)
      .text((d) => d.name_chn || `#${d.id}`)
      .attr("font-size", (d) => d.isSeed ? 14 : 11)
      .attr("font-weight", (d) => d.isSeed ? 700 : 500)
      .attr("x", (d) => d.x ?? 0)
      .attr("y", (d) => (d.y ?? 0) - (d.r || 6) - 4);
  }

  function setLabelMode(mode) {
    labelMode = mode || "auto";
    relayoutLabels();
  }

  function setSearch(term) {
    searchTerm = (term || "").trim();
    if (!searchTerm) { unhighlight(); return; }
    const re = searchTerm.toLowerCase();
    const matchSet = new Set(
      lastNodes
        .filter((n) => (n.name_chn || "").toLowerCase().includes(re)
          || (n.name_py || "").toLowerCase().includes(re))
        .map((n) => n.id)
    );
    if (matchSet.size === 0) {
      gNode.selectAll("circle.node-circle").classed("dim", true);
      gLabel.selectAll("text.node-label").classed("dim", true);
      gLink.selectAll("line.link-line").classed("dim", true);
      return;
    }
    // Include 1-hop neighbors of matches in the keep-set
    const keep = new Set(matchSet);
    lastEdges.forEach((e) => {
      const s = e.source.id ?? e.source;
      const t = e.target.id ?? e.target;
      if (matchSet.has(s)) keep.add(t);
      if (matchSet.has(t)) keep.add(s);
    });
    gNode.selectAll("circle.node-circle")
      .classed("dim", (d) => !keep.has(d.id))
      .classed("match", (d) => matchSet.has(d.id));
    gLabel.selectAll("text.node-label").classed("dim", (d) => !keep.has(d.id));
    gLink.selectAll("line.link-line").classed("dim", (d) => {
      const s = d.source.id ?? d.source;
      const t = d.target.id ?? d.target;
      return !(keep.has(s) && keep.has(t));
    });
  }

  function setData(nodes, edges) {
    lastNodes = nodes; lastEdges = edges;
    if (simulation) simulation.stop();

    nodes.forEach((n) => {
      n.color = n.isSeed
        ? "#d4a017"
        : (IDENTITY_COLORS[n.identity] || FALLBACK_COLOR);
      n.r = n.isSeed ? 14 : 7;
    });

    const degree = new Map();
    edges.forEach((e) => {
      degree.set(e.source, (degree.get(e.source) || 0) + 1);
      degree.set(e.target, (degree.get(e.target) || 0) + 1);
    });
    nodes.forEach((n) => {
      n.degree = degree.get(n.id) || 0;
      if (!n.isSeed) {
        const base = nodes.length > 300 ? 4 : 5;
        n.r = base + Math.min(8, Math.sqrt(n.degree) * 1.6);
      }
    });

    // Bind links
    const linkSel = gLink.selectAll("line.link-line")
      .data(edges, (d) => `${d.source}|${d.target}|${d.kind}`);
    linkSel.exit().remove();
    const linkEnter = linkSel.enter().append("line")
      .attr("class", (d) => `link-line ${d.kind}`)
      .attr("stroke-width", (d) => d.kind === "kin" ? 1.6 : 1.2);
    const linkAll = linkEnter.merge(linkSel);

    // Bind nodes
    const nodeSel = gNode.selectAll("circle.node-circle")
      .data(nodes, (d) => d.id);
    nodeSel.exit().remove();
    const nodeEnter = nodeSel.enter().append("circle")
      .attr("class", (d) => "node-circle" + (d.isSeed ? " seed" : ""))
      .attr("r", (d) => d.r)
      .attr("fill", (d) => d.color)
      .on("mouseover", function (ev, d) {
        showTooltip(ev, d);
        highlight(d);
      })
      .on("mousemove", moveTooltip)
      .on("mouseout", function () {
        tooltip.style("display", "none");
        if (!searchTerm) unhighlight();
      })
      .on("click", function (ev, d) {
        ev.stopPropagation();
        onNodeSelect(d);
      })
      .call(d3.drag()
        .on("start", (ev, d) => {
          if (!ev.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x; d.fy = d.y;
        })
        .on("drag", (ev, d) => { d.fx = ev.x; d.fy = ev.y; })
        .on("end", (ev, d) => {
          if (!ev.active) simulation.alphaTarget(0);
          d.fx = null; d.fy = null;
        }));
    const nodeAll = nodeEnter.merge(nodeSel);
    nodeAll.attr("r", (d) => d.r)
      .attr("fill", (d) => d.color)
      .attr("class", (d) => "node-circle" + (d.isSeed ? " seed" : ""));

    // Bind labels (filtered by labelMode + auto density rule)
    const labelData = labelFilter(nodes);
    const labelSel = gLabel.selectAll("text.node-label")
      .data(labelData, (d) => d.id);
    labelSel.exit().remove();
    const labelEnter = labelSel.enter().append("text")
      .attr("class", "node-label")
      .attr("dy", "0.32em");
    labelEnter.merge(labelSel)
      .text((d) => d.name_chn || `#${d.id}`)
      .attr("font-size", (d) => d.isSeed ? 14 : 11)
      .attr("font-weight", (d) => d.isSeed ? 700 : 500);

    svgRoot.on("click", () => { if (!searchTerm) unhighlight(); });

    // Force simulation — params scale with node count for clarity at large graphs.
    const N = nodes.length;
    const charge = N > 500 ? -55 : N > 250 ? -90 : -120;
    const linkDist = (d) => {
      const base = d.kind === "kin" ? 50 : 75;
      return base + Math.min(40, N / 18);
    };
    const collideR = (d) => d.r + (N > 300 ? 3 : 6);
    simulation = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(edges).id((d) => d.id).distance(linkDist).strength(0.5))
      .force("charge", d3.forceManyBody().strength((d) => d.isSeed ? -380 : charge))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide().radius(collideR))
      .alpha(1)
      .alphaDecay(N > 400 ? 0.04 : 0.025)
      .on("tick", () => {
        linkAll
          .attr("x1", (d) => d.source.x)
          .attr("y1", (d) => d.source.y)
          .attr("x2", (d) => d.target.x)
          .attr("y2", (d) => d.target.y);
        nodeAll
          .attr("cx", (d) => d.x)
          .attr("cy", (d) => d.y);
        gLabel.selectAll("text.node-label")
          .attr("x", (d) => d.x)
          .attr("y", (d) => d.y - d.r - 4);
      });

    setTimeout(fit, N > 400 ? 1800 : 1200);
  }

  function highlight(node) {
    const neighborIds = new Set([node.id]);
    lastEdges.forEach((e) => {
      const s = e.source.id ?? e.source;
      const t = e.target.id ?? e.target;
      if (s === node.id) neighborIds.add(t);
      if (t === node.id) neighborIds.add(s);
    });
    gNode.selectAll("circle.node-circle")
      .classed("dim", (d) => !neighborIds.has(d.id));
    gLabel.selectAll("text.node-label")
      .classed("dim", (d) => !neighborIds.has(d.id));
    gLink.selectAll("line.link-line")
      .classed("dim", (d) => {
        const s = d.source.id ?? d.source;
        const t = d.target.id ?? d.target;
        return !(s === node.id || t === node.id);
      });
  }
  function unhighlight() {
    gNode.selectAll("circle.node-circle").classed("dim", false).classed("match", false);
    gLabel.selectAll("text.node-label").classed("dim", false);
    gLink.selectAll("line.link-line").classed("dim", false);
  }

  function showTooltip(ev, d) {
    const lines = [
      `<b>${d.name_chn || ""}</b> ${d.name_py ? `<span style="opacity:.7">${d.name_py}</span>` : ""}`,
    ];
    if (d.dynasty_chn) lines.push(`朝代：${d.dynasty_chn}`);
    if (d.birth_year || d.death_year)
      lines.push(`生卒：${d.birth_year ?? "?"}–${d.death_year ?? "?"}`);
    if (d.identity) lines.push(`身份：${d.identity}`);
    if (d.degree != null) lines.push(`度數：${d.degree}`);
    tooltip.html(lines.join("<br>")).style("display", "block");
    moveTooltip(ev);
  }
  function moveTooltip(ev) {
    const x = ev.offsetX + 12;
    const y = ev.offsetY + 12;
    tooltip.style("left", x + "px").style("top", y + "px");
  }

  function fit() {
    if (!lastNodes.length) return;
    const padding = 40;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    lastNodes.forEach((n) => {
      if (n.x == null) return;
      minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
      minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y);
    });
    if (!isFinite(minX)) return;
    const w = maxX - minX || 1, h = maxY - minY || 1;
    const scale = Math.min((width - padding * 2) / w, (height - padding * 2) / h, 2);
    const tx = width / 2 - (minX + w / 2) * scale;
    const ty = height / 2 - (minY + h / 2) * scale;
    svgRoot.transition().duration(500).call(
      zoomBehavior.transform,
      d3.zoomIdentity.translate(tx, ty).scale(scale)
    );
  }

  return {
    init,
    setData,
    fit,
    setLabelMode,
    setSearch,
    onSelect: (fn) => { onNodeSelect = fn; },
  };
})();
