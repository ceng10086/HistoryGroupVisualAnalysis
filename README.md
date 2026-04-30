# 歷史群體可視分析系統（CBDB Visual Analytics）

> **專業創新實踐** 課程作品 · 選題方向：**可視化（VIS）+ 數字人文（DH）**
> 數據來源：**[中國歷代人物傳記資料庫 CBDB](https://projects.iq.harvard.edu/chinesecbdb/home)**（哈佛 / 中研院 / 北大）

本倉庫圍繞「歷史群體（如吳門四家、唐宋八大家）」整合 CBDB 657,479 條人物資料，提供一個面向人文學者的多視圖聯動 Web 系統：動態社會網絡、人物身份分布、地理分布、年表故事、人物詳情，五個視圖在一頁聯動。

![吳門四家視圖](cbdb_vis/docs/cbdb-after-preset.png)

![唐宋八大家視圖（蘇軾被選中）](cbdb_vis/docs/cbdb-tangsong-sushi.png)

---

## 目錄結構

```
HistoryGroupVisualAnalysis/
├── README.md                              ← 你正在讀的文件
├── 专业创新实践-历史群体可视化分析.md       ← 課程選題說明（從 PPT 提取）
├── setup_commands_log.md                  ← CBDB 數據庫下載 / 解壓記錄
├── .gitignore
└── cbdb_vis/                              ← 本項目主體（Node.js 全棧）
    ├── package.json
    ├── README.md                          ← 詳細模塊說明
    ├── docs/
    │   ├── REPORT.md                      ← 結題報告草案
    │   ├── cbdb-after-preset.png          ← 吳門四家截圖
    │   └── cbdb-tangsong-sushi.png        ← 唐宋八大家截圖
    ├── server/                            ← Express + better-sqlite3 後端
    │   ├── index.js
    │   ├── db.js
    │   ├── queries.js
    │   ├── search.js
    │   ├── network.js
    │   └── aggregations.js
    └── public/                            ← D3 + ECharts + Leaflet 前端
        ├── index.html
        ├── css/app.css
        └── js/{api,app,network,identity,geo,timeline,detail}.js
```

> ⚠️ `cbdb_sqlite/` 目錄包含 ~580MB 的 SQLite 數據文件，**未入庫**；下載步驟見下節「準備數據」。

---

## 快速啟動（Quick Start）

### 1. 準備數據（CBDB SQLite）

```bash
# 在倉庫根目錄下：
git clone https://github.com/cbdb-project/cbdb_sqlite.git
cd cbdb_sqlite
wget -O latest.zip "https://huggingface.co/datasets/cbdb/cbdb-sqlite/resolve/main/latest.zip"
sudo apt install -y sqlite3 unzip          # Debian / Ubuntu
unzip latest.zip
# 解壓後得到 cbdb_YYYYMMDD.sqlite3 (~580MB)
```

如果發行版本日期變化，請對照修改 `cbdb_vis/server/db.js` 中的 `DB_PATH`（默認 `../cbdb_sqlite/cbdb_20260328.sqlite3`）。

### 2. 安裝依賴並啟動

```bash
cd ../cbdb_vis
npm install
npm start                    # 默認 http://localhost:3000
PORT=8080 npm start          # 自定義端口
```

打開瀏覽器訪問 `http://localhost:3000` 即可使用。

---

## 系統功能

| 模塊 | 數據源 | 技術 |
|------|--------|------|
| 中心人物搜索 | `BIOG_MAIN` + `ALTNAME_DATA` | 姓名 + 字號雙路模糊查詢 |
| 動態社會網絡 | `ASSOC_DATA` + `KIN_DATA` | D3.js 力導向圖 |
| 人物身份分布 | `STATUS_DATA` + `STATUS_CODES` | ECharts 條形圖 |
| 人物地理分布 | `BIOG_MAIN.c_index_addr_id` + `ADDR_CODES.x/y_coord` | Leaflet + OSM |
| 人物年表故事 | `EVENTS_DATA` + `POSTED_TO_OFFICE_DATA` + `ENTRY_DATA` | ECharts 散點時間軸 |
| 人物詳情 | 9 張表彙總 | 原生 DOM |

更多細節（API 列表、創新點、性能優化）請見 [`cbdb_vis/README.md`](cbdb_vis/README.md) 與 [`cbdb_vis/docs/REPORT.md`](cbdb_vis/docs/REPORT.md)。

---

## 致謝 / Acknowledgements

- 數據：China Biographical Database (CBDB) — Harvard / 中央研究院 / 北京大學
- 可視化庫：D3.js / Apache ECharts / Leaflet / OpenStreetMap

CBDB 數據遵循其官方 CC-BY-NC-SA 4.0 協議；本倉庫代碼用於課程交付，採用 MIT-style 自由使用。
