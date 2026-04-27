# Fantula Blog API Worker

Cloudflare Workers + D1 + R2 驱动的博客后端 API，为 [blog.fantula.net](https://blog.fantula.net) 提供服务。

---

## 📦 技术栈

| 组件 | 说明 |
|------|------|
| **Cloudflare Workers** | Serverless 边缘运行时 |
| **D1 Database** | SQLite 数据库，存储文章内容 |
| **R2 Bucket** | 对象存储，存储图片 |

---

## 🗂️ 文件结构

```
blog-worker/
├── index.js          # Worker 源码（全部逻辑在此）
├── wrangler.toml     # 部署配置（Binding、账号ID等）
└── README.md         # 本文档
```

---

## ⚙️ Bindings 配置

| Binding 名 | 类型 | 说明 |
|-----------|------|------|
| `DB` | D1 Database | 文章数据库，database_id: `f6e8d73c-cfaa-4cd8-aa7e-a44d0945d3dd` |
| `IMAGES` | R2 Bucket | 图片存储，bucket: `fantula-blog-images` |
| `API_SECRET` | 环境变量 | 接口鉴权密钥 |
| `ALLOWED_ORIGIN` | 环境变量 | CORS 允许的源（`https://blog.fantula.com`） |

---

## 🛣️ API 路由

### 公开接口（无需鉴权）

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/posts` | 获取文章列表 |
| `GET` | `/api/posts/:id` | 按数字 ID 获取单篇文章 |
| `GET` | `/api/posts/:slug` | 按 slug 获取单篇文章 |
| `GET` | `/api/categories` | 获取分类列表 |
| `GET` | `/images/:key` | 从 R2 返回图片文件 |

#### GET /api/posts 支持的查询参数

| 参数 | 说明 | 示例 |
|------|------|------|
| `slug` | 按 slug 精确过滤 | `?slug=my-post` |
| `lang` | 按语言过滤 | `?lang=zh` |
| `category` | 按分类过滤 | `?category=savings` |
| `page` | 页码（默认 1） | `?page=2` |
| `limit` | 每页数量（默认 10，最大 50） | `?limit=20` |

### 鉴权接口（需要 `X-API-Secret` 请求头）

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/posts` | 发布新文章 |
| `PUT` | `/api/posts/:id` | 更新文章 |
| `DELETE` | `/api/posts/:id` | 删除文章 |
| `POST` | `/api/upload` | 上传图片到 R2 |
| `GET` | `/api/admin/posts` | 获取所有文章（含草稿） |

#### POST /api/posts 请求体

```json
{
  "title":       "文章标题（必填）",
  "slug":        "url-alias（必填）",
  "content":     "Markdown 正文（必填）",
  "excerpt":     "摘要（可选，默认取正文前120字）",
  "cover_image": "https://... 或留空",
  "lang":        "zh",
  "category":    "savings",
  "tags":        ["Spotify", "省钱"],
  "status":      "published"
}
```

> `status` 字段支持 `"published"` / `"draft"`，也支持旧版布尔值 `published: true/false`。

---

## 🚀 部署方式

### 首次部署

```bash
# 安装 wrangler（如未安装）
npm install -g wrangler

# 登录 Cloudflare
wrangler login

# 部署
cd blog-worker
wrangler deploy
```

### 更新部署（本地已有 wrangler 认证）

```bash
cd blog-worker
npx wrangler deploy
```

---

## 🗄️ 数据库 Schema

```sql
CREATE TABLE posts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT NOT NULL,
  slug         TEXT UNIQUE NOT NULL,
  content      TEXT DEFAULT '',
  excerpt      TEXT DEFAULT '',
  cover_image  TEXT DEFAULT '',
  lang         TEXT DEFAULT 'zh',
  category     TEXT DEFAULT 'general',
  tags         TEXT DEFAULT '[]',   -- JSON 字符串
  published    INTEGER DEFAULT 0,   -- 0=草稿, 1=已发布
  views        INTEGER DEFAULT 0,
  created_at   TEXT DEFAULT (datetime('now')),
  updated_at   TEXT
);
```

---

## 🐛 已修复的历史 Bug（2026-04-28）

| Bug | 原因 | 修复 |
|-----|------|------|
| 文章发布后不显示 | Worker 使用 `published` 布尔字段，发布脚本发送 `status: "published"` 字符串，导致所有文章存为草稿 | 同时支持 `status` 字符串和 `published` 布尔值 |
| `GET /api/posts/:id` 返回 404 | 把数字 ID 当 slug 查询 | 自动判断：纯数字 → 按 ID，其余 → 按 slug |
| 图片上传返回相对路径 | 返回 `/images/key`，前端无法访问 | 返回完整 URL，并增加 `GET /images/:key` 路由从 R2 读取图片 |
| GET 列表不支持 slug 过滤 | 缺少 `?slug=` 参数 | 已加入 |
