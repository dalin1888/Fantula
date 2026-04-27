# Fantula 双平台博客自动发布工具

一篇文章，同时发布到两个博客平台，支持图片上传、多语言、草稿模式。

---

## 📁 文件结构

```
fantula-publisher/
├── config.py                    # ⭐ API 密钥配置（只需改这里）
├── publish.py                   # 主发布脚本
├── SKILL.md                     # Claude 调用参考（所有接口说明）
├── README.md                    # 本文档
└── examples/
    ├── article-simple.json      # 纯文字文章模板
    ├── article-with-images.json # 带图片文章模板
    └── article-english.json     # 英文文章模板
```

---

## 🚀 快速开始

### 测试连接
```bash
cd ~/Downloads/fantula-publisher
python3 publish.py --test
```
正常输出：
```
✅ Cloudflare 博客 API 正常
✅ WordPress.com API 正常 (用户: hsym2026)
```

### 发布文章
```bash
# 同时发布到两个平台（推荐）
python3 publish.py examples/article-simple.json

# 只发到 Cloudflare 自建博客
python3 publish.py examples/article-simple.json --cf

# 只发到 WordPress.com
python3 publish.py examples/article-simple.json --wp

# 先存草稿，不公开
python3 publish.py examples/article-simple.json --draft
```

---

## 📝 文章 JSON 格式

### 必填字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `title` | string | 文章标题 |
| `content` | string | 正文，**Markdown 格式** |

### 可选字段

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `excerpt` | string | 自动取前120字 | 列表页摘要 |
| `category` | string | `general` | 文章分类 |
| `lang` | string | `zh` | 语言：zh / en / ja |
| `slug` | string | 自动生成 | URL 别名（英文短横线） |
| `tags` | array | `[]` | 标签，如 `["Netflix","省钱"]` |
| `cover_image` | string | 无 | 封面图（本地路径 或 https:// 链接） |

### category 可选值

| 值 | 含义 |
|----|------|
| `tutorial` | 教程 / 使用指南 |
| `savings` | 省钱攻略 |
| `review` | 产品测评 |
| `troubleshoot` | 问题排查 |
| `general` | 通用 / 其他 |

---

## 🖼️ 图片发布完整说明

### 方式一：封面图（题图）

```json
{
  "title": "文章标题",
  "cover_image": "/Users/你的用户名/Pictures/cover.jpg",
  "content": "正文..."
}
```

- 本地路径 → 自动上传到 CF R2 和 WP 媒体库，替换为公网 URL
- https:// 链接 → 直接使用，无需上传

---

### 方式二：正文内插图（Markdown）

```markdown
## 套餐对比

下图展示了三个套餐的差异：

![套餐对比图](/Users/你的用户名/Pictures/plans.png)

如图所示，4K 套餐性价比最高...

## 开通步骤

完成后效果如下：

![开通成功截图](/Users/你的用户名/Pictures/success.jpg)
```

**处理逻辑：**
1. 扫描正文中 `![描述](路径)` 语法
2. 发现本地路径 → 自动上传，替换为公网 URL
3. 两个平台各自独立上传

---

### 方式三：精确控制图片位置（HTML 混写）

```markdown
## 价格对比

<figure style="text-align:center">
  <img src="/Users/你的用户名/Pictures/price-table.png" alt="价格表" width="600">
  <figcaption>图：2026 年各平台价格对比</figcaption>
</figure>

从上图可以看出...
```

脚本自动识别 `src="本地路径"` 并上传替换。

---

### 图片格式建议

| 用途 | 格式 | 推荐尺寸 |
|------|------|----------|
| 封面图 | JPG / WebP | 1200×630 px（16:9） |
| 正文插图 | PNG / JPG | 宽度 800-1200 px |
| 示意图 | PNG | 透明背景 |
| 截图 | PNG | 原始尺寸 |

---

## 🔑 API 密钥说明（config.py）

```python
# Cloudflare 自建博客
CF_API_BASE   = "https://fantula-blog-api.jiangdalin1988.workers.dev"
CF_API_SECRET = "ftblog_9x2k_2026_prod_secret"   # 永久有效

# WordPress.com
WP_SITE_ID = "254201953"
WP_TOKEN   = "你的Token"    # ⚠️ 14天后过期，需更新
WP_CLIENT_ID = "137459"
```

### WordPress.com Token 过期续期

打开浏览器访问：
```
https://public-api.wordpress.com/oauth2/authorize?client_id=137459&redirect_uri=https://localhost&response_type=token&scope=global
```
→ 点 Approve → 从跳转 URL 复制 `access_token=` 后面的值 → 更新 `config.py`

---

## 📊 两个平台对比

| 项目 | Cloudflare 自建博客 | WordPress.com |
|------|---------------------|---------------|
| 前台地址 | blog.fantula.net | hsym2026-zgtwr.wordpress.com |
| 图片存储 | Cloudflare R2 | WP 媒体库 |
| SEO 优势 | 独立域名，可完全控制 | wordpress.com 高权重（DA 95+） |
| Token 有效期 | 永久 | 14 天 |

---

## ❓ 常见问题

**Q: 发布失败 401？**
A: WP Token 过期，按上方步骤重新获取。

**Q: 图片报 FileNotFoundError？**
A: 检查图片路径是否正确，注意 macOS 路径区分大小写。

**Q: 如何批量发布多篇？**
```bash
for f in articles/*.json; do
  python3 publish.py "$f"
  sleep 2
done
```
