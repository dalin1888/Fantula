# ============================================================
#  Fantula 双平台博客发布 — 配置文件
#  修改这里的值即可，其他文件不需要动
# ============================================================

# ── Cloudflare 自建博客 ─────────────────────────────────────
CF_API_BASE   = "https://fantula-blog-api.jiangdalin1988.workers.dev"
CF_API_SECRET = "your_api_secret_here"         # Worker 的 API_SECRET 环境变量

# 分类可选值: tutorial / savings / review / troubleshoot / general
# 语言可选值: zh / en / ja

# ── WordPress.com 博客 ──────────────────────────────────────
WP_SITE_ID    = "254201953"                 # 博客数字 ID
WP_SITE_URL   = "hsym2026-zgtwr.wordpress.com"
WP_TOKEN      = "your_wp_token_here"
# Token 有效期 14 天（1,209,600 秒），到期后重新走 OAuth 流程获取新 token
# OAuth 授权地址: https://public-api.wordpress.com/oauth2/authorize?client_id=137459&redirect_uri=https://localhost&response_type=token&scope=global
WP_CLIENT_ID  = "137459"

# ── Cloudflare R2 图片上传 ──────────────────────────────────
# 上传接口: POST {CF_API_BASE}/api/upload
# 字段:     file (multipart/form-data)
# 返回:     { "url": "https://..." }
