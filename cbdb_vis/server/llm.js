"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-v4-pro";
const CACHE_TTL_MS = Number(process.env.LLM_CACHE_TTL_MS) || 24 * 60 * 60 * 1000;

let client = null;
const cache = new Map();

loadLocalEnv();

function loadLocalEnv() {
  const appDir = path.resolve(__dirname, "..");
  const repoDir = path.resolve(appDir, "..");
  const candidates = [
    path.join(appDir, ".env.local"),
    path.join(appDir, ".env"),
    path.join(repoDir, ".env.local"),
    path.join(repoDir, ".env"),
  ];

  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) continue;
      const key = match[1];
      if (process.env[key] != null) continue;
      process.env[key] = unquoteEnvValue(match[2].trim());
    }
  }
}

function unquoteEnvValue(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  const commentAt = value.search(/\s+#/);
  return commentAt >= 0 ? value.slice(0, commentAt).trim() : value;
}

function getConfig() {
  const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY || "";
  return {
    apiKey,
    baseURL: process.env.DEEPSEEK_BASE_URL || process.env.OPENAI_BASE_URL || DEFAULT_BASE_URL,
    model: process.env.DEEPSEEK_MODEL || DEFAULT_MODEL,
    timeout: Number(process.env.LLM_TIMEOUT_MS) || 35_000,
  };
}

function isConfigured() {
  return Boolean(getConfig().apiKey);
}

function getClient() {
  const cfg = getConfig();
  if (!cfg.apiKey) {
    const err = new Error("DeepSeek API key is not configured");
    err.status = 503;
    throw err;
  }
  if (!client) {
    client = new OpenAI({
      apiKey: cfg.apiKey,
      baseURL: cfg.baseURL,
      timeout: cfg.timeout,
      maxRetries: 1,
    });
  }
  return client;
}

function stableVirtualId(seed) {
  const digest = crypto.createHash("sha1").update(String(seed)).digest("hex").slice(0, 8);
  return -parseInt(digest, 16);
}

function getCached(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.t > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.v;
}

function setCached(key, value) {
  cache.set(key, { t: Date.now(), v: value });
  return value;
}

function compactPersonForPrompt(person) {
  const pickList = (items, fields, limit) => (items || []).slice(0, limit).map((item) => {
    const out = {};
    for (const f of fields) out[f] = item[f] ?? null;
    return out;
  });

  return {
    id: person.id,
    name_chn: person.name_chn || null,
    name_py: person.name_py || null,
    birth_year: person.birth_year ?? null,
    death_year: person.death_year ?? null,
    dynasty_chn: person.dynasty_chn || null,
    index_year: person.index_year ?? null,
    index_addr_chn: person.index_addr_chn || null,
    alt_names: pickList(person.alt_names, ["type_chn", "name_chn"], 12),
    statuses: pickList(person.statuses, ["desc_chn", "first_year", "last_year"], 12),
    addresses: pickList(person.addresses, ["type_chn", "name_chn", "first_year", "last_year"], 8),
    entries: pickList(person.entries, ["desc_chn", "year", "exam_field"], 8),
    offices: pickList(person.offices, ["office_chn", "first_year", "last_year", "category_1"], 12),
    events: pickList(person.events, ["name_chn", "year", "event_text", "addr_chn"], 12),
    associations: pickList(
      person.associations,
      ["desc_chn", "person_chn", "birth_year", "death_year", "dynasty_chn", "first_year", "last_year"],
      16
    ),
    kinships: pickList(person.kinships, ["desc_chn", "person_chn", "birth_year", "death_year", "dynasty_chn"], 16),
  };
}

function getMissingFields(person) {
  if (!person) return [];
  const missing = [];
  if (person.birth_year == null) missing.push("birth_year");
  if (person.death_year == null) missing.push("death_year");
  if (!person.dynasty_chn) missing.push("dynasty_chn");
  if (!person.index_addr_chn) missing.push("index_addr_chn");
  if (!(person.alt_names || []).length) missing.push("alt_names");
  if (!(person.statuses || []).length) missing.push("statuses");
  if (!(person.addresses || []).length) missing.push("addresses");
  if (!(person.entries || []).length) missing.push("entries");
  if (!(person.offices || []).length) missing.push("offices");
  if (!(person.events || []).length) missing.push("events");
  if (!(person.associations || []).length) missing.push("associations");
  if (!(person.kinships || []).length) missing.push("kinships");
  return missing;
}

function parseJsonContent(content) {
  if (!content || !String(content).trim()) {
    const err = new Error("LLM returned empty JSON content");
    err.status = 502;
    throw err;
  }

  let text = String(content).trim();
  const fence = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) text = fence[1].trim();

  try {
    return JSON.parse(text);
  } catch (e) {
    const err = new Error("LLM returned invalid JSON");
    err.status = 502;
    err.cause = e;
    throw err;
  }
}

function textOrNull(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s ? s : null;
}

function intOrNull(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

function confidence(value) {
  return ["high", "medium", "low"].includes(value) ? value : "low";
}

function list(value, mapper, limit = 12) {
  if (!Array.isArray(value)) return [];
  return value.map(mapper).filter(Boolean).slice(0, limit);
}

function normalizeAltName(item) {
  const name = textOrNull(item && item.name_chn);
  if (!name) return null;
  return {
    type_chn: textOrNull(item.type_chn) || "別名",
    name_chn: name,
    name_py: textOrNull(item.name_py),
  };
}

function normalizeStatus(item) {
  const desc = textOrNull(item && item.desc_chn);
  if (!desc) return null;
  return {
    desc_chn: desc,
    first_year: intOrNull(item.first_year),
    last_year: intOrNull(item.last_year),
  };
}

function normalizeAddress(item) {
  const name = textOrNull(item && item.name_chn);
  if (!name) return null;
  return {
    type_chn: textOrNull(item.type_chn) || "相關地",
    name_chn: name,
    first_year: intOrNull(item.first_year),
    last_year: intOrNull(item.last_year),
  };
}

function normalizeEntry(item) {
  const desc = textOrNull(item && item.desc_chn);
  if (!desc) return null;
  return {
    desc_chn: desc,
    year: intOrNull(item.year),
    exam_field: textOrNull(item.exam_field),
  };
}

function normalizeOffice(item) {
  const office = textOrNull(item && item.office_chn);
  if (!office) return null;
  return {
    office_chn: office,
    first_year: intOrNull(item.first_year),
    last_year: intOrNull(item.last_year),
    category_1: textOrNull(item.category_1),
  };
}

function normalizeEvent(item) {
  const name = textOrNull(item && item.name_chn);
  const detail = textOrNull(item && item.event_text);
  if (!name && !detail) return null;
  return {
    year: intOrNull(item.year),
    name_chn: name || "事件",
    event_text: detail || name || "事件",
    addr_chn: textOrNull(item.addr_chn),
  };
}

function normalizeRelation(item) {
  const person = textOrNull(item && item.person_chn);
  if (!person) return null;
  return {
    desc_chn: textOrNull(item.desc_chn) || "相關",
    person_chn: person,
    birth_year: intOrNull(item.birth_year),
    death_year: intOrNull(item.death_year),
    dynasty_chn: textOrNull(item.dynasty_chn),
    first_year: intOrNull(item.first_year),
    last_year: intOrNull(item.last_year),
  };
}

function normalizeSupplement(raw) {
  const sup = raw && raw.supplement ? raw.supplement : {};
  return {
    source: "llm",
    provider: "DeepSeek",
    model: getConfig().model,
    generated_at: new Date().toISOString(),
    confidence: confidence(raw && raw.confidence),
    summary: textOrNull(raw && raw.summary),
    note: textOrNull(raw && raw.note),
    warnings: list(raw && raw.warnings, textOrNull, 8),
    supplement: {
      birth_year: intOrNull(sup.birth_year),
      death_year: intOrNull(sup.death_year),
      dynasty_chn: textOrNull(sup.dynasty_chn),
      index_addr_chn: textOrNull(sup.index_addr_chn),
      alt_names: list(sup.alt_names, normalizeAltName, 10),
      statuses: list(sup.statuses, normalizeStatus, 12),
      addresses: list(sup.addresses, normalizeAddress, 8),
      entries: list(sup.entries, normalizeEntry, 8),
      offices: list(sup.offices, normalizeOffice, 12),
      events: list(sup.events, normalizeEvent, 12),
      associations: list(sup.associations, normalizeRelation, 12),
      kinships: list(sup.kinships, normalizeRelation, 12),
    },
  };
}

function normalizeVirtualPerson(raw, query) {
  const person = raw && raw.person ? raw.person : {};
  const name = textOrNull(person.name_chn) || textOrNull(query);
  return {
    found: raw && raw.found !== false,
    source: "llm",
    provider: "DeepSeek",
    model: getConfig().model,
    generated_at: new Date().toISOString(),
    confidence: confidence(raw && raw.confidence),
    warnings: list(raw && raw.warnings, textOrNull, 8),
    source_note: textOrNull(raw && raw.source_note),
    person: {
      id: stableVirtualId(name),
      source: "llm",
      name_chn: name,
      name_py: textOrNull(person.name_py),
      birth_year: intOrNull(person.birth_year),
      death_year: intOrNull(person.death_year),
      dynasty_chn: textOrNull(person.dynasty_chn),
      index_addr_chn: textOrNull(person.index_addr_chn),
      summary: textOrNull(person.summary) || textOrNull(raw && raw.summary),
      alt_names: list(person.alt_names, normalizeAltName, 10),
      statuses: list(person.statuses, normalizeStatus, 12),
      addresses: list(person.addresses, normalizeAddress, 8),
      entries: list(person.entries, normalizeEntry, 8),
      offices: list(person.offices, normalizeOffice, 12),
      events: list(person.events, normalizeEvent, 12),
      associations: list(person.associations, normalizeRelation, 12),
      kinships: list(person.kinships, normalizeRelation, 12),
      llm_meta: {
        confidence: confidence(raw && raw.confidence),
        warnings: list(raw && raw.warnings, textOrNull, 8),
        note: textOrNull(raw && raw.source_note) || "此人物未由 CBDB 命中，以下內容由 AI 按通行史料知識補充。",
      },
    },
  };
}

function systemPrompt() {
  return `你是中國歷史人物資料補全助手。請只根據可靠、通行的歷史常識補充資料，用繁體中文回答，不要使用簡體中文。

必須輸出合法 JSON，不要輸出 Markdown，不要輸出解釋文字。若沒有把握，對單值填 null，對列表填 []，並在 warnings 中說明不確定性。年份一律用整數；公元前年用負整數；未知年份填 null。不要編造不存在的 CBDB 編號。

EXAMPLE JSON OUTPUT:
{
  "confidence": "medium",
  "summary": "一至二句繁體中文人物概述。",
  "warnings": ["若資料有爭議，在此提示。"],
  "supplement": {
    "birth_year": 1037,
    "death_year": 1101,
    "dynasty_chn": "宋",
    "index_addr_chn": "眉州眉山",
    "alt_names": [{"type_chn": "字", "name_chn": "子瞻"}],
    "statuses": [{"desc_chn": "文學家", "first_year": null, "last_year": null}],
    "addresses": [{"type_chn": "籍貫", "name_chn": "眉州眉山", "first_year": null, "last_year": null}],
    "entries": [{"desc_chn": "進士", "year": 1057, "exam_field": null}],
    "offices": [{"office_chn": "翰林學士", "first_year": null, "last_year": null, "category_1": "文官"}],
    "events": [{"year": 1079, "name_chn": "烏臺詩案", "event_text": "因詩文獲罪下獄。", "addr_chn": "汴京"}],
    "associations": [{"desc_chn": "師友", "person_chn": "歐陽修", "birth_year": 1007, "death_year": 1072, "dynasty_chn": "宋"}],
    "kinships": [{"desc_chn": "弟", "person_chn": "蘇轍", "birth_year": 1039, "death_year": 1112, "dynasty_chn": "宋"}]
  },
  "note": "AI 補充，需由研究者核驗。"
}`;
}

async function requestJson(messages, cacheKey) {
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const cfg = getConfig();
  const response = await getClient().chat.completions.create({
    model: cfg.model,
    messages,
    response_format: { type: "json_object" },
    max_tokens: Number(process.env.LLM_MAX_TOKENS) || 2200,
    stream: false,
    thinking: { type: "disabled" },
  });

  const content = response.choices && response.choices[0] && response.choices[0].message
    ? response.choices[0].message.content
    : "";
  return setCached(cacheKey, parseJsonContent(content));
}

async function supplementPerson(person, missingFields) {
  const missing = missingFields && missingFields.length ? missingFields : getMissingFields(person);
  const promptPerson = compactPersonForPrompt(person);
  const cacheKey = `supplement:${getConfig().model}:${person.id}:${missing.join(",")}`;

  const raw = await requestJson([
    { role: "system", content: systemPrompt() },
    {
      role: "user",
      content: `請根據以下 CBDB JSON 資料補充缺失欄位。只補 missing_fields 中列出的欄位；已有 CBDB 列表不要重複。若人物不夠知名或資料無把握，請保持 null 或 []。

missing_fields JSON:
${JSON.stringify(missing, null, 2)}

CBDB_PERSON JSON:
${JSON.stringify(promptPerson, null, 2)}`,
    },
  ], cacheKey);

  return {
    ...normalizeSupplement(raw),
    based_on_cbdb_id: person.id,
    name_chn: person.name_chn || null,
    missing_fields: missing,
  };
}

async function lookupPerson(query) {
  const q = String(query || "").trim().slice(0, 80);
  if (!q) {
    const err = new Error("query required");
    err.status = 400;
    throw err;
  }
  const cacheKey = `lookup:${getConfig().model}:${q}`;
  const raw = await requestJson([
    { role: "system", content: systemPrompt() },
    {
      role: "user",
      content: `CBDB 搜尋沒有命中以下人物名稱，請嘗試根據通行史料知識建立一份可讀的人物資料 JSON。若不能確認此人為中國歷史人物，請輸出 {"found": false, "confidence": "low", "warnings": ["原因"], "person": {"name_chn": "${q}"}}。

查詢 JSON:
{"name": ${JSON.stringify(q)}}

請輸出 JSON，格式如下：
{
  "found": true,
  "confidence": "medium",
  "warnings": [],
  "source_note": "此人物未由 CBDB 命中，以下內容由 AI 補充。",
  "person": {
    "name_chn": "人物姓名",
    "name_py": null,
    "birth_year": null,
    "death_year": null,
    "dynasty_chn": null,
    "index_addr_chn": null,
    "summary": "一至二句繁體中文概述。",
    "alt_names": [],
    "statuses": [],
    "addresses": [],
    "entries": [],
    "offices": [],
    "events": [],
    "associations": [],
    "kinships": []
  }
}`,
    },
  ], cacheKey);

  return normalizeVirtualPerson(raw, q);
}

module.exports = {
  isConfigured,
  getConfig,
  getMissingFields,
  supplementPerson,
  lookupPerson,
};
