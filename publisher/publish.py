#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Fantula 双平台博客自动发布脚本
==============================
支持平台:
  1. Cloudflare 自建博客  (blog.fantula.net)
  2. WordPress.com 博客   (hsym2026-zgtwr.wordpress.com)

用法:
  python3 publish.py article.json              # 同时发布到两个平台
  python3 publish.py article.json --cf         # 只发到 Cloudflare
  python3 publish.py article.json --wp         # 只发到 WordPress.com
  python3 publish.py article.json --draft      # 存为草稿（不公开）
  python3 publish.py --test                    # 测试 API 连接是否正常
"""

import sys, json, os, argparse, mimetypes
from pathlib import Path

# ── 加载配置 ─────────────────────────────────────────────────
try:
    from config import (
        CF_API_BASE, CF_API_SECRET,
        WP_SITE_ID, WP_TOKEN
    )
except ImportError:
    print("❌ 找不到 config.py，请先配置 API 密钥")
    sys.exit(1)

import urllib.request, urllib.parse, urllib.error
import json as _json


# ════════════════════════════════════════════════════════════
#  工具函数
# ════════════════════════════════════════════════════════════

def http_post(url, data, headers, timeout=30):
    """通用 POST 请求（返回解析后的 JSON）"""
    body = json.dumps(data).encode("utf-8")
    default_headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Fantula-Publisher/1.0"}
    default_headers.update(headers)
    req  = urllib.request.Request(url, data=body, headers=default_headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8")), resp.status
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        try:
            return json.loads(err_body), e.code
        except Exception:
            return {"error": err_body}, e.code


def http_get(url, headers, timeout=15):
    default_headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Fantula-Publisher/1.0"}
    default_headers.update(headers)
    req = urllib.request.Request(url, headers=default_headers)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8")), resp.status


def upload_image_cf(image_path: str) -> str:
    """
    上传本地图片到 Cloudflare R2，返回公开 URL。

    参数:
        image_path: 本地图片路径，如 "/Users/you/img/cover.jpg"

    返回:
        图片公开 URL
    """
    import http.client, uuid
    path = Path(image_path)
    if not path.exists():
        raise FileNotFoundError(f"图片不存在: {image_path}")

    mime = mimetypes.guess_type(str(path))[0] or "image/jpeg"
    boundary = uuid.uuid4().hex
    data = path.read_bytes()

    body  = f"--{boundary}\r\n".encode()
    body += f'Content-Disposition: form-data; name="file"; filename="{path.name}"\r\n'.encode()
    body += f"Content-Type: {mime}\r\n\r\n".encode()
    body += data
    body += f"\r\n--{boundary}--\r\n".encode()

    host = CF_API_BASE.replace("https://", "").split("/")[0]
    conn = http.client.HTTPSConnection(host, timeout=60)
    conn.request("POST", "/api/upload", body=body, headers={
        "Content-Type": f"multipart/form-data; boundary={boundary}",
        "X-API-Secret": CF_API_SECRET,
    })
    resp = conn.getresponse()
    result = json.loads(resp.read().decode("utf-8"))
    conn.close()

    if "url" not in result:
        raise RuntimeError(f"图片上传失败: {result}")
    print(f"  📷 CF图片已上传: {result['url']}")
    return result["url"]


def upload_image_wp(image_path: str) -> dict:
    """
    上传本地图片到 WordPress.com 媒体库。

    返回:
        { "url": "公开URL", "id": media_id }
    """
    import http.client, uuid
    path = Path(image_path)
    if not path.exists():
        raise FileNotFoundError(f"图片不存在: {image_path}")

    mime = mimetypes.guess_type(str(path))[0] or "image/jpeg"
    boundary = uuid.uuid4().hex
    data = path.read_bytes()

    body  = f"--{boundary}\r\n".encode()
    body += f'Content-Disposition: form-data; name="media[]"; filename="{path.name}"\r\n'.encode()
    body += f"Content-Type: {mime}\r\n\r\n".encode()
    body += data
    body += f"\r\n--{boundary}--\r\n".encode()

    conn = http.client.HTTPSConnection("public-api.wordpress.com", timeout=60)
    conn.request(
        "POST",
        f"/rest/v1.1/sites/{WP_SITE_ID}/media/new",
        body=body,
        headers={
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "Authorization": f"Bearer {WP_TOKEN}",
        }
    )
    resp   = conn.getresponse()
    result = json.loads(resp.read().decode("utf-8"))
    conn.close()

    items = result.get("media", [])
    if not items:
        raise RuntimeError(f"WP 图片上传失败: {result}")
    print(f"  📷 WP图片已上传: {items[0]['URL']}")
    return {"url": items[0]["URL"], "id": items[0]["ID"]}


def md_to_html(text: str) -> str:
    """
    Markdown → HTML 转换。
    优先使用 markdown2（pip3 install markdown2），否则用内置简单转换。
    """
    try:
        import markdown2
        return markdown2.markdown(text, extras=["fenced-code-blocks", "tables"])
    except ImportError:
        pass

    import re
    lines, out, in_list = text.split("\n"), [], False
    for line in lines:
        if   line.startswith("### "): out.append(f"<h3>{line[4:]}</h3>"); continue
        elif line.startswith("## "):  out.append(f"<h2>{line[3:]}</h2>"); continue
        elif line.startswith("# "):   out.append(f"<h1>{line[2:]}</h1>"); continue
        if line.strip() in ("---", "***", "___"):
            out.append("<hr>"); continue
        if line.startswith("- ") or line.startswith("* "):
            if not in_list: out.append("<ul>"); in_list = True
            out.append(f"<li>{line[2:]}</li>"); continue
        else:
            if in_list: out.append("</ul>"); in_list = False
        if line.strip() == "":
            out.append("<p></p>"); continue
        line = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", line)
        line = re.sub(r"\*(.+?)\*",     r"<em>\1</em>",         line)
        line = re.sub(r"`(.+?)`",        r"<code>\1</code>",      line)
        line = re.sub(r"\[(.+?)\]\((.+?)\)", r'<a href="\2">\1</a>', line)
        out.append(f"<p>{line}</p>")
    if in_list: out.append("</ul>")
    return "\n".join(out)


# ════════════════════════════════════════════════════════════
#  Cloudflare 发布
# ════════════════════════════════════════════════════════════

def publish_cf(article: dict, draft=False) -> dict:
    """
    发布到 Cloudflare 自建博客 (blog.fantula.net)

    article 字段:
        title       (必填) 标题
        content     (必填) Markdown 正文
        excerpt     (选填) 摘要
        category    (选填) tutorial/savings/review/troubleshoot/general
        lang        (选填) zh/en/ja
        cover_image (选填) 封面图本地路径 或 https:// URL
        slug        (选填) URL别名
        tags        (选填) 标签列表 ["tag1","tag2"]
    """
    print("\n📡 发布到 Cloudflare 博客...")

    cover_url = article.get("cover_image", "")
    if cover_url and not cover_url.startswith("http"):
        cover_url = upload_image_cf(cover_url)

    # 替换正文中的本地图片路径
    content = article.get("content", "")
    import re
    for local_path in re.findall(r'!\[.*?\]\(((?!http)[^)]+)\)', content):
        remote_url = upload_image_cf(local_path)
        content = content.replace(f"]({local_path})", f"]({remote_url})")

    payload = {
        "title":       article["title"],
        "content":     content,
        "excerpt":     article.get("excerpt", content[:120].replace("\n", " ") + "…"),
        "category":    article.get("category", "general"),
        "lang":        article.get("lang", "zh"),
        "cover_image": cover_url,
        "slug":        article.get("slug", ""),
        "status":      "draft" if draft else "published",
        "tags":        article.get("tags", []),
    }

    result, status = http_post(
        f"{CF_API_BASE}/api/posts",
        payload,
        headers={
            "Content-Type":  "application/json",
            "X-API-Secret":  CF_API_SECRET,
        }
    )

    if status in (200, 201) and result.get("success"):
        post = result.get("post", result)
        url  = f"https://blog.fantula.net/post/{post.get('id', '')}"
        print(f"  ✅ 成功！ID: {post.get('id')}  URL: {url}")
        return {"platform": "cloudflare", "success": True, "id": post.get("id"), "url": url}
    else:
        print(f"  ❌ 失败: {status} → {result}")
        return {"platform": "cloudflare", "success": False, "error": result}


# ════════════════════════════════════════════════════════════
#  WordPress.com 发布
# ════════════════════════════════════════════════════════════

def publish_wp(article: dict, draft=False) -> dict:
    """
    发布到 WordPress.com 博客 (hsym2026-zgtwr.wordpress.com)

    article 字段:
        title        (必填) 标题
        content      (必填) Markdown 或 HTML 正文
        excerpt      (选填) 摘要
        category     (选填) 分类名称
        tags         (选填) 标签列表或逗号分隔字符串
        cover_image  (选填) 封面图本地路径 或 https:// URL
    """
    print("\n📡 发布到 WordPress.com 博客...")

    # Markdown → HTML
    content = article.get("content", "")
    if not content.strip().startswith("<"):
        content = md_to_html(content)

    # 替换正文中的本地图片（HTML src）
    import re
    for local_path in re.findall(r'src="((?!http)[^"]+)"', content):
        wp_img = upload_image_wp(local_path)
        content = content.replace(f'src="{local_path}"', f'src="{wp_img["url"]}"')

    # 封面图上传
    featured_id = article.get("featured_image_id")
    cover = article.get("cover_image", "")
    if not featured_id and cover and not cover.startswith("http"):
        wp_img = upload_image_wp(cover)
        featured_id = wp_img["id"]

    tags = article.get("tags", [])
    if isinstance(tags, list):
        tags = ",".join(tags)

    payload = {
        "title":    article["title"],
        "content":  content,
        "excerpt":  article.get("excerpt", ""),
        "status":   "draft" if draft else "publish",
        "categories": article.get("category", ""),
        "tags":     tags,
    }
    if featured_id:
        payload["featured_image"] = str(featured_id)

    result, status = http_post(
        f"https://public-api.wordpress.com/rest/v1.1/sites/{WP_SITE_ID}/posts/new",
        payload,
        headers={
            "Content-Type":  "application/json",
            "Authorization": f"Bearer {WP_TOKEN}",
        }
    )

    if status in (200, 201) and result.get("ID"):
        url = result.get("URL", "")
        print(f"  ✅ 成功！ID: {result['ID']}  URL: {url}")
        return {"platform": "wordpress", "success": True, "id": result["ID"], "url": url}
    else:
        print(f"  ❌ 失败: {status} → {result}")
        return {"platform": "wordpress", "success": False, "error": result}


# ════════════════════════════════════════════════════════════
#  主入口
# ════════════════════════════════════════════════════════════

def test_connections():
    print("🔍 测试 API 连接...\n")
    try:
        result, status = http_get(
            f"{CF_API_BASE}/api/posts?limit=1",
            headers={"X-API-Secret": CF_API_SECRET}
        )
        print("✅ Cloudflare 博客 API 正常" if status == 200 else f"⚠️  CF返回 {status}")
    except Exception as e:
        print(f"❌ Cloudflare 连接失败: {e}")

    try:
        result, status = http_get(
            "https://public-api.wordpress.com/rest/v1.1/me",
            headers={"Authorization": f"Bearer {WP_TOKEN}"}
        )
        print(f"✅ WordPress.com API 正常 (用户: {result.get('username')})" if status == 200 else f"⚠️  WP返回 {status}")
    except Exception as e:
        print(f"❌ WordPress.com 连接失败: {e}")


def main():
    parser = argparse.ArgumentParser(description="Fantula 双平台博客发布工具")
    parser.add_argument("article",  nargs="?", help="文章 JSON 文件路径")
    parser.add_argument("--cf",     action="store_true", help="只发布到 Cloudflare")
    parser.add_argument("--wp",     action="store_true", help="只发布到 WordPress.com")
    parser.add_argument("--draft",  action="store_true", help="存为草稿")
    parser.add_argument("--test",   action="store_true", help="测试 API 连接")
    args = parser.parse_args()

    if args.test:
        test_connections()
        return

    if not args.article:
        parser.print_help()
        return

    article_path = Path(args.article)
    if not article_path.exists():
        print(f"❌ 文件不存在: {args.article}")
        sys.exit(1)

    with open(article_path, encoding="utf-8") as f:
        article = json.load(f)

    article_dir = article_path.parent.resolve()

    def resolve_path(p):
        if p and not Path(p).is_absolute():
            return str(article_dir / p)
        return p

    if "cover_image" in article:
        article["cover_image"] = resolve_path(article["cover_image"])

    if "images" in article:
        article["images"] = [resolve_path(img) for img in article["images"]]

    if "content" in article:
        import re
        article["content"] = re.sub(
            r'(!\[[^\]]*\])\(([^)]+)\)',
            lambda m: m.group(1) + '(' + resolve_path(m.group(2)) + ')',
            article["content"],
        )

    print(f"\n📝 文章: {article['title']}")
    print(f"   分类: {article.get('category','general')}  语言: {article.get('lang','zh')}")
    print(f"   模式: {'草稿' if args.draft else '立即发布'}")
    print("─" * 50)

    results = []
    both = not args.cf and not args.wp
    if args.cf or both:
        results.append(publish_cf(article, draft=args.draft))
    if args.wp or both:
        results.append(publish_wp(article, draft=args.draft))

    print("\n" + "═" * 50)
    print("📊 发布结果汇总")
    print("═" * 50)
    for r in results:
        icon = "✅" if r["success"] else "❌"
        name = "Cloudflare" if r["platform"] == "cloudflare" else "WordPress.com"
        print(f"  {icon} {name}: {r.get('url', r.get('error', ''))}")


if __name__ == "__main__":
    main()
