"use strict";

const db = require("./db");
const queries = require("./queries");

// Search persons by Chinese name (or pinyin), with optional dynasty filter.
const searchByNameStmt = db.prepare(`
  SELECT bm.c_personid    AS id,
         bm.c_name_chn    AS name_chn,
         bm.c_name        AS name_py,
         bm.c_birthyear   AS birth_year,
         bm.c_deathyear   AS death_year,
         bm.c_index_year  AS index_year,
         bm.c_dy          AS dynasty_code,
         d.c_dynasty_chn  AS dynasty_chn,
         addr.c_name_chn  AS index_addr_chn
  FROM BIOG_MAIN bm
  LEFT JOIN DYNASTIES d ON d.c_dy = bm.c_dy
  LEFT JOIN ADDR_CODES addr ON addr.c_addr_id = bm.c_index_addr_id
  WHERE bm.c_name_chn LIKE @qChn
     OR bm.c_name LIKE @qPy
  ORDER BY
    CASE
      WHEN bm.c_name_chn = @exact THEN 0
      WHEN bm.c_name_chn LIKE @prefix THEN 1
      ELSE 2
    END,
    bm.c_index_year
  LIMIT @limit
`);

const altNameSearchStmt = db.prepare(`
  SELECT DISTINCT bm.c_personid    AS id,
         bm.c_name_chn    AS name_chn,
         bm.c_name        AS name_py,
         bm.c_birthyear   AS birth_year,
         bm.c_deathyear   AS death_year,
         bm.c_index_year  AS index_year,
         bm.c_dy          AS dynasty_code,
         d.c_dynasty_chn  AS dynasty_chn,
         addr.c_name_chn  AS index_addr_chn,
         a.c_alt_name_chn AS alt_name_chn
  FROM ALTNAME_DATA a
  JOIN BIOG_MAIN bm ON bm.c_personid = a.c_personid
  LEFT JOIN DYNASTIES d ON d.c_dy = bm.c_dy
  LEFT JOIN ADDR_CODES addr ON addr.c_addr_id = bm.c_index_addr_id
  WHERE a.c_alt_name_chn LIKE @qChn
  LIMIT @limit
`);

function searchPersons(query, limit = 30) {
  if (!query || !query.trim()) return [];
  const q = query.trim();
  const params = {
    qChn: `%${q}%`,
    qPy: `%${q}%`,
    exact: q,
    prefix: `${q}%`,
    limit,
  };
  const main = searchByNameStmt.all(params);

  // Also try alt names if the primary search returned little.
  if (main.length < limit) {
    const seen = new Set(main.map((r) => r.id));
    const alt = altNameSearchStmt
      .all({ qChn: `%${q}%`, limit: limit - main.length })
      .filter((r) => !seen.has(r.id));
    return [...main, ...alt];
  }
  return main;
}

module.exports = { searchPersons };
