"use strict";

/**
 * eval-llm-accuracy.js — CBDB LLM 補充準確度基準測試
 *
 * 選取 CBDB 中數據完整的歷史人物，依次隱藏某個 CBDB 已有欄位，
 * 交由 LLM 推斷後與真實值對比，輸出各欄位類型的準確率矩陣。
 *
 * 使用方式：
 *   cd cbdb_vis
 *   node scripts/eval-llm-accuracy.js                               # 默認: 4 核心欄位 × 10 人
 *   node scripts/eval-llm-accuracy.js --count=20                    # 測 20 人
 *   node scripts/eval-llm-accuracy.js --fields=birth_year,dynasty_chn
 *   node scripts/eval-llm-accuracy.js --delay=800                   # 調節 API 調用間隔
 *   node scripts/eval-llm-accuracy.js --targets=3767,1384,1762      # 只測指定人物 ID
 *   node scripts/eval-llm-accuracy.js --seed=42                     # 固定隨機種子
 *   node scripts/eval-llm-accuracy.js --output=./eval-results.json  # 寫 JSON
 *
 * 輸出 JSON 結構（供程序消費）：
 *   {
 *     generated_at, model, subject_count, fields_tested,
 *     summary: { per_field: { field: { total, correct, wrong, unknown, errors, ... } } },
 *     detailed_results: [{ person_id, name_chn, field, truth, llm_value,
 *                          classification: "correct"|"wrong"|"unknown"|"error",
 *                          llm_confidence, llm_warnings, comparison, llm_raw }],
 *     subjects: [{ id, name_chn, birth_year, death_year, dynasty_chn, index_addr_chn }]
 *   }
 *
 * 結果分類（classification）：
 *   correct  — LLM 輸出與 CBDB 真值匹配
 *   wrong    — LLM 輸出了錯誤值（最需關注的風險）
 *   unknown  — LLM 正確承認不知道（誠實行為）
 *   error    — API / 解析異常
 */

const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");
const OpenAI = require("openai");

// ── 默認配置 ──────────────────────────────────────────────────────
const DB_PATH = path.resolve(__dirname, "../../cbdb_sqlite/cbdb_20260328.sqlite3");
const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-v4-pro";
const DEFAULT_FIELDS = ["birth_year", "death_year", "dynasty_chn", "index_addr_chn"];
const DEFAULT_TEST_COUNT = 10;
const DEFAULT_DELAY_MS = 600;

// 一批數據豐富的知名歷史人物 ID（用於快速驗證，也可與隨機選擇混合）
const NOTABLE_IDS = [
  // 宋
  3767,   // 蘇軾
  1384,   // 歐陽修
  1762,   // 王安石
  1488,   // 司馬光
  8043,   // 范仲淹
  3257,   // 朱熹
  30359,  // 辛棄疾
  7111,   // 黃庭堅
  3640,   // 陸游
  19713,  // 李清照
  // 唐
  3332,   // 韓愈
  3605,   // 柳宗元
  3915,   // 杜甫
  32540,  // 李白
  32227,  // 白居易
  // 明
  34784,  // 沈周
  34673,  // 文徵明
  34868,  // 唐寅
];

// ── 字段定義 ──────────────────────────────────────────────────────
const FIELD_DEFS = {
  birth_year:     { label: "生年",  type: "int",  col: "birth_year" },
  death_year:     { label: "卒年",  type: "int",  col: "death_year" },
  dynasty_chn:    { label: "朝代",  type: "text", col: "dynasty_chn" },
  index_addr_chn: { label: "籍貫",  type: "text", col: "index_addr_chn" },
};

// ── 環境變量加載（與 server/llm.js 邏輯一致）───────────────────────
function loadEnv() {
  const appDir = path.resolve(__dirname, "..");
  const repoDir = path.resolve(appDir, "..");
  const candidates = [
    path.join(appDir, ".env.local"), path.join(appDir, ".env"),
    path.join(repoDir, ".env.local"), path.join(repoDir, ".env"),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const m = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!m) continue;
      if (process.env[m[1]] != null) continue;
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
        val = val.slice(1, -1);
      process.env[m[1]] = val;
    }
  }
}

// ── CLI 參數 ──────────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    count: DEFAULT_TEST_COUNT,
    fields: DEFAULT_FIELDS,
    delay: DEFAULT_DELAY_MS,
    model: null,
    output: null,
    targets: null,
    seed: null,
    includeNotable: true,
  };
  for (const a of args) {
    if (a.startsWith("--count="))          opts.count = parseInt(a.split("=")[1], 10);
    if (a.startsWith("--fields="))         opts.fields = a.split("=")[1].split(",").map(s => s.trim());
    if (a.startsWith("--delay="))          opts.delay = parseInt(a.split("=")[1], 10);
    if (a.startsWith("--model="))          opts.model = a.split("=")[1];
    if (a.startsWith("--output="))         opts.output = a.split("=")[1];
    if (a.startsWith("--targets="))        opts.targets = a.split("=")[1].split(",").map(Number);
    if (a.startsWith("--seed="))           opts.seed = parseInt(a.split("=")[1], 10);
    if (a === "--no-notable")              opts.includeNotable = false;
    if (a === "--help") {
      console.log(helpText());
      process.exit(0);
    }
  }
  return opts;
}

function helpText() {
  return `用法: node scripts/eval-llm-accuracy.js [選項]

選項:
  --count=N        測試人數（默認 10）
  --fields=f1,f2   測試欄位 (birth_year, death_year, dynasty_chn, index_addr_chn)
  --delay=N        API 調用間隔毫秒（默認 600）
  --model=NAME     模型名稱覆蓋
  --output=PATH    寫入詳細 JSON 報告
  --targets=ID,...  只測指定人物 CBDB ID
  --seed=N         固定隨機種子（重現結果）
  --no-notable     不混合知名人物，全隨機選取
  --help           顯示此幫助`;
}

// ── 簡易日誌 ──────────────────────────────────────────────────────
function log(msg) { process.stderr.write(`[eval] ${msg}\n`); }

// ── 簡易偽隨機（seed 可用時可重現）──────────────────────────────────
let rng = Math.random;
function seedRandom(s) {
  let h = 0;
  for (let i = 0; i < String(s).length; i++) {
    h = ((h << 5) - h) + String(s).charCodeAt(i); h |= 0;
  }
  function mulberry32(a) {
    return function() {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  rng = mulberry32(h);
}

// ── 數據庫 ────────────────────────────────────────────────────────
let db;
function openDb() { db = new Database(DB_PATH, { readonly: true, fileMustExist: true }); }

function findTestSubjects(count, targetIds, includeNotable) {
  if (targetIds && targetIds.length) {
    const stmt = db.prepare(`
      SELECT bm.c_personid AS id, bm.c_name_chn AS name_chn,
             bm.c_birthyear AS birth_year, bm.c_deathyear AS death_year,
             d.c_dynasty_chn AS dynasty_chn,
             a.c_name_chn AS index_addr_chn
      FROM BIOG_MAIN bm
      LEFT JOIN DYNASTIES d ON d.c_dy = bm.c_dy
      LEFT JOIN ADDR_CODES a ON a.c_addr_id = bm.c_index_addr_id
      WHERE bm.c_personid = ?
    `);
    const results = [];
    for (const id of targetIds) {
      const r = stmt.get(id);
      if (r) results.push(r);
      else log(`  跳過 ID=${id}：CBDB 中不存在`);
    }
    return results;
  }

  // 先收集知名人物（若啟用），再從符合條件的人物池中隨機補足
  const usedIds = new Set();
  const subjects = [];

  if (includeNotable) {
    const stmt = db.prepare(`
      SELECT bm.c_personid AS id, bm.c_name_chn AS name_chn,
             bm.c_birthyear AS birth_year, bm.c_deathyear AS death_year,
             d.c_dynasty_chn AS dynasty_chn,
             a.c_name_chn AS index_addr_chn
      FROM BIOG_MAIN bm
      LEFT JOIN DYNASTIES d ON d.c_dy = bm.c_dy
      LEFT JOIN ADDR_CODES a ON a.c_addr_id = bm.c_index_addr_id
      WHERE bm.c_personid = ?
    `);
    for (const id of NOTABLE_IDS) {
      if (subjects.length >= Math.ceil(count * 0.5)) break; // 知名人物不超過一半
      const r = stmt.get(id);
      if (r && isValidSubject(r)) {
        subjects.push(r);
        usedIds.add(r.id);
      }
    }
  }

  // 隨機補足
  const poolStmt = db.prepare(`
    SELECT bm.c_personid AS id, bm.c_name_chn AS name_chn,
           bm.c_birthyear AS birth_year, bm.c_deathyear AS death_year,
           d.c_dynasty_chn AS dynasty_chn,
           a.c_name_chn AS index_addr_chn
    FROM BIOG_MAIN bm
    LEFT JOIN DYNASTIES d ON d.c_dy = bm.c_dy
    LEFT JOIN ADDR_CODES a ON a.c_addr_id = bm.c_index_addr_id
    WHERE bm.c_birthyear IS NOT NULL AND bm.c_birthyear <> 0 AND bm.c_birthyear <> -9999
      AND bm.c_deathyear IS NOT NULL AND bm.c_deathyear <> 0 AND bm.c_deathyear <> -9999
      AND bm.c_dy IS NOT NULL AND bm.c_dy <> 0
      AND bm.c_index_addr_id IS NOT NULL AND bm.c_index_addr_id <> 0
      AND d.c_dynasty_chn IS NOT NULL
      AND a.c_name_chn IS NOT NULL
      AND bm.c_name_chn IS NOT NULL
    LIMIT 2000
  `);

  const pool = poolStmt.all().filter(s => !usedIds.has(s.id));

  // Fisher–Yates shuffle with our seeded rng
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const needed = count - subjects.length;
  for (let i = 0; i < needed && i < pool.length; i++) {
    subjects.push(pool[i]);
  }

  return subjects;
}

function isValidSubject(s) {
  if (!s || !s.name_chn) return false;
  if (s.birth_year == null || s.birth_year === 0 || s.birth_year === -9999) return false;
  if (s.death_year == null || s.death_year === 0 || s.death_year === -9999) return false;
  if (!s.dynasty_chn || s.dynasty_chn === "0") return false;
  if (!s.index_addr_chn) return false;
  return true;
}

// ── LLM 客戶端 ────────────────────────────────────────────────────
function createClient() {
  const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY 未配置");
  return new OpenAI({
    apiKey,
    baseURL: process.env.DEEPSEEK_BASE_URL || process.env.OPENAI_BASE_URL || DEFAULT_BASE_URL,
    timeout: 40_000,
    maxRetries: 1,
  });
}

function systemPrompt() {
  return `你是中國歷史人物資料補全助手。請只根據可靠、通行的歷史常識補充資料，用繁體中文回答。

必須輸出合法 JSON，不要輸出 Markdown，不要輸出解釋文字。若沒有把握，對單值填 null，對列表填 []，並在 warnings 中說明不確定性。年份一律用整數；公元前年用負整數；未知年份填 null。

EXAMPLE:
{"confidence":"medium","warnings":[],"birth_year":1037,"death_year":1101,"dynasty_chn":"宋","index_addr_chn":"眉州眉山"}`;
}

// 構建 LLM 上下文（給出除被測字段外的所有可用標量字段作為提示）
function buildContext(person, hiddenField) {
  const ctx = { name_chn: person.name_chn };
  const allFields = ["birth_year", "death_year", "dynasty_chn", "index_addr_chn"];
  for (const f of allFields) {
    if (f === hiddenField) continue;
    const val = person[f];
    if (val != null && val !== 0 && String(val).trim() !== "") ctx[f] = val;
  }
  return ctx;
}

function parseJsonContent(content) {
  if (!content || !String(content).trim()) return null;
  let text = String(content).trim();
  const fence = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) text = fence[1].trim();
  try { return JSON.parse(text); } catch (_) { return null; }
}

async function callLlm(client, model, person, hiddenField) {
  const fd = FIELD_DEFS[hiddenField];
  const ctx = buildContext(person, hiddenField);
  const prompt = `請補充以下中國歷史人物缺失的「${fd.label}」欄位。

已知上下文 JSON:
${JSON.stringify(ctx, null, 2)}

請輸出 JSON，只包含以下字段：
{
  "confidence": "medium",
  "warnings": [],
  "${hiddenField}": /* ${fd.type === "int" ? "整數年份，不確定則 null" : "繁體中文字串，不確定則 null"} */
}`;

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt() },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
    max_tokens: 600,
    stream: false,
    thinking: { type: "disabled" },
  });

  const raw = (response.choices && response.choices[0] && response.choices[0].message)
    ? response.choices[0].message.content
    : "";
  return { raw, parsed: parseJsonContent(raw) };
}

// ── 歸一化 ────────────────────────────────────────────────────────
function normYear(v) {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n === 0 || n === -9999 || n === 32767) return null;
  if (n > 2100 || n < -3000) return null;
  return n;
}

// LLM 有時會輸出字串 "null" / "NULL" / "未知" 等，統一視為 null
const NULL_TEXTS = new Set(["null", "NULL", "N/A", "未知", "未詳", "不詳", "無", "none", "undefined"]);
function normText(v) {
  if (v == null || v === "") return null;
  const s = String(v).trim();
  if (!s || NULL_TEXTS.has(s) || NULL_TEXTS.has(s.toLowerCase())) return null;
  return s;
}

// ── 比較與分類 ────────────────────────────────────────────────────
// 返回 { classification, ...metrics }
// classification ∈ { "correct", "wrong", "unknown", "error" }

function compareInt(truth, predicted) {
  const t = normYear(truth);
  if (t == null) return { classification: "error", error_detail: "truth_missing", exact: false, diff: null };

  const p = normYear(predicted);
  if (p == null) {
    return { classification: "unknown", exact: false, diff: null,
             note: "LLM returned null — honestly admitted uncertainty" };
  }

  const diff = p - t;
  const exact = diff === 0;
  const within5 = Math.abs(diff) <= 5;
  const within10 = Math.abs(diff) <= 10;
  const within50 = Math.abs(diff) <= 50;

  return {
    classification: exact ? "correct" : (within5 ? "correct" : "wrong"),
    exact, within_5: within5, within_10: within10, within_50: within50, diff,
    // 雖不完全一致但 ±5 年內對人文研究仍有參考價值，標為 partial
    partial: !exact && within5,
  };
}

function compareText(truth, predicted) {
  const t = normText(truth);
  if (!t) return { classification: "error", error_detail: "truth_missing", exact: false, contains: false };

  const p = normText(predicted);
  if (!p) {
    return { classification: "unknown", exact: false, contains: false,
             note: "LLM returned null — honestly admitted uncertainty" };
  }

  const exact = t === p;
  // 雙向包含：對「北宋」vs「宋」、「眉州眉山」vs「眉山」這類情形友好
  const contains = t.includes(p) || p.includes(t);

  return {
    classification: exact ? "correct" : (contains ? "correct" : "wrong"),
    exact, contains, truth: t, predicted: p,
    partial: !exact && contains,
  };
}

function compareField(truth, llmValue, fieldType) {
  return fieldType === "int" ? compareInt(truth, llmValue) : compareText(truth, llmValue);
}

// ── 主流程 ────────────────────────────────────────────────────────
async function main() {
  loadEnv();
  const opts = parseArgs();
  if (opts.seed != null) seedRandom(opts.seed);

  const model = opts.model || process.env.DEEPSEEK_MODEL || DEFAULT_MODEL;

  log(`模型: ${model}`);
  log(`測試人數: ${opts.count}`);
  log(`測試欄位: ${opts.fields.join(", ")}`);
  log(`API 調用間隔: ${opts.delay}ms`);
  if (opts.seed != null) log(`隨機種子: ${opts.seed}`);
  log("");

  const client = createClient();
  openDb();

  // 1. 選取測試對象
  const subjects = findTestSubjects(opts.count, opts.targets, opts.includeNotable);

  if (subjects.length === 0) {
    log("錯誤: 沒有找到合適的測試對象（4 個核心欄位不全）");
    process.exit(1);
  }

  log(`選取 ${subjects.length} 位測試對象:`);
  subjects.forEach((s, i) => {
    log(`  [${i + 1}] #${s.id} ${s.name_chn} | ${s.birth_year}–${s.death_year} | ${s.dynasty_chn} · ${s.index_addr_chn}`);
  });
  log("");

  // 2. 初始化統計結構
  // fieldStats[field] = { total, correct, wrong, unknown, errors, ... }
  const fieldStats = {};
  for (const f of opts.fields) {
    fieldStats[f] = {
      label: (FIELD_DEFS[f] || {}).label || f,
      type: (FIELD_DEFS[f] || {}).type || "text",
      total: 0, correct: 0, wrong: 0, unknown: 0, errors: 0,
      partial: 0,
      // 年份字段的額外累計
      within_5: 0, within_10: 0, within_50: 0,
      // 文本字段的額外累計
      contains: 0,
      results: [],
    };
  }

  const allResults = [];
  let taskIdx = 0;
  const totalTasks = subjects.length * opts.fields.length;

  // 3. 遍歷測試
  for (const person of subjects) {
    for (const field of opts.fields) {
      taskIdx++;
      const fd = FIELD_DEFS[field];
      if (!fd) { log(`[${taskIdx}/${totalTasks}] 跳過未知欄位: ${field}`); continue; }

      const truthValue = person[fd.col];
      const normFn = fd.type === "int" ? normYear : normText;
      if (normFn(truthValue) == null) continue; // CBDB 真值缺失，跳過

      log(`[${taskIdx}/${totalTasks}] #${person.id} ${person.name_chn} → ${fd.label}`);

      let record;
      try {
        const { raw, parsed } = await callLlm(client, model, person, field);
        const llmValue = (parsed && field in parsed) ? parsed[field] : null;

        const cmp = compareField(truthValue, llmValue, fd.type);

        record = {
          person_id: person.id,
          name_chn: person.name_chn,
          field,
          field_label: fd.label,
          truth: truthValue,
          llm_value: llmValue,
          llm_confidence: parsed ? parsed.confidence : null,
          llm_warnings: parsed ? (parsed.warnings || []) : [],
          classification: cmp.classification,
          comparison: cmp,
          llm_raw: raw,
        };

        // 按分類更新統計
        const stats = fieldStats[field];
        stats.total++;
        stats[cmp.classification]++;  // correct / wrong / unknown / error

        if (cmp.exact) stats.exact = (stats.exact || 0) + 1;
        if (cmp.within_5) stats.within_5++;
        if (cmp.within_10) stats.within_10++;
        if (cmp.within_50) stats.within_50++;
        if (cmp.contains) stats.contains++;
        if (cmp.partial) stats.partial++;
        stats.results.push(record);

        // 簡要輸出
        if (fd.type === "int") {
          const sym = cmp.classification === "correct" ? "✓" :
                      cmp.classification === "unknown" ? "○" : "✗";
          log(`  → 真值: ${truthValue}  LLM: ${llmValue}  Δ=${cmp.diff != null ? cmp.diff : "N/A"}  ${sym} [${cmp.classification}]`);
        } else {
          const sym = cmp.classification === "correct" ? "✓" :
                      cmp.classification === "unknown" ? "○" : "✗";
          log(`  → 真值: "${truthValue}"  LLM: "${llmValue}"  ${sym} [${cmp.classification}]`);
        }
      } catch (err) {
        log(`  → API 錯誤: ${err.message}`);
        record = {
          person_id: person.id, name_chn: person.name_chn,
          field, field_label: fd.label, truth: truthValue,
          classification: "error", error_detail: err.message,
        };
        const stats = fieldStats[field];
        stats.total++;
        stats.errors++;
        stats.results.push(record);
      }

      allResults.push(record);
      await sleep(opts.delay);
    }
  }

  // ── 4. 輸出報告 ──────────────────────────────────────────────────
  const sep = "═".repeat(70);
  const sub = "─".repeat(70);

  console.log(`\n${sep}`);
  console.log("  CBDB LLM 補充準確度基準測試報告");
  console.log(sep);
  console.log(`  模型: ${model}`);
  console.log(`  對象: ${subjects.length} 位歷史人物`);
  console.log(`  欄位: ${opts.fields.map(f => (FIELD_DEFS[f]||{}).label || f).join("、")}`);
  const totalDone = allResults.filter(r => r.classification !== "error").length;
  const totalErr = allResults.filter(r => r.classification === "error").length;
  console.log(`  測試: ${totalDone} 次完成 + ${totalErr} 次異常`);
  console.log(sub);

  for (const field of opts.fields) {
    const s = fieldStats[field];
    if (!s || s.total === 0) continue;
    const valid = s.total - s.errors;
    const fd = FIELD_DEFS[field];

    console.log(`\n  ▸ ${s.label} (${field})  [${valid} 次有效測試]`);

    if (fd && fd.type === "int") {
      console.log(`    正確 (Δ=0):     ${s.correct}/${valid} = ${pct(s.correct, valid)}`);
      const partials = s.results.filter(r => r.comparison && r.comparison.partial).length;
      if (partials > 0) {
        console.log(`    近似 (Δ≤5年):   ${partials}  — 含在"正確"中`);
      }
      console.log(`    錯誤 (Δ>5年):   ${s.wrong}/${valid} = ${pct(s.wrong, valid)}`);
      console.log(`    LLM 承認未知:   ${s.unknown}/${valid} = ${pct(s.unknown, valid)}`);
      // 僅對 LLM 給出數值的條目計算分佈
      const diffs = s.results
        .filter(r => r.comparison && r.comparison.diff != null)
        .map(r => Math.abs(r.comparison.diff));
      if (diffs.length) {
        diffs.sort((a, b) => a - b);
        const median = diffs[Math.floor(diffs.length / 2)];
        const mean = (diffs.reduce((a, b) => a + b, 0) / diffs.length).toFixed(1);
        const worst = diffs[diffs.length - 1];
        console.log(`    LLM 輸出數值時誤差分佈 (n=${diffs.length}):`);
        console.log(`      中位數: ${median} 年  平均: ${mean} 年  最大: ${worst} 年`);
      }
    } else {
      console.log(`    完全一致:       ${s.correct}/${valid} = ${pct(s.correct, valid)}`);
      if (s.partial > 0) {
        const partials = s.results.filter(r => r.comparison && r.comparison.partial && r.classification === "correct").length;
        console.log(`    包含匹配:       ${partials}  — 計入正確`);
      }
      console.log(`    錯誤:           ${s.wrong}/${valid} = ${pct(s.wrong, valid)}`);
      console.log(`    LLM 承認未知:   ${s.unknown}/${valid} = ${pct(s.unknown, valid)}`);
    }

    if (s.errors > 0) {
      console.log(`    ⚠ API 異常:     ${s.errors}`);
    }
  }

  // 交叉分析：有沒有 LLM 說 high confidence 但答錯的？
  console.log(`\n  ── 置信度 × 正確率交叉分析 ──`);
  const byConf = { high: [], medium: [], low: [] };
  for (const r of allResults) {
    if (r.classification === "error") continue;
    const c = (r.llm_confidence || "low").toLowerCase();
    (byConf[c] || byConf.low).push(r);
  }
  for (const level of ["high", "medium", "low"]) {
    const items = byConf[level];
    if (!items || !items.length) continue;
    const correct = items.filter(r => r.classification === "correct").length;
    const wrong = items.filter(r => r.classification === "wrong").length;
    const unknown = items.filter(r => r.classification === "unknown").length;
    console.log(`    ${level}: 正確=${correct}  錯誤=${wrong}  未知=${unknown}  (共${items.length})`);
  }

  // 按人物聚合
  console.log(`\n  ── 按人物聚合 ──`);
  const byPerson = new Map();
  for (const r of allResults) {
    const key = `${r.person_id}`;
    if (!byPerson.has(key)) byPerson.set(key, { name: r.name_chn, results: [] });
    byPerson.get(key).results.push(r);
  }
  for (const [pid, entry] of byPerson) {
    const rs = entry.results;
    const corr = rs.filter(r => r.classification === "correct").length;
    const wro = rs.filter(r => r.classification === "wrong").length;
    const unk = rs.filter(r => r.classification === "unknown").length;
    console.log(`    #${pid} ${entry.name}:  ✓${corr}  ✗${wro}  ○${unk}`);
  }

  console.log(`\n${sep}\n`);

  // 5. 寫 JSON（若指定）
  if (opts.output) {
    const outPath = path.resolve(opts.output);
    const summary = { per_field: {} };
    for (const [f, s] of Object.entries(fieldStats)) {
      summary.per_field[f] = {
        label: s.label,
        total: s.total,
        correct: s.correct,
        wrong: s.wrong,
        unknown: s.unknown,
        errors: s.errors,
        partial: s.partial,
      };
    }

    const report = {
      generated_at: new Date().toISOString(),
      model,
      subject_count: subjects.length,
      fields_tested: opts.fields,
      total_tests: allResults.length,
      summary,
      detailed_results: allResults,
      subjects: subjects.map(s => ({
        id: s.id, name_chn: s.name_chn,
        birth_year: s.birth_year, death_year: s.death_year,
        dynasty_chn: s.dynasty_chn, index_addr_chn: s.index_addr_chn,
      })),
    };
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
    log(`JSON 報告已寫入: ${outPath}`);
  }

  db.close();
}

// ── 工具函數 ──────────────────────────────────────────────────────
function pct(num, denom) {
  if (!denom) return "N/A";
  return ((num / denom) * 100).toFixed(1) + "%";
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── 啟動 ──────────────────────────────────────────────────────────
main().catch(err => {
  console.error(err);
  try { db && db.close(); } catch (_) {}
  process.exit(1);
});
