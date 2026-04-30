"use strict";

const db = require("./db");
const queries = require("./queries");

// Build a multi-hop social network around a set of seed persons.
// Edges come from ASSOC_DATA (social) and KIN_DATA (family).
// `depth=1` returns seeds + their direct neighbors;
// `depth=2` adds one more hop (used cautiously since CBDB neighborhoods can explode).

function buildNetwork({ seedIds, depth = 1, maxNeighborsPerNode = 80, maxNodes = 200 }) {
  const seeds = Array.isArray(seedIds) ? seedIds.filter(Boolean) : [];
  if (seeds.length === 0) return { nodes: [], edges: [], truncated: false };

  const nodesMap = new Map(); // id -> node
  const edgesMap = new Map(); // key -> edge

  const addNode = (row, isSeed = false) => {
    if (!row || !row.id) return;
    if (nodesMap.has(row.id)) {
      if (isSeed) nodesMap.get(row.id).isSeed = true;
      return;
    }
    nodesMap.set(row.id, {
      id: row.id,
      name_chn: row.name_chn || row.person_chn || `#${row.id}`,
      name_py: row.name_py || row.person_py || null,
      birth_year: row.birth_year ?? null,
      death_year: row.death_year ?? null,
      index_year: row.index_year ?? null,
      dynasty_code: row.dynasty_code ?? null,
      dynasty_chn: row.dynasty_chn ?? null,
      isSeed,
    });
  };

  const addEdge = (sourceId, targetId, kind, label) => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    const lo = Math.min(sourceId, targetId);
    const hi = Math.max(sourceId, targetId);
    const key = `${lo}-${hi}-${kind}-${label || ""}`;
    if (edgesMap.has(key)) return;
    edgesMap.set(key, {
      source: sourceId,
      target: targetId,
      kind,           // "assoc" or "kin"
      label: label || (kind === "kin" ? "親屬" : "交往"),
    });
  };

  // Seed nodes
  for (const sid of seeds) {
    const summary = queries.getPersonSummary(sid);
    if (summary) addNode(summary, true);
  }

  let truncated = false;
  const frontier = new Set(seeds);
  const visited = new Set();

  for (let hop = 0; hop < depth; hop++) {
    const nextFrontier = new Set();
    for (const pid of frontier) {
      if (visited.has(pid)) continue;
      visited.add(pid);

      const assocs = queries.associationsStmt.all(pid).slice(0, maxNeighborsPerNode);
      const kins = queries.kinshipsStmt.all(pid).slice(0, maxNeighborsPerNode);

      for (const a of assocs) {
        if (!a.person_id) continue;
        if (nodesMap.size >= maxNodes && !nodesMap.has(a.person_id)) {
          truncated = true;
          continue;
        }
        addNode({
          id: a.person_id,
          name_chn: a.person_chn,
          name_py: a.person_py,
          birth_year: a.birth_year,
          death_year: a.death_year,
          index_year: a.index_year,
          dynasty_code: a.dynasty_code,
          dynasty_chn: a.dynasty_chn,
        });
        addEdge(pid, a.person_id, "assoc", a.desc_chn || "交往");
        if (hop < depth - 1) nextFrontier.add(a.person_id);
      }
      for (const k of kins) {
        if (!k.person_id) continue;
        if (nodesMap.size >= maxNodes && !nodesMap.has(k.person_id)) {
          truncated = true;
          continue;
        }
        addNode({
          id: k.person_id,
          name_chn: k.person_chn,
          name_py: k.person_py,
          birth_year: k.birth_year,
          death_year: k.death_year,
          index_year: k.index_year,
          dynasty_code: k.dynasty_code,
          dynasty_chn: k.dynasty_chn,
        });
        addEdge(pid, k.person_id, "kin", k.desc_chn || "親屬");
        if (hop < depth - 1) nextFrontier.add(k.person_id);
      }
    }
    for (const id of nextFrontier) {
      if (!visited.has(id)) frontier.add(id);
    }
    for (const id of [...frontier]) if (visited.has(id)) frontier.delete(id);
  }

  // Drop edges whose endpoints aren't both in nodesMap (can happen when capped).
  const nodes = [...nodesMap.values()];
  const presentIds = new Set(nodes.map((n) => n.id));
  const edges = [...edgesMap.values()].filter(
    (e) => presentIds.has(e.source) && presentIds.has(e.target)
  );

  return { nodes, edges, truncated };
}

module.exports = { buildNetwork };
