#!/usr/bin/env node
/**
 * 微博文章发布工具 — 凡图拉宣传
 *
 * 用法:
 *   node weibo_article_publish.mjs "文章标题" article.md [cover.png]
 *   node weibo_article_publish.mjs "文章标题" article.html [cover.jpg]
 *
 * 流程:
 *   1. Browser Bridge 读取微博 cookies
 *   2. 把文章图片上传到微博 picupload，获得微博 CDN URL
 *   3. Markdown → HTML（图片替换为微博 CDN URL）
 *   4. Playwright 打开微博文章编辑器，注入内容，发布
 *
 * 依赖:
 *   - Chrome 白色浪漫 Profile 已开，Browser Bridge 已连接
 *   - Node.js 18+，playwright 包（已在 social-auto-upload venv 中安装）
 *
 * 说明:
 *   微博文章（头条）API 无公开文档，使用 Playwright 操作编辑器最可靠。
 *   图片必须上传到微博自身 CDN（sinaimg.cn），否则文章里图片无法显示。
 */

import * as fs       from 'node:fs';
import * as path     from 'node:path';
import * as https    from 'node:https';
import * as http     from 'node:http';
import * as crypto   from 'node:crypto';
import { execSync, spawn }  from 'node:child_process';
import { fileURLToPath }    from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Browser Bridge ────────────────────────────────────────────────────────
const _globalRoot  = execSync('npm root -g').toString().trim();
const _daemonClient = path.join(_globalRoot, '@jackwener/opencli/dist/src/browser/daemon-client.js');
const { sendCommand } = await import(_daemonClient);

// ─── 参数解析 ──────────────────────────────────────────────────────────────
const [,, title, contentFile, coverArg] = process.argv;
if (!title || !contentFile) {
  console.error('用法: node weibo_article_publish.mjs "文章标题" article.md [cover.png]');
  process.exit(1);
}

const filePath  = path.resolve(contentFile);
const coverPath = coverArg ? path.resolve(coverArg) : null;
if (!fs.existsSync(filePath)) { console.error(`❌ 内容文件不存在: ${filePath}`); process.exit(1); }
if (coverPath && !fs.existsSync(coverPath)) { console.error(`❌ 封面图不存在: ${coverPath}`); process.exit(1); }

const fileDir = path.dirname(filePath);
const ext     = path.extname(filePath).toLowerCase();
const rawContent = fs.readFileSync(filePath, 'utf8');

// ─── CRC32 (Weibo 上传需要) ────────────────────────────────────────────────
function crc32(data) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc = crc ^ data[i];
    for (let j = 0; j < 8; j++)
      crc = (crc & 1) ? (crc >>> 1) ^ 0xEDB88320 : (crc >>> 1);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ─── HTTP(S) 请求封装 ──────────────────────────────────────────────────────
function httpsPost(hostname, reqPath, headers, body) {
  return new Promise((resolve, reject) => {
    const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
    const req = https.request(
      { hostname, path: reqPath, method: 'POST',
        headers: { ...headers, 'Content-Length': buf.length } },
      res => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, data: Buffer.concat(chunks).toString() }));
      }
    );
    req.on('error', reject);
    req.write(buf);
    req.end();
  });
}

async function fetchBuffer(src) {
  if (!src.startsWith('http')) {
    return { buffer: fs.readFileSync(src), filename: path.basename(src) };
  }
  return new Promise((resolve, reject) => {
    const mod = src.startsWith('https://') ? https : http;
    mod.get(src, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve(fetchBuffer(res.headers.location)); return;
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({
        buffer: Buffer.concat(chunks),
        filename: src.split('/').pop().split('?')[0] || 'image.jpg',
      }));
    }).on('error', reject);
  });
}

// ─── 上传图片到微博 picupload，返回 { pid, url } ───────────────────────────
async function uploadToWeibo(srcOrBuffer, cookieStr, uid, filename = 'image.jpg') {
  let imageBuffer, fname;
  if (Buffer.isBuffer(srcOrBuffer)) {
    imageBuffer = srcOrBuffer;
    fname = filename;
  } else {
    const r = await fetchBuffer(srcOrBuffer);
    imageBuffer = r.buffer;
    fname = r.filename;
  }

  const md5       = crypto.createHash('md5').update(imageBuffer).digest('hex');
  const cs        = crc32(imageBuffer);
  const requestId = Date.now();

  const params = new URLSearchParams({
    file_source: '1', cs: cs.toString(), ent: 'miniblog',
    appid: '339644097', uid,
    raw_md5: md5, ori: '1', pri: '0',
    request_id: requestId.toString(),
    file_size: imageBuffer.length.toString(),
  });

  const r = await httpsPost(
    'picupload.weibo.com',
    `/interface/upload.php?${params}`,
    {
      'Cookie':       cookieStr,
      'Content-Type': 'application/octet-stream',
      'Referer':      'https://weibo.com/',
      'Origin':       'https://weibo.com',
      'User-Agent':   'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    },
    imageBuffer
  );

  if (r.status !== 200) throw new Error(`picupload HTTP ${r.status}: ${r.data.slice(0, 200)}`);
  const json = JSON.parse(r.data);
  if (!json.ret) throw new Error(`picupload 失败: ${r.data.slice(0, 200)}`);

  const pid = json.pic.pid;
  // 微博图片 URL，ext 从 fname 推断（Weibo 统一存 jpg 但原格式 pid 可用）
  const picExt = path.extname(fname).toLowerCase().replace('.', '') || 'jpg';
  const url = `https://ww1.sinaimg.cn/large/${pid}`;
  return { pid, url, fname };
}

// ─── 处理 MD 里的图片：上传到微博，返回替换后的 MD ───────────────────────
async function uploadImagesInMd(md, baseDir, cookieStr, uid) {
  const re = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const tasks = [];
  let m;
  while ((m = re.exec(md)) !== null) {
    const [full, alt, src] = m;
    const resolved = src.startsWith('http') ? src : path.resolve(baseDir, src);
    tasks.push({ full, alt, resolved, origSrc: src });
  }
  if (tasks.length === 0) return md;

  console.log(`🖼  上传 ${tasks.length} 张图片到微博 CDN...`);
  let result = md;
  for (const t of tasks) {
    try {
      const { url } = await uploadToWeibo(t.resolved, cookieStr, uid);
      console.log(`  ✅ ${path.basename(t.origSrc)} → ${url}`);
      result = result.replace(t.full, `![${t.alt}](${url})`);
    } catch (e) {
      console.warn(`  ⚠️  ${t.origSrc} 上传失败: ${e.message}，跳过`);
      result = result.replace(t.full, '');
    }
  }
  return result;
}

// ─── Markdown → HTML（图片已替换为微博 CDN URL）────────────────────────────
function mdToHtml(md) {
  // 去掉 frontmatter
  let text = md.replace(/^---[\s\S]*?---\n?/, '');

  // 转换表格
  text = text.replace(/((\|.+\|\n)+)/gm, block => {
    const rows = block.trim().split('\n').filter(r => !/^\|[-:| ]+\|$/.test(r));
    const html = rows.map((row, i) => {
      const cells = row.split('|').slice(1, -1).map(c => c.trim());
      const tag   = i === 0 ? 'th' : 'td';
      return `<tr>${cells.map(c => `<${tag}>${c}</${tag}>`).join('')}</tr>`;
    }).join('');
    return `<table border="1" style="border-collapse:collapse;width:100%;margin:16px 0">${html}</table>\n\n`;
  });

  text = text
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm,  '<h2>$1</h2>')
    .replace(/^# (.+)$/gm,   '<h1>$1</h1>')
    .replace(/^> (.+)$/gm,   '<blockquote><p>$1</p></blockquote>')
    .replace(/^- (.+)$/gm,   '<li>$1</li>')
    .replace(/(<li>[\s\S]*?<\/li>\n?)+/g, s => `<ul>${s}</ul>`)
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  text = text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,     '<em>$1</em>')
    .replace(/`(.+?)`/g,       '<code>$1</code>')
    // http 图片 → <img>（已上传到微博 CDN）
    .replace(/!\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g, (_, alt, src) =>
      `<img src="${src}" alt="${alt}" style="max-width:100%;display:block;margin:12px auto">`)
    // 链接
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
    // 剩余本地路径图片（上传失败的）
    .replace(/!\[.*?\]\((?!http)[^)]*\)/g, '');

  const blocks = text.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
  return blocks.map(p =>
    /^<(h[1-6]|ul|ol|blockquote|table|li|img)/.test(p) ? p : `<p>${p.replace(/\n/g, '<br>')}</p>`
  ).join('\n');
}

// ─── 主流程 ────────────────────────────────────────────────────────────────
console.log('🔑 读取微博 cookies...');
let cookieStr, xsrfToken, uid;
try {
  const cookies = await sendCommand('cookies', { url: 'https://weibo.com' });
  const sub = cookies.find(c => c.name === 'SUB');
  if (!sub) { console.error('❌ 未找到 SUB cookie，请先在白色浪漫 Chrome 里登录微博'); process.exit(1); }

  cookieStr  = cookies.map(c => `${c.name}=${c.value}`).join('; ');
  xsrfToken  = cookies.find(c => c.name === 'XSRF-TOKEN')?.value || '';
  const uidCookie = cookies.find(c => c.name === 'uid' || c.name === 'WEIBOCN_FROM');
  uid = '7727624629';  // 凡图拉固定 UID
  console.log('✅ cookies 读取成功');
} catch (e) {
  console.error('❌ Browser Bridge 连接失败:', e.message);
  process.exit(1);
}

// 上传封面图（可选）
let coverUrl = '';
if (coverPath) {
  try {
    process.stdout.write(`📸 上传封面图 ${path.basename(coverPath)}... `);
    const { url } = await uploadToWeibo(coverPath, cookieStr, uid);
    coverUrl = url;
    console.log(`✅ ${url}`);
  } catch (e) {
    console.warn(`⚠️  封面图上传失败: ${e.message}`);
  }
}

// 处理正文图片 + 转 HTML
console.log('\n📝 处理文章内容...');
let processedMd  = rawContent;
if (ext === '.md') {
  processedMd  = await uploadImagesInMd(rawContent, fileDir, cookieStr, uid);
}
const htmlContent = ext === '.md' ? mdToHtml(processedMd) : rawContent;

console.log(`   标题: ${title}`);
console.log(`   HTML 长度: ${htmlContent.length} 字符`);

// ─── Playwright 发布 ───────────────────────────────────────────────────────
console.log('\n🌐 启动 Playwright 打开微博文章编辑器...');

// 将 HTML + 元数据写到临时文件，供 Playwright 读取
const tmpPayload = `/tmp/weibo_article_payload_${Date.now()}.json`;
fs.writeFileSync(tmpPayload, JSON.stringify({ title, html: htmlContent, coverUrl, cookieStr }));

// Playwright 脚本（注入为子进程，在 SAU Python 环境里运行）
const PW_SCRIPT = `
import asyncio, json, sys, time
from playwright.async_api import async_playwright

payload = json.loads(open('${tmpPayload}').read())
title     = payload['title']
html      = payload['html']
cover_url = payload['coverUrl']
cookie_str= payload['cookieStr']

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False, args=['--no-sandbox'])
        ctx = await browser.new_context(
            viewport={'width': 1440, 'height': 900},
            user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        )

        # 注入 Weibo cookies
        for pair in cookie_str.split('; '):
            if '=' not in pair: continue
            name, _, val = pair.partition('=')
            try:
                await ctx.add_cookies([{
                    'name': name.strip(), 'value': val.strip(),
                    'domain': '.weibo.com', 'path': '/',
                }])
            except Exception:
                pass

        page = await ctx.new_page()

        print('🌐 打开微博文章编辑器...')
        await page.goto('https://weibo.com/ttarticle/pc/writenew', wait_until='domcontentloaded', timeout=30000)
        await page.wait_for_timeout(3000)

        # 截图确认页面
        ss1 = f'/tmp/weibo_article_1_{int(time.time())}.png'
        await page.screenshot(path=ss1)
        print(f'   截图: {ss1}')

        # 填入标题
        title_sels = [
            'input[placeholder*="标题"]',
            'input.title-input',
            'input[data-type="title"]',
            'div.title input',
            'input[name="title"]',
        ]
        title_filled = False
        for sel in title_sels:
            try:
                if await page.locator(sel).count() > 0:
                    await page.locator(sel).first.fill(title)
                    title_filled = True
                    print(f'✅ 标题已填入: {sel}')
                    break
            except Exception:
                continue

        if not title_filled:
            print('⚠️  未找到标题输入框，尝试用 TAB 定位...')
            await page.keyboard.press('Tab')
            await page.keyboard.type(title)

        await page.wait_for_timeout(500)

        # 注入 HTML 内容到富文本编辑器
        print('📄 注入文章 HTML 内容...')
        injected = await page.evaluate("""(html) => {
            // 尝试常见的微博文章编辑器选择器
            const selectors = [
                'div.ProseMirror',
                'div[contenteditable="true"]',
                'div.ql-editor',
                'div.editor-content',
                'div[class*="article-editor"]',
                'div[class*="content-editor"]',
                'div[class*="editor"][contenteditable]',
            ];
            for (const sel of selectors) {
                const el = document.querySelector(sel);
                if (el) {
                    el.focus();
                    el.innerHTML = html;
                    el.dispatchEvent(new Event('input', {bubbles: true}));
                    el.dispatchEvent(new Event('change', {bubbles: true}));
                    return {ok: true, sel};
                }
            }
            // 最后尝试：找所有 contenteditable
            const all = document.querySelectorAll('[contenteditable="true"]');
            if (all.length > 0) {
                const el = all[all.length - 1]; // 通常最后一个是内容区
                el.focus();
                el.innerHTML = html;
                el.dispatchEvent(new Event('input', {bubbles: true}));
                return {ok: true, sel: 'last-contenteditable'};
            }
            return {ok: false};
        }""", html)

        print(f'   注入结果: {injected}')
        await page.wait_for_timeout(1500)

        ss2 = f'/tmp/weibo_article_2_{int(time.time())}.png'
        await page.screenshot(path=ss2)
        print(f'   内容截图: {ss2}')

        # 找发布按钮
        publish_sels = [
            'button:has-text("发布")',
            'button:has-text("发布文章")',
            'button.publish-btn',
            'button[class*="publish"]',
            'div:has-text("发布") >> button',
            'span:has-text("发布") >> ..',
        ]
        published = False
        for sel in publish_sels:
            try:
                btn = page.locator(sel).first
                if await btn.count() > 0:
                    print(f'🚀 点击发布按钮: {sel}')
                    await btn.click()
                    await page.wait_for_timeout(3000)
                    published = True
                    break
            except Exception:
                continue

        if not published:
            ss3 = f'/tmp/weibo_article_publish_btn_{int(time.time())}.png'
            await page.screenshot(path=ss3)
            print(f'⚠️  未找到发布按钮，截图: {ss3}')
            print('   请手动点击发布按钮，等待60秒...')
            await page.wait_for_timeout(60000)

        # 等待发布完成，获取文章 URL
        await page.wait_for_timeout(3000)
        ss4 = f'/tmp/weibo_article_done_{int(time.time())}.png'
        await page.screenshot(path=ss4)
        print(f'   发布后截图: {ss4}')

        current_url = page.url
        print(f'\\n✅ 完成！当前 URL: {current_url}')

        if 'ttarticle' in current_url and 'show' in current_url:
            print(f'🔗 文章地址: {current_url}')
        else:
            # 尝试从页面提取文章链接
            article_links = await page.evaluate("""() => {
                const links = [...document.querySelectorAll('a[href*="ttarticle"]')];
                return links.map(a => a.href).filter(h => h.includes('show'));
            }""")
            if article_links:
                print(f'🔗 文章地址: {article_links[0]}')

        await browser.close()
        import os; os.unlink('${tmpPayload}')

asyncio.run(main())
`;

// 写 Python 脚本到临时文件
const tmpPy = `/tmp/weibo_article_pw_${Date.now()}.py`;
fs.writeFileSync(tmpPy, PW_SCRIPT);

// 在 social-auto-upload uv 环境里运行 Playwright
const SAU_DIR = '/Users/mini/凡图拉宣传/social-auto-upload';
const child = spawn('uv', ['run', 'python', tmpPy], {
  cwd: SAU_DIR,
  stdio: 'inherit',
  env: { ...process.env },
});

child.on('close', code => {
  try { fs.unlinkSync(tmpPy); } catch {}
  if (code !== 0) {
    console.error(`\n❌ Playwright 脚本退出码: ${code}`);
    process.exit(1);
  }
});

child.on('error', e => {
  console.error(`❌ 启动失败: ${e.message}`);
  process.exit(1);
});
