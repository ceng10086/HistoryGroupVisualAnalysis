"use strict";

const UNKNOWN_TEXTS = new Set([
  "",
  "未詳",
  "[未詳]",
  "未知",
  "unknown",
  "[unknown]",
  "[undefined]",
  "undefined",
  "not available or applicable",
]);

const MAX_REASONABLE_YEAR = 2100;
const MIN_REASONABLE_YEAR = -3000;

function text(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s ? s : null;
}

function isUnknownText(value) {
  const s = text(value);
  if (!s) return true;
  return UNKNOWN_TEXTS.has(s.toLowerCase());
}

function knownText(value) {
  return isUnknownText(value) ? null : text(value);
}

function numberOrNull(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function intOrNull(value) {
  const n = numberOrNull(value);
  return Number.isInteger(n) ? n : null;
}

function knownId(value) {
  const n = intOrNull(value);
  return n && n !== 0 ? n : null;
}

function knownCode(value) {
  return knownId(value);
}

function year(value, options = {}) {
  const n = intOrNull(value);
  if (n == null) return null;
  if (n === 0 || n === -9999 || n === 32767) return null;
  if (options.unknownValues && options.unknownValues.includes(n)) return null;
  if (n > MAX_REASONABLE_YEAR || n < MIN_REASONABLE_YEAR) return null;
  return n;
}

function assocYear(value) {
  return year(value, { unknownValues: [-1] });
}

function officeYear(value) {
  return year(value, { unknownValues: [-1, -2] });
}

function coordinatePair(x, y) {
  const nx = numberOrNull(x);
  const ny = numberOrNull(y);
  if (nx == null || ny == null) return { x: null, y: null };
  if (nx === 0 && ny === 0) return { x: null, y: null };
  return { x: nx, y: ny };
}

function validYear(value) {
  return year(value) != null;
}

function normalizePersonSummary(row) {
  if (!row) return null;
  const addrId = knownId(row.index_addr_id);
  const coords = coordinatePair(row.index_addr_x, row.index_addr_y);
  return {
    ...row,
    birth_year: year(row.birth_year),
    death_year: year(row.death_year),
    dynasty_code: knownCode(row.dynasty_code),
    dynasty_chn: knownCode(row.dynasty_code) ? knownText(row.dynasty_chn) : null,
    index_year: year(row.index_year),
    index_addr_id: addrId,
    index_addr_chn: addrId ? knownText(row.index_addr_chn) : null,
    index_addr_x: addrId ? coords.x : null,
    index_addr_y: addrId ? coords.y : null,
    notes: knownText(row.notes),
  };
}

function normalizeAltName(row) {
  if (!row) return null;
  const name = knownText(row.name_chn);
  if (!name) return null;
  return {
    ...row,
    name_chn: name,
    name_py: text(row.name_py),
    type_code: knownCode(row.type_code),
    type_chn: knownCode(row.type_code) ? knownText(row.type_chn) : null,
  };
}

function normalizeStatus(row) {
  if (!row) return null;
  const code = knownCode(row.code);
  const desc = code ? knownText(row.desc_chn) : null;
  if (!desc) return null;
  return {
    ...row,
    code,
    desc_chn: desc,
    desc_py: knownText(row.desc_py),
    first_year: year(row.first_year),
    last_year: year(row.last_year),
  };
}

function normalizeAddress(row) {
  if (!row) return null;
  const addrId = knownId(row.addr_id);
  const name = addrId ? knownText(row.name_chn) : null;
  if (!name) return null;
  const coords = coordinatePair(row.x, row.y);
  return {
    ...row,
    addr_id: addrId,
    type_code: knownCode(row.type_code),
    type_chn: knownCode(row.type_code) ? knownText(row.type_chn) : null,
    name_chn: name,
    name_py: text(row.name_py),
    x: coords.x,
    y: coords.y,
    first_year: year(row.first_year),
    last_year: year(row.last_year),
  };
}

function normalizeEntry(row) {
  if (!row) return null;
  const code = knownCode(row.code);
  const desc = code ? knownText(row.desc_chn) : null;
  if (!desc) return null;
  return {
    ...row,
    code,
    desc_chn: desc,
    year: year(row.year),
  };
}

function normalizeOffice(row) {
  if (!row) return null;
  const officeId = knownId(row.office_id);
  const office = officeId ? knownText(row.office_chn) : null;
  if (!office) return null;
  return {
    ...row,
    office_id: officeId,
    office_chn: office,
    office_py: text(row.office_py),
    first_year: officeYear(row.first_year),
    last_year: officeYear(row.last_year),
    category_1: knownText(row.category_1),
  };
}

function normalizeEvent(row) {
  if (!row) return null;
  const code = knownCode(row.code);
  const eventText = knownText(row.event_text);
  const eventName = code ? knownText(row.name_chn) : null;
  if (!eventText && !eventName) return null;
  const addrId = knownId(row.addr_id);
  const coords = coordinatePair(row.x, row.y);
  return {
    ...row,
    code,
    name_chn: eventName,
    year: year(row.year),
    event_text: eventText,
    addr_id: addrId,
    addr_chn: addrId ? knownText(row.addr_chn) : null,
    x: addrId ? coords.x : null,
    y: addrId ? coords.y : null,
  };
}

function normalizeAssociation(row) {
  if (!row) return null;
  const personId = knownId(row.person_id);
  if (!personId) return null;
  const code = knownCode(row.code);
  return {
    ...row,
    code,
    desc_chn: code ? knownText(row.desc_chn) : null,
    person_id: personId,
    person_chn: knownText(row.person_chn) || `#${personId}`,
    person_py: text(row.person_py),
    birth_year: year(row.birth_year),
    death_year: year(row.death_year),
    index_year: year(row.index_year),
    dynasty_code: knownCode(row.dynasty_code),
    dynasty_chn: knownCode(row.dynasty_code) ? knownText(row.dynasty_chn) : null,
    first_year: assocYear(row.first_year),
    last_year: assocYear(row.last_year),
  };
}

function normalizeKinship(row) {
  if (!row) return null;
  const personId = knownId(row.person_id);
  if (!personId) return null;
  const code = knownCode(row.code);
  return {
    ...row,
    code,
    desc_chn: code ? knownText(row.desc_chn) : null,
    person_id: personId,
    person_chn: knownText(row.person_chn) || `#${personId}`,
    person_py: text(row.person_py),
    birth_year: year(row.birth_year),
    death_year: year(row.death_year),
    index_year: year(row.index_year),
    dynasty_code: knownCode(row.dynasty_code),
    dynasty_chn: knownCode(row.dynasty_code) ? knownText(row.dynasty_chn) : null,
  };
}

function normalizeSearchResult(row) {
  const summary = normalizePersonSummary({
    id: row.id,
    name_chn: row.name_chn,
    name_py: row.name_py,
    birth_year: row.birth_year,
    death_year: row.death_year,
    female: row.female,
    dynasty_code: row.dynasty_code,
    dynasty_chn: row.dynasty_chn,
    index_year: row.index_year,
    index_addr_id: row.index_addr_id,
    index_addr_chn: row.index_addr_chn,
    index_addr_x: row.index_addr_x,
    index_addr_y: row.index_addr_y,
    notes: row.notes,
  });
  return {
    ...row,
    ...summary,
    alt_name_chn: knownText(row.alt_name_chn),
  };
}

function cleanList(items, normalizer) {
  return (items || []).map(normalizer).filter(Boolean);
}

function hasSupplementContent(payload) {
  if (!payload) return false;
  if (knownText(payload.summary) || knownText(payload.note)) return true;
  if (Array.isArray(payload.warnings) && payload.warnings.some(knownText)) return true;
  const sup = payload.supplement || {};
  if (year(sup.birth_year) != null || year(sup.death_year) != null) return true;
  if (knownText(sup.dynasty_chn) || knownText(sup.index_addr_chn)) return true;
  return [
    sup.alt_names,
    sup.statuses,
    sup.addresses,
    sup.entries,
    sup.offices,
    sup.events,
    sup.associations,
    sup.kinships,
  ].some((items) => Array.isArray(items) && items.length > 0);
}

module.exports = {
  isUnknownText,
  knownText,
  knownId,
  knownCode,
  year,
  assocYear,
  officeYear,
  validYear,
  coordinatePair,
  normalizePersonSummary,
  normalizeAltName,
  normalizeStatus,
  normalizeAddress,
  normalizeEntry,
  normalizeOffice,
  normalizeEvent,
  normalizeAssociation,
  normalizeKinship,
  normalizeSearchResult,
  cleanList,
  hasSupplementContent,
};
