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

CBDB SQLite 數據文件路徑（默認）：

```
../cbdb_sqlite/cbdb_20260328.sqlite3
```

如需切換到其他發行版本，修改 `server/db.js` 中的 `DB_PATH`。

## 啟動

```bash
cd cbdb_vis
npm install                # 已包含 better-sqlite3 / express / cors / compression
npm start                  # 默認監聽 http://localhost:3000
PORT=8080 npm start        # 也可指定端口
```

瀏覽器打開 http://localhost:3000 即可。

## 系統功能（對應 PPT 案例）

| 模塊 | 數據源 | 技術 |
|------|--------|------|
| 中心人物設置（搜索 + 預設群體） | `BIOG_MAIN` + `ALTNAME_DATA` | 原生 input + 後端 LIKE 搜索（兼字號） |
| 動態社會網絡 | `ASSOC_DATA` + `KIN_DATA` | D3.js 力導向圖、可拖拽、縮放、聚焦鄰居 |
| 人物身份分布 | `STATUS_DATA` + `STATUS_CODES` | ECharts 水平條形圖（前 12 身份） |
| 人物地理分布 | `BIOG_MAIN.c_index_addr_id` + `ADDR_CODES.x/y_coord` | Leaflet + OpenStreetMap，按籍貫聚合 |
| 人物年表故事 | `EVENTS_DATA` + `POSTED_TO_OFFICE_DATA` + `ENTRY_DATA` | ECharts 散點時間軸（5 軌：出生 / 入仕 / 任職 / 事件 / 卒） |
| 人物詳情 | `BIOG_MAIN` 等 9 張表彙總 | 原生 DOM，內含字號標籤、社會身份、地址、仕宦履歷、社會交往、親屬關係 |

## API 列表

| Method | Path | 用途 |
|--------|------|------|
| GET | `/api/health` | 健康檢查 |
| GET | `/api/search?q=…&limit=30` | 姓名／字號搜索（模糊） |
| GET | `/api/person/:id` | 人物完整詳情（彙總 9 張表） |
| GET | `/api/network?seeds=1,2,3&depth=1&maxNodes=120` | 多跳社會網絡 |
| GET | `/api/identity-distribution?ids=…` | 群體身份統計 |
| GET | `/api/geo?ids=…` | 群體籍貫聚類 |
| GET | `/api/timeline/:id` | 個人年表彙總（生 / 入仕 / 任職 / 事件 / 卒） |
| GET | `/api/dynasties` | 朝代列表 |
| GET | `/api/presets` | 預設群體（吳門四家、唐宋八大家） |

## 創新點

1. **跨表彙總的人物詳情**：CBDB 資料極度規範化，本系統一次性查詢 9 張表並組裝成適合人文研究者閱讀的 JSON。
2. **節點上限與切頂可視化**：CBDB 中熱門人物（如蘇軾）關係網爆炸，引入 `maxNodes` 與 `maxNeighborsPerNode` 上限避免前端崩潰，並在狀態欄提示「已截斷」。
3. **字號搜索**：人文學者常按「字／號」回憶人物，後端在主名搜不到時回退查 `ALTNAME_DATA`，前端在建議下拉直接顯示「字號:東坡居士」等元數據。
4. **混合身份配色**：節點顏色按 `STATUS_DATA` 的「主要身份」（畫家／詩人／官員等）映射，使群體中職業構成一目了然。
5. **預設群體**：圍繞「吳門四家」「唐宋八大家」等經典歷史群體，便於老師演示與用戶快速上手。

## 截圖

- `cbdb-after-preset.png` — 明代吳門四家視圖
- `cbdb-tangsong-sushi.png` — 唐宋八大家視圖（蘇軾被選中）

## 數據限制

- CBDB 釋出 2025-05 以後 `c_index_year` 等字段不再持續維護，部分人物 `index_year` 為空。
- 部分歷史地名 `x_coord/y_coord` 缺失，這些人物不會出現在地圖上但仍計入身份統計。

## License

代碼自由使用於課程交付。CBDB 數據遵循其官方 CC-BY-NC-SA 4.0 協議。
