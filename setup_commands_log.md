# 项目环境搭建 — 命令记录

> 记录时间：2026-05-31
> 项目：中國歷代人物傳記可視分析系統（基于 CBDB SQLite）

---

## 1. 克隆 CBDB 数据库仓库

```bash
git clone https://github.com/cbdb-project/cbdb_sqlite.git
```

输出：`Cloning into 'cbdb_sqlite'...` ✅ 成功

---

## 2. 检查仓库内容

```bash
ls -la /home/neo/HistoryGroupVisualAnalysis/cbdb_sqlite/
```

发现文件：`README.md`, `USAGE.md`, `USAGE.zh.md`, `latest.7z`（Git LFS 指针）, `scripts/`

---

## 3. 检查 `latest.7z` 文件类型

```bash
file /home/neo/HistoryGroupVisualAnalysis/cbdb_sqlite/latest.7z
cat /home/neo/HistoryGroupVisualAnalysis/cbdb_sqlite/latest.7z
```

输出：
```
/home/neo/HistoryGroupVisualAnalysis/cbdb_sqlite/latest.7z: ASCII text
version https://git-lfs.github.com/spec/v1
oid sha256:75c7393a11416e0e28af7ab2d5b98e858cf475457f7aa8079bd34686a58b85a2
size 72287593
```

> [!NOTE]
> `latest.7z` 是 Git LFS 指针文件，不是真正的压缩包。需要直接从 URL 下载。

---

## 4. 检查系统已有工具

```bash
which node 2>&1; node --version 2>&1
which sqlite3 2>&1
which python3 2>&1; python3 --version 2>&1
which unzip 2>&1
which wget 2>&1
which npm 2>&1; npm --version 2>&1
```

| 工具 | 状态 | 版本/路径 |
|------|------|-----------|
| Node.js | ✅ 已安装 | v22.22.2 (`~/.nvm/versions/node/v22.22.2/bin/node`) |
| Python3 | ✅ 已安装 | Python 3.12.3 (`/usr/bin/python3`) |
| wget | ✅ 已安装 | `/usr/bin/wget` |
| npm | ✅ 已安装 | 10.9.7 |
| sqlite3 | ❌ 未安装 | — |
| unzip | ❌ 未安装 | — |

---

## 5. 安装缺失的系统依赖

```bash
echo '123456' | sudo -S apt update -y
echo '123456' | sudo -S apt install -y sqlite3 unzip
```

输出（关键部分）：
```
Setting up sqlite3 (3.45.1-1ubuntu2.5) ...
Setting up unzip (6.0-28ubuntu4.1) ...
```
✅ 安装成功

---

## 6. 下载固定版本 CBDB 数据库

```bash
cd /home/neo/HistoryGroupVisualAnalysis/cbdb_sqlite
wget -O cbdb_20260328.zip "https://huggingface.co/datasets/cbdb/cbdb-sqlite/resolve/main/history/cbdb_202603/cbdb_20260328.zip"
wget -O cbdb_20260328.metadata.json "https://huggingface.co/datasets/cbdb/cbdb-sqlite/resolve/main/metadata/2026-03/2026-03-28.json"
```

> [!IMPORTANT]
> 不要使用 HuggingFace 上的 `latest.zip`，该文件会随上游发布漂移；截至 2026-05-31，`latest.json` 已指向 `cbdb_20260530.sqlite3`。本项目后端固定读取 `cbdb_20260328.sqlite3`，因此必须下载历史路径中的 `cbdb_20260328.zip`。

输出：
```
2026-05-31 ... - 'cbdb_20260328.zip' saved [136890976/136890976]
2026-05-31 ... - 'cbdb_20260328.metadata.json' saved [...]
```
✅ 下载完成，文件大小 ~131MB，耗时视网络环境而定

---

## 7. 解压数据库

```bash
cd /home/neo/HistoryGroupVisualAnalysis/cbdb_sqlite
file cbdb_20260328.zip
unzip -o cbdb_20260328.zip
```

输出：
```
cbdb_20260328.zip: Zip archive data, at least v2.0 to extract, compression method=deflate
```

解压后得到：
```
cbdb_20260328.sqlite3  —  579MB
cbdb_20260328.json     —  385B（元数据）
```

---

## 8. 校验数据库版本

```bash
cd /home/neo/HistoryGroupVisualAnalysis/cbdb_sqlite
python3 -m json.tool cbdb_20260328.metadata.json
sha256sum cbdb_20260328.sqlite3
sqlite3 cbdb_20260328.sqlite3 "SELECT COUNT(*) AS people_count FROM BIOG_MAIN;"
```

输出（关键部分）：
```
"sqlite_filename": "cbdb_20260328.sqlite3"
"sha256": "126d085b80a0bb7844c1a6950db242e2fbebd99b55c08586b0bec9e657202940"
126d085b80a0bb7844c1a6950db242e2fbebd99b55c08586b0bec9e657202940  cbdb_20260328.sqlite3
657479
```

✅ 确认数据库文件是 `cbdb_20260328.sqlite3`，与 `cbdb_vis/server/db.js` 中配置的 `DB_PATH` 一致。
