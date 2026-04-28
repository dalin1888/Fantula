# 凡图拉发布主管 SKILL

> 最后更新：2026-04-28
> 当用户说「发布」「全平台发」「发这篇文章」时，按本文件流程执行。

---

## 平台全景

> ## 三种内容类型 × 平台分配（定案）
>
> | 平台 | 文章 | 图文 | 视频 |
> |------|------|------|------|
> | Cloudflare blog.fantula.net | ✅ | — | — |
> | WordPress.com | ✅ | — | — |
> | Blogger | ✅ | — | — |
> | 知乎专栏 | ✅ | — | — |
> | 微博 | ✅ | ✅ | ✅ |
> | Instagram | — | ✅ | ✅ |
> | Facebook | — | ✅ | ✅ |
> | Telegram | — | ✅ | — |
> | X / Twitter | — | ✅ | — |
> | 抖音 | — | ✅ | ✅ |
> | 快手 | — | ✅ | ✅ |
> | 小红书 | — | ✅ | ✅ |
> | Bilibili | — | — | ✅ |
> | TikTok | — | — | ✅ |
> | YouTube | — | — | ✅ |
> | 知乎视频 | — | — | ✅ |
>
> **触发方式：**
> - 用户说「存」→ 自动走**文章流**（5平台：Cloudflare · WordPress · Blogger · 知乎 · 微博头条）
> - 用户说「发图文」→ 走**图文流**（8平台：微博 · Instagram · Facebook · Telegram · X · 抖音 · 快手 · 小红书）
>   → 图文使用图文专属模板（模板制作中，完成后更新）
> - 用户提供视频文件说「发视频」→ 走**视频流**（10平台：微博 · Instagram · Facebook · 抖音 · 快手 · 小红书 · Bilibili · TikTok · YouTube · 知乎视频）
>   → 视频由用户独立制作后提供
>
> ⚠️ **Instagram · Facebook 不是文章平台**，只接受图文（图片+短文案）。微博同时支持文章（头条）和图文两种形式。

## 平台工具索引

| 类型 | 平台 | 工具入口 | 认证有效期 |
|------|------|---------|-----------|
| 博客 | Cloudflare blog.fantula.net | `publish.py` | 永久 |
| 博客 | WordPress.com | `publish.py` | **14天**，过期需续期 |
| 博客 | Blogger fantula.blogspot.com | `blogger_cli.py` | **7天**，过期需重授权 |
| 文章 | 知乎专栏 | `zhihu_publish.mjs` | Cookie（长期）|
| 文章 | 微博头条 | `weibo_article_publish.mjs` | Cookie（长期）|
| 图文/视频 | 微博 | `weibo_publish.mjs` / `weibo_video_publish.py` | Cookie（长期）|
| 图文/视频 | Instagram | `meta_publish.mjs ig` / 视频另行 | 永久（到2027）|
| 图文/视频 | Facebook | `meta_publish.mjs fb` / 视频另行 | 永久 |
| 图文 | Telegram @fantula_com | `telegram_publish.mjs` | 永久 |
| 图文 | X @fantulainc | `opencli twitter post` | 永久（到2027）|
| 图文/视频 | 抖音 fantula | `sau douyin upload-note/video` | Cookie（Browser Bridge）|
| 图文/视频 | 快手 fantula | `sau kuaishou upload-note/video` | Cookie（Browser Bridge）|
| 图文/视频 | 小红书 fantula | `sau xiaohongshu upload-note/video` | Cookie（Browser Bridge）|
| 视频 | Bilibili 凡图拉 | `bilibili_upload.py` | Cookie（biliup）|
| 视频 | TikTok @fantula | `tiktok_upload.py` | Cookie（已授权）|
| 视频 | YouTube 凡图拉 | `youtube_upload.py` | OAuth（已授权）|
| 视频 | 知乎视频 | `zhihu_video_publish.py` | Cookie（Browser Bridge）|
| **国内视频** | **抖音 fantula** | `sau douyin upload-video` | Cookie（Browser Bridge）|
| **国内视频** | **快手 fantula** | `sau kuaishou upload-video` | Cookie（Browser Bridge）|
| **国内视频** | **小红书 fantula** | `sau xiaohongshu upload-video` | Cookie（Browser Bridge）|
| **国内视频** | **Bilibili 凡图拉** | `bilibili_upload.py` | Cookie（biliup，已授权）|
| **国内视频** | **微博 视频** | `weibo_video_publish.py` | Cookie（Browser Bridge，Playwright）|
| **国内视频** | **知乎 视频** | `zhihu_video_publish.py` | Cookie（Browser Bridge，Playwright）|
| **国际视频** | **TikTok @fantula** | `tiktok_upload.py` | Cookie（已授权）|
| **国际视频** | **YouTube 凡图拉** | `youtube_upload.py` | OAuth（已授权）|

---

## Step 0：发布前检查清单

每次发布前快速过一遍：

```
□ 白色浪漫 Chrome 已打开
□ OpenCLI Browser Bridge 扩展图标绿色（已连接）
□ article.json status 为 "ready"，图片路径为绝对路径
□ Blogger token 是否超过7天？（看 content_log 上次 blogger 发布日期）
□ WordPress token 是否超过14天？（看 content_log 上次 wordpress 发布日期）
```

---

## Step 0.5：生成各平台标签（必做）

```bash
cd /Users/mini/凡图拉宣传/发布主管/工具
python3 tag_formatter.py /Users/mini/凡图拉宣传/content/[文件夹]/article.json
```

输出示例（Spotify 文章）：
```
【微博】  #Spotify超话# #流媒体超话# #Spotify# #SpotifyPremium# #省钱攻略# #流媒体订阅# #凡图拉#
【X】     #Spotify #SpotifyPremium #MusicStreaming #SaveMoney #凡图拉
【IG】    #spotify #spotifypremium #music #musicstreaming #savemoney #fantula #省钱攻略 ...
【FB】    #Spotify #SpotifyPremium #省钱 #凡图拉
【TG】    #Spotify #SpotifyPremium #省钱攻略 #流媒体订阅 #凡图拉
【博客】  Spotify, SpotifyPremium, 省钱攻略, 流媒体订阅, 凡图拉
```

将输出结果**复制备用**，后续各步骤直接粘贴，不需要手写。

> 标签来源：`工具/tag_map.json`（按产品维护）
> ⚠️ 微博超话名称需在微博 APP 确认存在

---

## Step 1：读取文章

```bash
# 找到要发布的 article.json
/Users/mini/凡图拉宣传/content/[YYYY-MM-DD_TYPE_Product]/article.json
```

确认字段：
- `title` / `slug` / `excerpt` / `tags`
- `cover_image` / `images`（绝对路径，文件存在）
- `content`（完整 Markdown 正文）
- `status: "ready"`

> 文章流只发 4 个平台：**Cloudflare · WordPress · Blogger · 知乎**
> 微博 / Instagram / Facebook 属于图文流，说「发图文」时单独处理。

---

## Step 2：博客平台（Cloudflare + WordPress + Blogger）

```bash
cd /Users/mini/凡图拉宣传
python3 发布主管/工具/fantula-publisher/publish.py content/[文件夹]/article.json
```

✅ 同时发布三个平台（CF + WP + Blogger），输出链接。

单独发某一个：
```bash
--cf       只发 Cloudflare
--wp       只发 WordPress
--blogger  只发 Blogger
```

> ⚠️ 注意：这里用的是 `发布主管/工具/fantula-publisher/publish.py`（博客发布工具）
> 不是 `publisher-cli/publish.py`（那个是视频工具，用错会报错）

---

## Step 3：Blogger

```bash
python3 /Users/mini/凡图拉宣传/发布主管/工具/fantula-publisher/publish.py \
  content/[文件夹]/article.json --blogger
```

图片会自动上传到 CF R2 并使用 CDN URL（不再用 base64，否则 Blogger API 会剥除图片）。

> ⚠️ 若报 `invalid_grant`：看 `.credentials/blogger_oauth.json` → 按 Step 0 checklist 重新授权。

---

## Step 4：知乎专栏

```bash
cd /Users/mini/凡图拉宣传/发布主管/工具
node zhihu_publish.mjs "[标题]" /Users/mini/凡图拉宣传/content/[文件夹]/article.md
```

> ⚠️ 确认 Browser Bridge 已连接，否则 z_c0 读取失败。

---

## Step 4.5：微博头条文章

```bash
cd /Users/mini/凡图拉宣传/发布主管/工具
node weibo_article_publish.mjs "[标题]" \
  /Users/mini/凡图拉宣传/content/[文件夹]/article.md \
  /Users/mini/凡图拉宣传/content/[文件夹]/cover.png
```

> ⚠️ 依赖：Chrome 白色浪漫已开 + Browser Bridge 已连（需微博 Cookie）。
> 脚本会自动把 Markdown 内图片上传到微博图床（sinaimg.cn），再用 Playwright 写入头条文章编辑器并发布。
> 调试截图保存至 `/tmp/weibo_article_*.png`。

封面图可省略（工具会自动跳过封面上传步骤）：
```bash
node weibo_article_publish.mjs "[标题]" article.md
```

---

## Step 5.5：国内图文（抖音 + 快手 + 小红书）

> 详细流程见 `发布主管/国内图文/SKILL.md`

```bash
# 生成国内标签
python3 /Users/mini/凡图拉宣传/发布主管/国内图文/工具/domestic_formatter.py [article.json]

# 生成图3（CTA图，每篇必须有）
cp image_templates/content/img_cta.html [文章目录]/img3.html
# 编辑 img3.html 的 TWEAK_DEFAULTS → 渲染
python3 html_to_png.py [文章目录]/img3.html

# 抖音 + 快手并发（3张图）
cd /Users/mini/凡图拉宣传/social-auto-upload
uv run sau douyin upload-note --account fantula \
  --title "[标题≤55字]" --note "[正文+标签]" \
  --images "[cover.png]" "[img2.png]" "[img3.png]" 2>&1 &
uv run sau kuaishou upload-note --account fantula \
  --title "[标题≤50字]" --note "[正文+标签]" \
  --images "[cover.png]" "[img2.png]" "[img3.png]" 2>&1 &
wait

# 小红书（竖版首图）
uv run sau xiaohongshu upload-note --account fantula \
  --title "[种草标题]" --note "[正文+标签]" \
  --images "[xhs_cover.png]" "[img2.png]" "[img3.png]"
```

---

## Step 5：社交平台（Telegram + X + 微博 + Instagram + Facebook）

**统一入口（推荐）：**

```bash
cd /Users/mini/凡图拉宣传
node 发布主管/工具/social_publish.mjs content/[文件夹]/article.json
```

`social_publish.mjs` 会自动从 `article.json` 读取标题/摘要/图片，从 `tag_map.json` 匹配各平台标签，依次发布 Telegram → 微博 → Instagram+Facebook → X。

**可选参数：**
```bash
# 只发指定平台
node social_publish.mjs article.json --only telegram,weibo

# 跳过某平台
node social_publish.mjs article.json --skip twitter
```

> ⚠️ **不要** 直接把 article.json 路径传给 `telegram_publish.mjs` / `weibo_publish.mjs`，
>    这些底层工具接收的是「文字内容」字符串，不是 JSON 文件。
>    如需单独调用，请先手动构建文案字符串：
> ```bash
> node telegram_publish.mjs "文案内容..." cover.png img2.png
> node weibo_publish.mjs "文案内容..." cover.png img2.png
> ```

---

## Step 6：更新 content_log.json

发布完成后，更新 `/Users/mini/凡图拉宣传/log/content_log.json`：

```json
{
  "status": "published",
  "published": {
    "cloudflare":  { "url": "...", "date": "YYYY-MM-DD" },
    "wordpress":   { "date": "YYYY-MM-DD" },
    "blogger":     { "url": "...", "post_id": "...", "date": "YYYY-MM-DD" },
    "zhihu":       { "url": "...", "date": "YYYY-MM-DD" },
    "telegram":    { "url": "...", "date": "YYYY-MM-DD" },
    "twitter":     { "url": "...", "date": "YYYY-MM-DD" },
    "weibo":       { "url": "...", "date": "YYYY-MM-DD", "images": 2 },
    "instagram":   { "url": "...", "date": "YYYY-MM-DD" },
    "facebook":    { "url": "...", "date": "YYYY-MM-DD" }
  }
}
```

---

## 各平台文案规范

| 平台 | 字数 | 重点 | 标签格式 |
|------|------|------|---------|
| Telegram | 不限 | 完整内容 + 官网链接 | `#标签` |
| X | ≤140汉字 | 一句话钩子 + 链接 | `#tag` 1~3个 |
| 微博 | ≤140字 | 口语化 + 表情 | `#话题#` |
| Instagram | 不限 | 视觉说明 + CTA | `#英文tag` 10~15个 |
| Facebook | 不限 | 中英文皆可 | 少量 #tag |
| 知乎 | 800~3000字 | 完整文章 | 系统标签 |
| Blogger | 不限 | 完整HTML文章 | labels 字段 |

---

## 已知问题速查

| 问题 | 平台 | 处理方式 |
|------|------|---------|
| `invalid_grant` | Blogger | 重新 OAuth 授权（7天一次）|
| `API access blocked` | Facebook | 切换 App 到 Live 模式（已完成，永久）|
| `stale page identity` | X/Twitter | 直接重试，自动恢复 |
| 图片上传 `errno:-1` | 微博 | 直接重试，偶发网络抖动 |
| `z_c0 cookie 未找到` | 知乎 | 点 OpenCLI 扩展图标重连 Bridge |
| `正文不能为空` | 知乎 | 已修复（2026-04-22），重新运行即可 |
| WordPress token 过期 | WordPress | 重新走 OAuth 换 token |

---

---

## 视频发布流程（独立于图文）

> 当用户说「发视频」「上传视频」「视频全平台」时，走本节流程。
> 视频文件路径由用户提供，或由视频生成工具输出。

### Step V0：视频发布前检查

```
□ 视频文件存在且完整（mp4，建议 ≤500MB）
□ 封面图已准备（1080×1080 或 1920×1080，.jpg/.png）
□ 标题 / 描述 / 标签已准备（见下方各平台规范）
□ Chrome 白色浪漫已开，Browser Bridge 已连
□ video.json 已填写（见格式）
```

### video.json 格式

```json
{
  "title": "视频标题（≤55字）",
  "description": "视频描述，必须包含 www.fantula.com",
  "product": "图拉视频 Premium（YouTube Premium）",
  "video_file": "/绝对路径/视频.mp4",
  "cover_image": "/绝对路径/封面.jpg",
  "date": "YYYY-MM-DD",
  "status": "ready"
}
```

### Step V1：生成各平台标签

从 `tag_map.json` 的 `视频平台` 字段取对应产品标签：

```
产品 → tag_map[产品]["视频平台"][平台]
必须包含: 凡图拉 / fantula
描述末尾必须带: www.fantula.com
```

各平台字数限制：

| 平台 | 标题 | 描述/正文 | 标签数 |
|------|------|---------|------|
| 抖音 | ≤55字 | ≤2200字 | ≤10个 |
| 快手 | ≤50字 | ≤1000字 | ≤10个 |
| 小红书 | ≤20字 | ≤1000字 | ≤10个 |
| Bilibili | ≤80字 | ≤2000字 | ≤12个，逗号分隔 |
| 微博视频 | ≤40字 | ≤2000字 | 话题#标签# |
| 知乎视频 | ≤50字 | ≤2000字 | 话题选择，≤5个 |
| TikTok | ≤100字 | ≤2200字 | ≤5个英文 |
| YouTube | ≤100字 | 不限 | ≤500字符 |

### Step V2：国内视频（抖音 + 快手 + 小红书）

```bash
cd /Users/mini/凡图拉宣传/social-auto-upload

# 抖音
uv run sau douyin upload-video \
  --account fantula \
  --file "/绝对路径/视频.mp4" \
  --title "标题（≤55字）" \
  --tags "凡图拉,产品标签1,产品标签2,产品标签3" 2>&1

# 快手
uv run sau kuaishou upload-video \
  --account fantula \
  --file "/绝对路径/视频.mp4" \
  --title "标题（≤50字）" \
  --tags "凡图拉,产品标签1,产品标签2,产品标签3" 2>&1

# 小红书
uv run sau xiaohongshu upload-video \
  --account fantula \
  --file "/绝对路径/视频.mp4" \
  --title "标题（≤20字）" \
  --tags "凡图拉,产品标签1,产品标签2,产品标签3" 2>&1
```

### Step V2b：Bilibili

```bash
cd /Users/mini/凡图拉宣传/发布主管/工具
python3 bilibili_upload.py \
  --file "/绝对路径/视频.mp4" \
  --title "标题（≤80字）" \
  --desc "描述，必须包含 www.fantula.com" \
  --tags "凡图拉,产品标签1,产品标签2" \
  --tid 188 \
  --cover "/绝对路径/封面.jpg"
```

> 分区 TID 建议：188 = 科技/数码，171 = 科技/科普，95 = 生活/数码
> Cookie 失效：`python3 bilibili_upload.py --login` 重新扫码

### Step V2c：微博视频

```bash
cd /Users/mini/凡图拉宣传/发布主管/工具
uv run python weibo_video_publish.py \
  --file "/绝对路径/视频.mp4" \
  --title "标题（≤40字）" \
  --tags "凡图拉,产品标签1,产品标签2"
```

> 需要 Chrome 白色浪漫 + Browser Bridge 已连。脚本会打开 Playwright 浏览器完成上传。
> 若上传界面有变动，会截图到 /tmp/weibo_video_*.png 供人工确认。

### Step V2d：知乎视频

```bash
cd /Users/mini/凡图拉宣传/发布主管/工具
uv run python zhihu_video_publish.py \
  --file "/绝对路径/视频.mp4" \
  --title "标题（≤50字）" \
  --desc "描述，包含 www.fantula.com" \
  --tags "凡图拉,产品标签1,产品标签2"
```

> 知乎视频上传地址：https://www.zhihu.com/creator/video-works/add
> 需要 Chrome 白色浪漫 + Browser Bridge 已连。

### Step V3：TikTok

```bash
cd /Users/mini/凡图拉宣传/发布主管/工具
python3 tiktok_upload.py \
  --file "/绝对路径/视频.mp4" \
  --title "标题 www.fantula.com" \
  --tags "fantula,产品英文标签1,产品英文标签2"
```

### Step V4：YouTube

```bash
cd /Users/mini/凡图拉宣传/发布主管/工具
python3 youtube_upload.py \
  --file "/绝对路径/视频.mp4" \
  --title "标题" \
  --description "描述正文...

🔗 www.fantula.com
📌 关注公众号【凡图拉】

#凡图拉 #fantula #产品标签" \
  --tags "凡图拉,fantula,产品标签1,产品标签2" \
  --category 26 \
  --privacy public
```

> 分类建议：26 = Howto & Style（教程/攻略最合适）

### Step V5：更新 content_log.json

```json
"published": {
  "douyin_video":       { "date": "YYYY-MM-DD" },
  "kuaishou_video":     { "date": "YYYY-MM-DD" },
  "xiaohongshu_video":  { "date": "YYYY-MM-DD" },
  "bilibili":           { "date": "YYYY-MM-DD" },
  "weibo_video":        { "date": "YYYY-MM-DD" },
  "zhihu_video":        { "date": "YYYY-MM-DD" },
  "tiktok":             { "date": "YYYY-MM-DD" },
  "youtube":            { "url": "https://youtu.be/...", "date": "YYYY-MM-DD" }
}
```

### 视频发布已知问题

| 问题 | 平台 | 处理方式 |
|------|------|---------|
| Cookie 失效 | 抖音/快手/小红书 | `sau [平台] login --account fantula --headed` 重新扫码 |
| Cookie 失效 | Bilibili | `python3 bilibili_upload.py --login` 重新扫码 |
| 找不到上传按钮 | 微博/知乎视频 | 看 /tmp/weibo_video_*.png 截图，页面结构可能有变动 |
| 视频过大 | 所有 | 压缩到 ≤500MB，分辨率 ≤1080p |
| TikTok 频率限制 | TikTok | 间隔 30 分钟再发 |
| YouTube 上传卡住 | YouTube | 检查网络，重试 `--privacy unlisted` 先存草稿 |

---

## 文件结构

```
发布主管/
  SKILL.md              ← 本文件（总指挥）
  文章/
    SKILL.md            ← 博客平台总览
    cloudflare_skill/
    wordpress_skill/
    blogger_skill/      ← 含7天重授权流程
    zhihu_skill/        ← 含 Browser Bridge 前置说明
  社交/
    SKILL.md            ← 社交平台总览
    facebook_skill/     ← 含 Live 模式说明
    instagram_skill/
    x_skill/            ← 含 stale page 说明
    weibo_skill/        ← 含 errno:-1 说明
    telegram_skill/
  工具/
    weibo_publish.mjs         ← 微博图文发布
    weibo_article_publish.mjs ← 微博头条文章（Playwright）
    zhihu_publish.mjs         ← 知乎专栏文章
    meta_publish.mjs          ← Instagram / Facebook
    telegram_publish.mjs      ← Telegram 频道
    tiktok_upload.py          ← TikTok 视频
    youtube_upload.py         ← YouTube 视频（OAuth）
    bilibili_upload.py        ← Bilibili 视频（biliup）
    weibo_video_publish.py    ← 微博视频（Playwright）
    zhihu_video_publish.py    ← 知乎视频（Playwright）
    bridge_cookies.py         ← Browser Bridge cookie 提取（供 Playwright 工具共用）
    tag_map.json              ← 各产品 × 各平台标签映射
    tag_formatter.py          ← 标签格式化输出
    fantula-publisher/
      publish.py        ← Cloudflare + WordPress 同时发
```
