"use strict";

const path = require("path");
const express = require("express");
const compression = require("compression");
const cors = require("cors");

const queries = require("./queries");
const search = require("./search");
const network = require("./network");
const agg = require("./aggregations");

const app = express();
app.use(compression());
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const PUBLIC_DIR = path.resolve(__dirname, "../public");
app.use(express.static(PUBLIC_DIR));

function parseIntList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => Number(v)).filter(Boolean);
  return String(value)
    .split(",")
    .map((v) => Number(v.trim()))
    .filter((v) => Number.isInteger(v) && v > 0);
}

app.get("/api/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));

app.get("/api/search", (req, res) => {
  const q = String(req.query.q || "");
  const limit = Math.min(Number(req.query.limit) || 30, 100);
  res.json({ query: q, results: search.searchPersons(q, limit) });
});

app.get("/api/person/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "bad id" });
  const person = queries.getPersonDetail(id);
  if (!person) return res.status(404).json({ error: "not found" });
  res.json(person);
});

app.get("/api/network", (req, res) => {
  const seedIds = parseIntList(req.query.seeds || req.query.id);
  const depth = Math.max(1, Math.min(Number(req.query.depth) || 1, 2));
  const maxNodes = Math.min(Number(req.query.maxNodes) || 200, 400);
  const maxNeighborsPerNode = Math.min(Number(req.query.maxPerNode) || 60, 120);
  if (seedIds.length === 0) return res.status(400).json({ error: "seeds required" });
  const net = network.buildNetwork({ seedIds, depth, maxNodes, maxNeighborsPerNode });
  const ids = net.nodes.map((n) => n.id);
  const primary = agg.getPrimaryIdentities(ids);
  for (const n of net.nodes) n.identity = primary[n.id] || null;
  res.json(net);
});

app.get("/api/identity-distribution", (req, res) => {
  const ids = parseIntList(req.query.ids);
  if (ids.length === 0) return res.status(400).json({ error: "ids required" });
  res.json({ items: agg.getIdentityDistribution(ids) });
});

app.get("/api/geo", (req, res) => {
  const ids = parseIntList(req.query.ids);
  if (ids.length === 0) return res.status(400).json({ error: "ids required" });
  res.json({ clusters: agg.getGeoClusters(ids) });
});

app.get("/api/timeline/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "bad id" });
  const summary = queries.getPersonSummary(id);
  if (!summary) return res.status(404).json({ error: "not found" });
  const events = queries.eventsStmt.all(id);
  const offices = queries.officesStmt.all(id);
  const entries = queries.entriesStmt.all(id);
  const items = [];
  if (summary.birth_year) {
    items.push({
      year: summary.birth_year,
      type: "birth",
      label: "出生",
      detail: `${summary.name_chn} 生於 ${summary.birth_year} 年`,
    });
  }
  if (summary.death_year) {
    items.push({
      year: summary.death_year,
      type: "death",
      label: "卒",
      detail: `${summary.name_chn} 卒於 ${summary.death_year} 年`,
    });
  }
  for (const e of entries) {
    if (!e.year) continue;
    items.push({
      year: e.year,
      type: "entry",
      label: e.desc_chn || "入仕",
      detail: e.exam_field
        ? `${e.desc_chn || "入仕"}（${e.exam_field}）`
        : e.desc_chn || "入仕",
    });
  }
  for (const o of offices) {
    const yr = o.first_year || o.last_year;
    if (!yr || !o.office_chn) continue;
    items.push({
      year: yr,
      type: "office",
      label: o.office_chn,
      detail: `任 ${o.office_chn}${
        o.first_year && o.last_year && o.first_year !== o.last_year
          ? `（${o.first_year}–${o.last_year}）`
          : ""
      }`,
    });
  }
  for (const ev of events) {
    if (!ev.year) continue;
    items.push({
      year: ev.year,
      type: "event",
      label: ev.name_chn || "事件",
      detail: ev.event_text || ev.name_chn || "事件",
    });
  }
  items.sort((a, b) => a.year - b.year);
  res.json({ person: summary, items });
});

app.get("/api/dynasties", (_req, res) => {
  const rows = require("./db")
    .prepare(`SELECT c_dy AS id, c_dynasty_chn AS chn, c_start AS start, c_end AS end, c_sort AS sort
              FROM DYNASTIES WHERE c_dynasty_chn IS NOT NULL ORDER BY c_sort`)
    .all();
  res.json({ items: rows });
});

// Curated examples used by the UI's "famous group" dropdown.
const PRESETS = [
  {
    id: "wumen",
    title: "明代吳門四家（沈周、文徵明、唐寅、仇英 等）",
    seeds: [
      { id: 34784, name: "沈周" },
      { id: 34673, name: "文徵明" },
      { id: 34868, name: "唐寅" },
      { id: 276535, name: "祝允明" },
    ],
  },
  {
    id: "tangsong8",
    title: "唐宋八大家（韓愈、柳宗元、歐陽修、蘇軾 等）",
    seeds: [
      { id: 1384, name: "歐陽修" },
      { id: 1762, name: "王安石" },
      { id: 3767, name: "蘇軾" },
    ],
  },
];
app.get("/api/presets", (_req, res) => res.json({ items: PRESETS }));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || "server error" });
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`[CBDB-VIS] server listening on http://localhost:${PORT}`);
});
