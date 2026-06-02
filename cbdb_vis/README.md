# 歷史群體可視分析系統 · CBDB Visual Analytics

> 專業創新實踐課程作品 — 基於 [中國歷代人物傳記資料庫 (CBDB)](https://projects.iq.harvard.edu/chinesecbdb/home) SQLite 版本構建的歷史人物群體可視化分析系統。

## 目錄結構

```
cbdb_vis/
├── package.json
├── server/                # Node.js 後端
│   ├── index.js           # Express 入口（路由註冊）
│   ├── db.js              # better-sqlite3 連接（只讀）
│   ├── queries.js         # 預編譯人物詳情查詢
│   ├── search.js          # 姓名／字號搜索
│   ├── network.js         # 多跳社會網絡建構
│   └── aggregations.js    # 身份／地理聚合
└── public/                # 前端靜態資源
    ├── index.html
    ├── css/app.css
    └── js/
        ├── api.js         # fetch 包裝
        ├── network.js     # D3 力導向圖
        ├── identity.js    # ECharts 條形圖
        ├── geo.js         # Leaflet 地圖
        ├── timeline.js    # ECharts 散點時間軸
        ├── detail.js      # 人物詳情面板
        └── app.js         # 頂層編排
```

## 環境依賴

| 工具 | 版本 |
|------|------|
| Node.js | ≥ 18 |
| 系統工具 | sqlite3, p7zip-full（解壓 CBDB） |
| 可選 LLM | DeepSeek OpenAI 相容 API（用於 CBDB 缺失欄位補充） |

CBDB SQLite 數據文件路徑（默認）：

```
../cbdb_sqlite/cbdb_20260328.sqlite3
```

如需切換到其他發行版本，修改 `server/db.js` 中的 `DB_PATH`。

DeepSeek 補充層為可選功能。後端啟動時會自動讀取 `cbdb_vis/.env.local`（或 `.env`），密鑰不會傳到前端，也不要提交到倉庫：

```dotenv
DEEPSEEK_API_KEY=你的 DeepSeek API Key
DEEPSEEK_MODEL=deepseek-v4-pro
DEEPSEEK_BASE_URL=https://api.deepseek.com
```

未配置 `DEEPSEEK_API_KEY` 時，CBDB 主功能照常可用，只是不顯示 AI 補充結果。

## 啟動

```bash
cd cbdb_vis
npm install                # 已包含 better-sqlite3 / express / cors / compression / openai
npm start                  # 默認監聽 http://localhost:3000
PORT=8080 npm start        # 也可指定端口
```

瀏覽器打開 http://localhost:3000 即可。

## 系統功能（對應 PPT 案例）

| 模塊 | 數據源 | 技術 |
|------|--------|------|
| 中心人物設置（搜索 + 預設群體） | `BIOG_MAIN` + `ALTNAME_DATA` | 原生 input + 後端 LIKE 搜索（兼字號） |
| 動態社會網絡 | `ASSOC_DATA` + `KIN_DATA` | D3.js 力導向圖；可拖拽 / 縮放 / 聚焦鄰居；節點上限可選 80–1200，標籤密度（自動 / 全部 / 僅中心）可調，內置「圖內搜索」高亮 |
| 人物身份分布 | `STATUS_DATA` + `STATUS_CODES` | ECharts 水平條形圖；返回 Top 30 身份，顯示窗口 12 條，垂直滾動瀏覽其餘 |
| 人物地理分布 | `BIOG_MAIN.c_index_addr_id` + `ADDR_CODES.x/y_coord` | Leaflet + OpenStreetMap，按籍貫聚合 |
| 人物年表故事 | `EVENTS_DATA` + `POSTED_TO_OFFICE_DATA` + `ENTRY_DATA` | 自繪 SVG 「畫卷式」生命帶（life-ribbon）：左側頭像+姓名+生卒；中央米黃色長帶為生命周期，金色點標記出生、深色豎條標記卒；帶上鋪入仕（藍菱形）、任職（綠色 tick）、事件（紅圓點）三類標誌；下方為十年刻度 |
| 人物詳情 | `BIOG_MAIN` 等 9 張表彙總 + 可選 DeepSeek 補充 | 原生 DOM；地址 / 仕宦 / 交往 / 親屬列表預設摺疊（8 / 10 / 12 / 12 條），點「展開全部」可看完所有條目；CBDB 缺失欄位可按需用 AI 生成 JSON 補充，並明確標示來源 |

## API 列表

| Method | Path | 用途 | 主要參數上限 |
|--------|------|------|--------------|
| GET | `/api/health` | 健康檢查 | — |
| GET | `/api/search?q=…&limit=30` | 姓名／字號搜索（模糊） | `limit ≤ 100` |
| GET | `/api/person/:id` | 人物完整詳情（彙總 9 張表） | — |
| GET | `/api/person/:id/llm-supplement` | 對既有 CBDB 人物缺失欄位做 DeepSeek JSON 補充 | 需 `DEEPSEEK_API_KEY` |
| GET | `/api/llm/person?q=…` | CBDB 查無人物時，用 DeepSeek 產生可讀人物資料 | 需 `DEEPSEEK_API_KEY` |
| GET | `/api/llm/status` | 檢視 LLM 補充層配置狀態（不返回密鑰） | — |
| GET | `/api/network?seeds=1,2,3&depth=1&maxNodes=150&maxPerNode=80` | 多跳社會網絡 | `maxNodes ≤ 1500`，`maxPerNode ≤ 300` |
| GET | `/api/identity-distribution?ids=…` | 群體身份統計（Top 80） | — |
| GET | `/api/geo?ids=…` | 群體籍貫聚類 | — |
| GET | `/api/timeline/:id` | 個人年表彙總（生 / 入仕 / 任職 / 事件 / 卒） | — |
| GET | `/api/dynasties` | 朝代列表 | — |
| GET | `/api/presets` | 預設群體（吳門四家、唐宋八大家） | — |

## 創新點

1. **跨表彙總的人物詳情**：CBDB 資料極度規範化，本系統一次性查詢 9 張表並組裝成適合人文研究者閱讀的 JSON。
2. **可調節點上限與大圖渲染策略**：CBDB 中熱門人物（如蘇軾 1 跳鄰居 ≥ 1000）關係網爆炸；前端提供 80 / 150 / 300 / 500 / 800 / 1200 共 6 檔節點上限，後端硬上限 1500。力導向參數（charge / link distance / collide / alphaDecay）按節點數動態縮放，保證 500+ 節點時仍流暢。
3. **三檔標籤密度**：「自動」按節點數分檔過濾低度數節點標籤；「全部」一次性顯示；「僅中心」只標記 seed。避免大圖文字壓死節點。
4. **圖內搜索高亮**：標題欄右側「圖內搜索」即時模糊匹配當前圖中節點，命中節點高亮邊框，其鄰居保留可見，其餘節點變淡。
5. **詳情列表「展開全部」**：地址（前 8）／仕宦（前 10）／交往（前 12）／親屬（前 12）默認摺疊，一鍵展開全部 N 條，再點可收起。蘇軾的 1033 條社會交往不再被截斷。
6. **字號搜索**：人文學者常按「字／號」回憶人物，後端在主名搜不到時回退查 `ALTNAME_DATA`，前端在建議下拉直接顯示「字號:東坡居士」等元數據。
7. **DeepSeek 補充層**：對 CBDB 缺失欄位或查無人物提供按需 JSON 補充；後端使用 OpenAI SDK 相容介面、`response_format: {"type":"json_object"}` 與關閉思考模式，前端把結果標為 AI 補充，不混入 CBDB 原始資料。
8. **混合身份配色**：節點顏色按 `STATUS_DATA` 的「主要身份」（畫家／詩人／官員等）映射，使群體中職業構成一目了然。
9. **預設群體**：圍繞「吳門四家」「唐宋八大家」等經典歷史群體，便於老師演示與用戶快速上手。

## 截圖

- `docs/cbdb-after-preset.png` — 明代吳門四家視圖
- `docs/cbdb-tangsong-sushi.png` — 唐宋八大家視圖（蘇軾被選中）
- `docs/cbdb-large-graph.png` — 唐宋八大家在 500 節點上限下的大圖視圖（500 人物 / 2072 關係）
- `docs/cbdb-timeline-ribbon.png` — 蘇軾「生命帶」年表（1036–1101，36 任職 + 2 入仕）
- `docs/cbdb-identity-chart.png` — 人物身份分布 ECharts 條形圖
- `docs/cbdb-geo-map.png` — 人物地理分布 Leaflet 地圖
- `docs/cbdb-search-suggest.png` — 姓名／字號搜索建議下拉
- `docs/cbdb-detail-panel.png` — 人物詳情面板（展開全部列表）
- `docs/cbdb-ai-supplement.png` — DeepSeek AI 補充缺失欄位結果

## 數據限制

- CBDB 釋出 2025-05 以後 `c_index_year` 等字段不再持續維護，部分人物 `index_year` 為空。
- CBDB 多個年份欄位會用 `0` 表示未知／未詳；`ASSOC_DATA.c_assoc_first_year` 還會用 `-1`、`-9999` 作為未定年哨兵值，少量 `POSTED_TO_OFFICE_DATA.c_firstyear` 也有 `-1`、`-2`。本系統在後端統一把這些值正規化為 `null`，但保留真實公元前年份（如孔子 `-551`）。
- 多個碼表的 `0` 代表「未詳／Unknown」，包括朝代、地址、身份、入仕、仕宦、事件、社會關係、親屬關係、別名類型與地址類型；這些未知碼不作為有效資料計入缺失判斷、身份統計或 LLM prompt。
- `EVENTS_DATA.c_event_code = 0` 只代表事件類型未詳；若 `c_event` 有文字，本系統仍保留事件文字，避免丟失「熙寧變法」等可讀史事。
- 部分歷史地名 `x_coord/y_coord` 缺失；另有若干地名座標為 `(0, 0)`，本系統視為不可定位，不會放入地圖聚類。
- DeepSeek 補充結果來自模型推斷，只作研究提示；介面會標示「AI 補充」，不作為 CBDB 原始資料或網絡統計依據。

## License

代碼自由使用於課程交付。CBDB 數據遵循其官方 CC-BY-NC-SA 4.0 協議。
