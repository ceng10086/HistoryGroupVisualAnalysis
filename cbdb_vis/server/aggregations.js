"use strict";

const db = require("./db");
const queries = require("./queries");

// Identity (社會身份) distribution across a group.
function getIdentityDistribution(personIds) {
  if (!personIds || personIds.length === 0) return [];
  const placeholders = personIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `
      SELECT s.c_status_code AS code,
             sc.c_status_desc_chn AS desc_chn,
             sc.c_status_desc     AS desc_py,
             COUNT(DISTINCT s.c_personid) AS cnt
      FROM STATUS_DATA s
      LEFT JOIN STATUS_CODES sc ON sc.c_status_code = s.c_status_code
      WHERE s.c_personid IN (${placeholders})
      GROUP BY s.c_status_code
      ORDER BY cnt DESC
      LIMIT 50
    `
    )
    .all(...personIds);
  return rows.filter((r) => r.desc_chn);
}

// Per-person identities (top one per person, used for node coloring).
function getPrimaryIdentities(personIds) {
  if (!personIds || personIds.length === 0) return {};
  const placeholders = personIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `
      SELECT s.c_personid AS pid,
             sc.c_status_desc_chn AS desc_chn,
             s.c_sequence AS seq
      FROM STATUS_DATA s
      LEFT JOIN STATUS_CODES sc ON sc.c_status_code = s.c_status_code
      WHERE s.c_personid IN (${placeholders})
        AND sc.c_status_desc_chn IS NOT NULL
      ORDER BY s.c_personid, s.c_sequence
    `
    )
    .all(...personIds);
  const map = {};
  for (const r of rows) {
    if (!map[r.pid]) map[r.pid] = r.desc_chn;
  }
  return map;
}

// Geographic distribution: returns each person's index addr (jia-guan), if available.
function getGeoDistribution(personIds) {
  if (!personIds || personIds.length === 0) return [];
  const placeholders = personIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `
      SELECT bm.c_personid AS id,
             bm.c_name_chn AS name_chn,
             bm.c_index_year AS index_year,
             a.c_addr_id AS addr_id,
             a.c_name_chn AS addr_chn,
             a.x_coord AS x,
             a.y_coord AS y
      FROM BIOG_MAIN bm
      LEFT JOIN ADDR_CODES a ON a.c_addr_id = bm.c_index_addr_id
      WHERE bm.c_personid IN (${placeholders})
        AND a.x_coord IS NOT NULL
        AND a.y_coord IS NOT NULL
    `
    )
    .all(...personIds);
  return rows;
}

// Aggregated geographic clusters.
function getGeoClusters(personIds) {
  const points = getGeoDistribution(personIds);
  const buckets = new Map();
  for (const p of points) {
    if (!p.addr_id) continue;
    if (!buckets.has(p.addr_id)) {
      buckets.set(p.addr_id, {
        addr_id: p.addr_id,
        addr_chn: p.addr_chn,
        x: p.x,
        y: p.y,
        persons: [],
      });
    }
    buckets.get(p.addr_id).persons.push({
      id: p.id,
      name_chn: p.name_chn,
      index_year: p.index_year,
    });
  }
  return [...buckets.values()];
}

module.exports = {
  getIdentityDistribution,
  getPrimaryIdentities,
  getGeoDistribution,
  getGeoClusters,
};
