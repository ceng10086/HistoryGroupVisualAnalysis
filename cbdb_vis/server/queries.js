"use strict";

const db = require("./db");

const personSummaryStmt = db.prepare(`
  SELECT
    bm.c_personid                         AS id,
    bm.c_name_chn                         AS name_chn,
    bm.c_name                             AS name_py,
    bm.c_birthyear                        AS birth_year,
    bm.c_deathyear                        AS death_year,
    bm.c_female                           AS female,
    bm.c_dy                               AS dynasty_code,
    d.c_dynasty_chn                       AS dynasty_chn,
    bm.c_index_year                       AS index_year,
    bm.c_index_addr_id                    AS index_addr_id,
    addr.c_name_chn                       AS index_addr_chn,
    addr.x_coord                          AS index_addr_x,
    addr.y_coord                          AS index_addr_y
  FROM BIOG_MAIN bm
  LEFT JOIN DYNASTIES d ON d.c_dy = bm.c_dy
  LEFT JOIN ADDR_CODES addr ON addr.c_addr_id = bm.c_index_addr_id
  WHERE bm.c_personid = ?
`);

function getPersonSummary(personId) {
  return personSummaryStmt.get(personId) || null;
}

const altNamesStmt = db.prepare(`
  SELECT a.c_alt_name_chn AS name_chn,
         a.c_alt_name     AS name_py,
         a.c_alt_name_type_code AS type_code,
         c.c_name_type_desc_chn AS type_chn
  FROM ALTNAME_DATA a
  LEFT JOIN ALTNAME_CODES c ON c.c_name_type_code = a.c_alt_name_type_code
  WHERE a.c_personid = ?
  ORDER BY a.c_alt_name_type_code
`);

const statusesStmt = db.prepare(`
  SELECT s.c_status_code AS code,
         sc.c_status_desc_chn AS desc_chn,
         sc.c_status_desc     AS desc_py,
         s.c_firstyear        AS first_year,
         s.c_lastyear         AS last_year
  FROM STATUS_DATA s
  LEFT JOIN STATUS_CODES sc ON sc.c_status_code = s.c_status_code
  WHERE s.c_personid = ?
  ORDER BY s.c_sequence
`);

const addressesStmt = db.prepare(`
  SELECT b.c_addr_id        AS addr_id,
         b.c_addr_type      AS type_code,
         bc.c_addr_desc_chn AS type_chn,
         a.c_name_chn       AS name_chn,
         a.c_name           AS name_py,
         a.x_coord          AS x,
         a.y_coord          AS y,
         b.c_firstyear      AS first_year,
         b.c_lastyear       AS last_year
  FROM BIOG_ADDR_DATA b
  LEFT JOIN BIOG_ADDR_CODES bc ON bc.c_addr_type = b.c_addr_type
  LEFT JOIN ADDR_CODES a ON a.c_addr_id = b.c_addr_id
  WHERE b.c_personid = ?
    AND (b.c_delete IS NULL OR b.c_delete = 0)
`);

const entriesStmt = db.prepare(`
  SELECT e.c_entry_code AS code,
         ec.c_entry_desc_chn AS desc_chn,
         e.c_year AS year,
         e.c_age  AS age,
         e.c_exam_rank AS exam_rank,
         e.c_exam_field AS exam_field
  FROM ENTRY_DATA e
  LEFT JOIN ENTRY_CODES ec ON ec.c_entry_code = e.c_entry_code
  WHERE e.c_personid = ?
  ORDER BY e.c_year
`);

const officesStmt = db.prepare(`
  SELECT pto.c_posting_id AS posting_id,
         pto.c_office_id  AS office_id,
         oc.c_office_chn  AS office_chn,
         oc.c_office_pinyin AS office_py,
         pto.c_firstyear  AS first_year,
         pto.c_lastyear   AS last_year,
         oc.c_category_1  AS category_1
  FROM POSTING_DATA pd
  JOIN POSTED_TO_OFFICE_DATA pto ON pto.c_posting_id = pd.c_posting_id
  LEFT JOIN OFFICE_CODES oc ON oc.c_office_id = pto.c_office_id
  WHERE pd.c_personid = ?
  ORDER BY pto.c_firstyear
`);

const eventsStmt = db.prepare(`
  SELECT e.c_event_code AS code,
         ec.c_event_name_chn AS name_chn,
         e.c_year AS year,
         e.c_event AS event_text,
         e.c_role AS role,
         e.c_addr_id AS addr_id,
         a.c_name_chn AS addr_chn,
         a.x_coord AS x,
         a.y_coord AS y
  FROM EVENTS_DATA e
  LEFT JOIN EVENT_CODES ec ON ec.c_event_code = e.c_event_code
  LEFT JOIN ADDR_CODES a ON a.c_addr_id = e.c_addr_id
  WHERE e.c_personid = ?
  ORDER BY e.c_year
`);

const associationsStmt = db.prepare(`
  SELECT a.c_assoc_code AS code,
         ac.c_assoc_desc_chn AS desc_chn,
         a.c_assoc_id  AS person_id,
         bm.c_name_chn AS person_chn,
         bm.c_name     AS person_py,
         bm.c_birthyear AS birth_year,
         bm.c_deathyear AS death_year,
         bm.c_index_year AS index_year,
         bm.c_dy AS dynasty_code,
         d.c_dynasty_chn AS dynasty_chn,
         a.c_assoc_first_year AS first_year,
         a.c_assoc_last_year  AS last_year
  FROM ASSOC_DATA a
  LEFT JOIN ASSOC_CODES ac ON ac.c_assoc_code = a.c_assoc_code
  LEFT JOIN BIOG_MAIN bm   ON bm.c_personid    = a.c_assoc_id
  LEFT JOIN DYNASTIES d    ON d.c_dy           = bm.c_dy
  WHERE a.c_personid = ?
`);

const kinshipsStmt = db.prepare(`
  SELECT k.c_kin_code AS code,
         kc.c_kinrel_chn AS desc_chn,
         k.c_kin_id   AS person_id,
         bm.c_name_chn AS person_chn,
         bm.c_name     AS person_py,
         bm.c_birthyear AS birth_year,
         bm.c_deathyear AS death_year,
         bm.c_index_year AS index_year,
         bm.c_dy AS dynasty_code,
         d.c_dynasty_chn AS dynasty_chn
  FROM KIN_DATA k
  LEFT JOIN KINSHIP_CODES kc ON kc.c_kincode = k.c_kin_code
  LEFT JOIN BIOG_MAIN bm     ON bm.c_personid = k.c_kin_id
  LEFT JOIN DYNASTIES d      ON d.c_dy        = bm.c_dy
  WHERE k.c_personid = ?
`);

function getPersonDetail(personId) {
  const summary = getPersonSummary(personId);
  if (!summary) return null;
  return {
    ...summary,
    alt_names: altNamesStmt.all(personId),
    statuses: statusesStmt.all(personId),
    addresses: addressesStmt.all(personId),
    entries: entriesStmt.all(personId),
    offices: officesStmt.all(personId),
    events: eventsStmt.all(personId),
    associations: associationsStmt.all(personId),
    kinships: kinshipsStmt.all(personId),
  };
}

function getNeighbors(personId) {
  return {
    associations: associationsStmt.all(personId),
    kinships: kinshipsStmt.all(personId),
  };
}

module.exports = {
  getPersonSummary,
  getPersonDetail,
  getNeighbors,
  altNamesStmt,
  statusesStmt,
  addressesStmt,
  entriesStmt,
  officesStmt,
  eventsStmt,
  associationsStmt,
  kinshipsStmt,
};
