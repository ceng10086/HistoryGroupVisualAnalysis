# 项目环境搭建 — 命令记录

> 记录时间：2026-04-30  
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
which 7z 2>&1
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
| 7z | ❌ 未安装 | — |

---

## 5. 安装缺失的系统依赖

```bash
echo '123456' | sudo -S apt update -y
echo '123456' | sudo -S apt install -y sqlite3 p7zip-full
```

输出（关键部分）：
```
Setting up 7zip (23.01+dfsg-11) ...
Setting up sqlite3 (3.45.1-1ubuntu2.5) ...
```
✅ 安装成功

---

## 6. 下载 CBDB 数据库

```bash
cd /home/neo/HistoryGroupVisualAnalysis/cbdb_sqlite
wget -O latest.7z "https://huggingface.co/datasets/cbdb/cbdb-sqlite/resolve/main/latest.zip"
```

> [!IMPORTANT]
> README 中提供的最新下载链接为 HuggingFace 上的 `latest.zip`，虽然保存为 `latest.7z`，实际是 ZIP 格式。

输出：
```
2026-04-30 22:22:31 (662 KB/s) - 'latest.7z' saved [136890976/136890976]
```
✅ 下载完成，文件大小 ~131MB，耗时约 3 分 22 秒

---

## 7. 解压数据库

```bash
cd /home/neo/HistoryGroupVisualAnalysis/cbdb_sqlite
file latest.7z        # 确认文件类型
unzip latest.7z       # 解压（实际是 ZIP 格式）
```

输出：
```
latest.7z: Zip archive data, at least v2.0 to extract, compression method=deflate
```

解压后得到：
```
cbdb_20260328.sqlite3  —  579MB
cbdb_20260328.json     —  385B（元数据）
```
