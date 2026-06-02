# 結題報告草案 · 歷史群體可視分析（CBDB）

> 課程：本科專業創新實踐  
> 選題方向：可視化（VIS）+ 數字人文（DH）  
> 數據集：中國歷代人物傳記資料庫（CBDB）SQLite 版  
> 報告日期：2026-04-30  

---

## 1. 選題意義及研究現状

### 1.1 選題背景
中國歷代人物傳記資料庫（China Biographical Database, CBDB）由哈佛燕京學社、中央研究院歷史語言研究所與北京大學中國古代史研究中心共同維護，截至 2026 年 3 月已收錄 **657,479** 位歷史人物的姓名、字號、籍貫、生卒、社會關係、仕宦履歷、著述等多維信息，是當代中文數字人文研究最重要的結構化基礎之一。

### 1.2 研究現状
目前 CBDB 官方提供：
1. SQLite / Access 數據庫文件下載；
2. 線上查詢介面（單人物為主）；
3. Pajek / Gephi 等網絡分析工具的數據格式導出。

但官方檢索界面**以「逐人查詢」為中心**，研究者在面對「群體」時（例如：吳門四家、唐宋八大家、東林黨人）需要自行寫 SQL、再導入 Gephi、ArcGIS 等工具拼裝視圖，門檻高、迭代慢。

### 1.3 本課題意義
本系統圍繞「**歷史群體（Historical Group）**」這一單位，將社會網絡、身份統計、地理分布、時間故事、人物詳情五個視圖在一個 Web 頁面上聯動展示，**讓人文學者「即看即得」**，並可隨時切換中心人物或追加新成員，重塑可視分析閉環。

---

## 2. 課題研究內容及分析

### 2.1 用戶與需求調研
| 用戶角色 | 主要需求 |
|---------|---------|
| 古代史 / 文學研究者 | 快速勾勒群體交往網絡、識別中心節點與橋接人物 |
| 歷史地理學者 | 觀察群體籍貫的空間聚集（如吳門集中於蘇州） |
| 社會學者 / 計量史家 | 統計群體身份結構（畫家、官員、僧侶占比） |
| 教學工作者 | 課堂演示某個歷史時期的關係圖譜 |

### 2.2 數據建模摘要
CBDB 在 SQLite 中以高度規範化形式存儲：
* `BIOG_MAIN` — 657k 條人物主表
* `ASSOC_DATA / ASSOC_CODES` — 約 60 萬條社會關係（如「為Y之學生」「畫風為Y所師法」）
* `KIN_DATA / KINSHIP_CODES` — 親屬關係
* `BIOG_ADDR_DATA / ADDR_CODES` — 多種地址（籍貫、遷住地、出生地、葬地…），含經緯度
* `POSTING_DATA / POSTED_TO_OFFICE_DATA / OFFICE_CODES` — 仕宦履歷
* `STATUS_DATA / STATUS_CODES` — 社會身份標記（畫家、詩人、藏書家、…）
* `EVENTS_DATA / EVENT_CODES` — 生平事件
* `ALTNAME_DATA / ALTNAME_CODES` — 字、號、別稱、室名
* `DYNASTIES` — 朝代代碼

### 2.3 設計關鍵
1. **群體即種子**：用戶可通過搜索 + 添加多個「中心人物」作為種子，後端進行 1–2 跳鄰居擴展，形成群體網絡。
2. **節點上限可調**：CBDB 中熱門人物關係呈長尾分布（如蘇軾 1 跳鄰居 > 1000），系統提供 80 / 150 / 300 / 500 / 800 / 1200 共 6 檔上限，後端硬上限 1500、`maxNeighborsPerNode` 上限 300，並在 UI 提示截斷狀態。
3. **大圖優化策略**：力導向 (`d3.forceSimulation`) 的 `charge`、`linkDistance`、`collideRadius`、`alphaDecay` 參數按節點數動態縮放（>500 節點時 charge 從 -120 降至 -55，alphaDecay 從 0.025 升至 0.04），同時將節點半徑基準從 5 降至 4，保證 500+ 節點時仍能在 1.8 秒內收斂。
4. **多檔標籤密度**：給定節點數 N，「自動」模式按 N≤60／≤150／≤350／更多 四檔分別顯示 degree≥2／4／7／12 的標籤，避免大圖文字相互壓蓋；用戶亦可一鍵切換「全部」「僅中心人物」兩種顯式模式。
5. **詳情面板可展開**：人物詳情中的地址 / 仕宦 / 交往 / 親屬四類列表預設只渲染前 8 / 10 / 12 / 12 條，再以 `<li class="expand-toggle">` 提供「展開全部 (還有 N 條)」按鈕一鍵打開所有條目，避免一次性渲染 1000+ DOM 節點導致卡頓。
6. **多視圖聯動**：群體切換 → 同時驅動社會網絡、身份分布、地理分布；個人切換 → 同時驅動詳情面板與年表。

---

## 3. 系統實現方法設計、系統實現及分析

### 3.1 技術棧
| 層 | 技術 |
|----|------|
| 數據存儲 | SQLite 3（CBDB 2026-03 發行版，~580MB） |
| 後端 | Node.js 22 + Express 4 + better-sqlite3（同步、零鎖、純 JS 客戶端） |
| 前端 | 原生 HTML + CSS + JS + D3.js 7 + Apache ECharts 5 + Leaflet 1.9 |
| 部署 | 單進程靜態 + REST API；本機 / WSL 一條 `npm start` 啟動 |

選 better-sqlite3 是因為其同步調用語義契合 SQLite 的單文件特性，免去異步隊列與連接池開銷，1 萬人的集合查詢 < 50ms。

### 3.2 後端架構

```
HTTP /api/network?seeds=…
        │
        ▼
  network.js  — 廣度優先擴展鄰居，邊去重
        │
        ▼
  queries.js  — 預編譯 SQL 語句（associationsStmt / kinshipsStmt …）
        │
        ▼
  better-sqlite3 (readonly) → cbdb_*.sqlite3
        │
        ▲
  aggregations.js — STATUS_DATA / ADDR_CODES 聚合
```

核心代碼示例（網絡擴展）：

```javascript
function buildNetwork({ seedIds, depth, maxNodes, maxNeighborsPerNode }) {
  const nodesMap = new Map();
  const edgesMap = new Map();
  // …添加種子；廣度優先按 depth 擴展…
  const assocs = associationsStmt.all(pid).slice(0, maxNeighborsPerNode);
  const kins   = kinshipsStmt.all(pid).slice(0, maxNeighborsPerNode);
  // …構造 (source,target,kind,label) 的 4 元組邊，去重…
  return { nodes, edges, truncated };
}
```

### 3.3 前端架構

```
app.js (orchestration)
 ├─► api.js  ────── /api/* fetch
 ├─► networkView   (D3 force layout)
 ├─► identityView  (ECharts bar)
 ├─► geoView       (Leaflet circleMarker)
 ├─► timelineView  (custom SVG "life-ribbon")
 └─► detailView    (DOM render of 9-table summary)
```

每個視圖暴露 `init(containerId)` 與 `setData(payload)` 二個方法，互不耦合，方便逐個調試與替換實現。

### 3.4 性能與優化
* SQL 預編譯（once-prepared）+ `cache_size=-64000`：常用查詢 < 5ms。
* 前端 `api.memoFetch`：對人物詳情、預設、時間軸結果 60 秒緩存。
* D3 力導向**節點數自適應**：≤250 節點 charge=-120 / collideR=node.r+6 / alphaDecay=0.025；>500 節點 charge=-55 / collideR=node.r+3 / alphaDecay=0.04。500 節點圖在 ~1.8s 內收斂。
* 標籤渲染分檔過濾：避免大圖中 N 個 `<text>` 節點相互重疊。
* 詳情列表懶展開：CSS `[data-collapsed="1"]{display:none}` 配合一次性 DOM 渲染、JS 移除屬性即可瞬時展開所有條目，無需重新 fetch。
* 響應式佈局：CSS Grid `grid-template-areas` + `@media (max-width:1180px)` 自動切單列。

---

## 4. 系統運行截圖

詳見 `cbdb_vis/docs/`：
- `cbdb-after-preset.png` — 明代吳門四家（默認 150 節點上限）
- `cbdb-tangsong-sushi.png` — 唐宋八大家 / 蘇軾被選中（150 節點上限）
- `cbdb-large-graph.png` — 唐宋八大家放大為 500 節點上限（500 人物 / 2072 關係）
- `cbdb-timeline-ribbon.png` — 蘇軾「生命帶」年表（左側頭像 + 中央米黃帶 + 入仕/任職/事件三類標誌）
- `cbdb-identity-chart.png` — 人物身份分布 ECharts 條形圖（Top 30 身份，可滾動）
- `cbdb-geo-map.png` — 人物地理分布 Leaflet + OSM 籍貫聚類地圖
- `cbdb-search-suggest.png` — 姓名／字號搜索建議下拉
- `cbdb-detail-panel.png` — 人物詳情面板（展開全部列表後的完整詳情）
- `cbdb-ai-supplement.png` — DeepSeek AI 補充缺失欄位結果

關鍵展示要點：
1. 上方搜索條 + 中心人物 chip + 預設群體下拉 + 關係層級 / 節點上限參數；
2. 姓名／字號雙路模糊搜索，建議下拉顯示姓名、朝代、生卒、籍貫及匹配字號；
3. 中部大塊力導向社會網絡，黃色為中心人物，藍色為一跳鄰居，紅色邊為社會交往，綠色邊為親屬；
4. 圖內搜索高亮：即時模糊匹配當前圖中節點，命中節點高亮，其鄰居保留可見；
5. 右側人物詳情面板，含字號、社會身份、地址、仕宦履歷、社會交往、親屬關係，長列表「展開全部」一鍵看完；
6. 詳情面板底部的 DeepSeek AI 補充層：自動標記 CBDB 缺失欄位，一鍵補充並以 JSON 格式展示結果；
7. 下方左塊「人物身份分布」橫向條形圖（畫家 33 / 為官者:文 31 / 詩人 17 …）；
8. 下方中塊 OpenStreetMap 籍貫聚類，圓點面積與群體聚集度成 √n 正比；
9. 下方右塊「人物年表」採用**畫卷式生命帶（life-ribbon）**：左側為人物頭像（取姓首字）+ 姓名 + 生卒；中央米黃色長帶為生卒年區間（圓角），金色實心點落於帶首作為出生標誌、深色豎條收尾作為「卒」標誌；帶上以三類標誌散落事件——入仕（藍色菱形）、任職（綠色 tick）、事件（紅色圓點），同年事件以「上下交錯+連接細線」自動分層避免重疊；下方為十年刻度。鼠標懸停任一標誌可彈出詳細年份與內容。

---

## 5. 核心模塊源代碼

完整源碼位於 `cbdb_vis/`，總行數 ~1500（Server 約 600，Client 約 900）。下面摘錄三段最具代表性者。

### 5.1 多跳社會網絡（`server/network.js`）
（見 §3.2 摘錄；完整 130 行）

### 5.2 人物詳情查詢彙總（`server/queries.js`）
9 條 prepared statements 一次性返回完整人物資料，便於前端詳情面板渲染。CBDB SQLite 中需要額外注意缺失值語義：多個年份欄位以 `0` 表示未知，`ASSOC_DATA.c_assoc_first_year` 還會以 `-1/-9999` 表示未定年，少量仕宦起年也有 `-1/-2`；多個碼表的 `0` 代表「未詳／Unknown」。本系統在後端正規化這些哨兵值，再交給詳情面板、統計圖、地圖、年表與 DeepSeek 補充層使用；但保留真實公元前年份。事件表中 `c_event_code=0` 僅表示事件類型未詳，若 `c_event` 有文字仍保留史事文本。

### 5.3 D3 力導向社會網絡（`public/js/network.js`）
```javascript
simulation = d3.forceSimulation(nodes)
  .force("link", d3.forceLink(edges).id(d => d.id)
    .distance(d => d.kind === "kin" ? 60 : 90).strength(0.5))
  .force("charge", d3.forceManyBody().strength(d => d.isSeed ? -380 : -120))
  .force("center", d3.forceCenter(width/2, height/2))
  .force("collide", d3.forceCollide().radius(d => d.r + 6));
```

---

## 6. 參考文獻

1. 包弼德, 陳松, 王宏甦. 《中國歷代人物傳記資料庫》[DB/OL]. 哈佛大學費正清中國研究中心、中研院、北京大學. https://projects.iq.harvard.edu/chinesecbdb/home
2. CBDB SQLite 倉庫. https://github.com/cbdb-project/cbdb_sqlite
3. Bostock M., Ogievetsky V., Heer J. *D3: Data-Driven Documents*. IEEE TVCG, 2011.
4. Apache ECharts. https://echarts.apache.org/
5. Leaflet — JavaScript library for interactive maps. https://leafletjs.com/
6. Munzner, T. *Visualization Analysis and Design*. CRC Press, 2014. （多視圖聯動 / VIS 設計準則）
7. 朱本軍, 包弼德. 「CBDB 在中國史研究中的應用」. 《數字人文》第 X 輯.
