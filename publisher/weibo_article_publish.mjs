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
let [,, title, contentFile, coverArg] = process.argv;
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
let cookieStr, xsrfToken, uid, rawCookies;
try {
  // 同时获取三个域的 cookies，合并去重（card.weibo.com 有 PC_TOKEN / XSRF-TOKEN）
  const [weiboCookies, cardCookies, passportCookies] = await Promise.all([
    sendCommand('cookies', { url: 'https://weibo.com' }),
    sendCommand('cookies', { url: 'https://card.weibo.com' }).catch(() => []),
    sendCommand('cookies', { url: 'https://passport.weibo.com' }).catch(() => []),
  ]);
  // 合并并去重（weibo.com 优先，再 card，再 passport）
  const seen = new Set(weiboCookies.map(c => c.name));
  const seen2 = new Set([...seen, ...cardCookies.map(c => c.name)]);
  rawCookies = [
    ...weiboCookies,
    ...cardCookies.filter(c => !seen.has(c.name)),
    ...passportCookies.filter(c => !seen2.has(c.name)),
  ];

  const sub = rawCookies.find(c => c.name === 'SUB');
  if (!sub) { console.error('❌ 未找到 SUB cookie，请先在白色浪漫 Chrome 里登录微博'); process.exit(1); }

  cookieStr  = rawCookies.map(c => `${c.name}=${c.value}`).join('; ');
  xsrfToken  = rawCookies.find(c => c.name === 'XSRF-TOKEN')?.value || '';
  uid = '7727624629';  // 凡图拉固定 UID
  console.log(`✅ cookies 读取成功（${rawCookies.length} 个）`);
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

// 微博头条文章标题最多 32 字
if ([...title].length > 32) {
  const trimmed = [...title].slice(0, 32).join('');
  console.warn(`⚠️  标题超过32字，已截断: ${trimmed}`);
  title = trimmed;
}
console.log(`   标题: ${title}`);;
console.log(`   HTML 长度: ${htmlContent.length} 字符`);

// ─── Playwright 发布 ───────────────────────────────────────────────────────
console.log('\n🌐 启动 Playwright 打开微博文章编辑器...');

// 将 HTML + 元数据写到临时文件，供 Playwright 读取
const tmpPayload = `/tmp/weibo_article_payload_${Date.now()}.json`;
// 构建 Playwright 格式的完整 cookie 对象（保留 domain/secure/httpOnly/sameSite/expires）
const pwCookies = rawCookies.map(c => {
  const obj = {
    name:     c.name,
    value:    c.value,
    domain:   c.domain || '.weibo.com',
    path:     c.path || '/',
    httpOnly: !!c.httpOnly,
    secure:   !!c.secure,
    sameSite: ['Strict','Lax','None'].includes(c.sameSite) ? c.sameSite : 'Lax',
  };
  const exp = c.expirationDate ?? c.expires;
  if (exp) obj.expires = Number(exp);
  return obj;
});
fs.writeFileSync(tmpPayload, JSON.stringify({ title, html: htmlContent, coverUrl, cookieStr, pwCookies }));

// Playwright 脚本（注入为子进程，在 SAU Python 环境里运行）
const PW_SCRIPT = `
import asyncio, json, time, pyperclip
from playwright.async_api import async_playwright

payload = json.loads(open('${tmpPayload}').read())
title     = payload['title']
html      = payload['html']
cover_url = payload['coverUrl']
pw_cookies= payload['pwCookies']

# ── 把 HTML 写入剪贴板供粘贴 ──────────────────────────────────────────────────
def copy_to_clipboard(text):
    try:
        pyperclip.copy(text)
        return True
    except Exception as e:
        print(f'   ⚠️  剪贴板写入失败: {e}')
        return False

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=False,
            args=['--no-sandbox', '--disable-blink-features=AutomationControlled'],
        )
        ctx = await browser.new_context(
            viewport={'width': 1440, 'height': 900},
            user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        )
        await ctx.add_init_script("Object.defineProperty(navigator,'webdriver',{get:()=>undefined})")

        # 注入 cookies
        try:
            await ctx.add_cookies(pw_cookies)
            print(f'✅ 注入 {len(pw_cookies)} 个 cookies')
        except Exception as e:
            print(f'⚠️  批量注入失败: {e}，逐个注入...')
            ok = 0
            for c in pw_cookies:
                try: await ctx.add_cookies([c]); ok += 1
                except: pass
            print(f'   逐个注入：{ok}/{len(pw_cookies)}')

        page = await ctx.new_page()

        # ── Step 1: 先去主页建立 session ──────────────────────────────────────
        print('🌐 验证微博登录状态...')
        await page.goto('https://weibo.com', wait_until='networkidle', timeout=30000)
        await page.wait_for_timeout(2000)
        if 'login' in page.url or 'passport' in page.url:
            print('❌ 未登录，请先在白色浪漫 Chrome 里登录微博')
            await browser.close(); return
        print(f'   ✅ 已登录，URL: {page.url}')

        # ── Step 2: 打开文章编辑器（card.weibo.com）─────────────────────────
        print('🌐 打开微博头条文章编辑器...')
        await page.goto('https://card.weibo.com/article/v5/editor#/draft',
                        wait_until='networkidle', timeout=60000)
        await page.wait_for_timeout(3000)
        print(f'   URL: {page.url} | 标题: {await page.title()}')

        # 等待标题输入框出现
        try:
            await page.wait_for_selector('textarea[placeholder="请输入标题"]', timeout=20000)
            print('   ✅ 编辑器已就绪')
        except:
            ss = f'/tmp/weibo_article_editor_err_{int(time.time())}.png'
            await page.screenshot(path=ss, full_page=True)
            print(f'   ❌ 编辑器未加载，截图: {ss}'); await browser.close(); return

        # 等待 loading spinner 消失（n-spin-body editor-spin 遮住了输入框）
        try:
            await page.wait_for_selector('.editor-spin', state='hidden', timeout=15000)
            print('   ✅ Spinner 已消失')
        except:
            print('   ⚠️  Spinner 未消失，继续尝试...')
        await page.wait_for_timeout(1500)

        ss1 = f'/tmp/weibo_article_1_{int(time.time())}.png'
        await page.screenshot(path=ss1, full_page=True)
        print(f'   编辑器截图: {ss1}')

        # ── Step 3: 先点击正文区激活编辑器（消除 spinner）──────────────────────
        print('🖱️  激活编辑器（点击正文区）...')
        editor = page.locator('div.ProseMirror').first
        try:
            await editor.click(force=True, timeout=5000)
        except: pass
        await page.wait_for_timeout(1500)
        # 再等 spinner 消失
        try:
            await page.wait_for_selector('.editor-spin', state='hidden', timeout=8000)
            print('   ✅ Spinner 已消失')
        except:
            print('   ⚠️  Spinner 可能仍在，继续...')
        await page.wait_for_timeout(1000)

        # ── Step 4: 用 Vue 兼容方式填入标题 ──────────────────────────────────
        print(f'✏️  填入标题: {title[:30]}...')
        # 使用 nativeInputValueSetter 触发 Vue/Naive-UI 的响应式更新
        title_set = await page.evaluate("""(t) => {
            const ta = document.querySelector('textarea[placeholder="请输入标题"]');
            if (!ta) return false;
            const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
            if (setter) setter.call(ta, t);
            else ta.value = t;
            ta.dispatchEvent(new Event('input', {bubbles: true}));
            ta.dispatchEvent(new Event('change', {bubbles: true}));
            return ta.value === t;
        }""", title)
        print(f'   标题设置: {"✅" if title_set else "⚠️ 失败"}')
        await page.wait_for_timeout(500)

        # ── Step 5: 注入正文内容到 ProseMirror ───────────────────────────────
        print('📄 注入正文内容...')
        await editor.click(force=True)
        await page.wait_for_timeout(300)

        # 方法 A：直接 innerHTML 注入（ProseMirror v5 支持）
        injected = await page.evaluate("""(html) => {
            const el = document.querySelector('div.ProseMirror');
            if (!el) return {ok: false, reason: 'editor not found'};
            el.focus();
            // 清空并注入
            document.execCommand('selectAll', false, null);
            document.execCommand('delete', false, null);
            const ok = document.execCommand('insertHTML', false, html);
            if (ok && el.innerText.trim().length > 0) return {ok: true, method: 'execCommand'};
            // 退路：直接设 innerHTML
            el.innerHTML = html;
            el.dispatchEvent(new InputEvent('input', {bubbles: true}));
            return {ok: el.innerText.trim().length > 0, method: 'innerHTML'};
        }""", html)
        print(f'   注入结果: {injected}')

        # 方法 B：如果 A 失败，用剪贴板粘贴
        if not injected.get('ok'):
            print('   方法 B：剪贴板粘贴...')
            if copy_to_clipboard(html):
                await editor.click()
                await page.keyboard.press('Control+a')
                await page.keyboard.press('Control+v')
                await page.wait_for_timeout(1000)
                print('   ✅ 剪贴板粘贴完成')
            else:
                print('   ⚠️  剪贴板不可用，跳过正文注入')

        await page.wait_for_timeout(1500)
        ss2 = f'/tmp/weibo_article_2_{int(time.time())}.png'
        await page.screenshot(path=ss2, full_page=True)
        print(f'   正文截图: {ss2}')

        # ── Step 5: 点击「下一步」→ 发布流程 ──────────────────────────────────
        print('🚀 点击「下一步」...')
        next_btn = page.locator('button:has-text("下一步")').first
        if await next_btn.count() > 0:
            await next_btn.click()
            await page.wait_for_timeout(4000)
            print(f'   URL after 下一步: {page.url}')
        else:
            print('   ⚠️  未找到「下一步」按钮')

        ss3 = f'/tmp/weibo_article_3_{int(time.time())}.png'
        await page.screenshot(path=ss3, full_page=True)
        print(f'   下一步后截图: {ss3}')

        # ── Step 6: 检测 CAPTCHA，等待人工处理 ────────────────────────────────
        # 「下一步」打开的是发布设置弹层，需要再操作一次
        # 如果触发了 CAPTCHA，等待人工滑动验证
        await page.wait_for_timeout(2000)
        if 'captcha' in page.url or 'security.weibo' in page.url:
            print('\\n🔒 检测到滑动验证码（GeeTest）！')
            print('   ⬆️  请在弹出的浏览器窗口中手动拖动滑块完成验证。')
            print('   等待最多 120 秒...')
            for _ in range(24):  # 每5秒检查一次，最多120秒
                await page.wait_for_timeout(5000)
                if 'captcha' not in page.url and 'security.weibo' not in page.url:
                    print(f'   ✅ CAPTCHA 已通过！当前 URL: {page.url}')
                    break
            else:
                print('   ⚠️  CAPTCHA 超时，未能完成验证。')
                ss_cap = f'/tmp/weibo_article_captcha_{int(time.time())}.png'
                await page.screenshot(path=ss_cap)
                print(f'   截图: {ss_cap}')
                await browser.close(); return
            await page.wait_for_timeout(2000)
        ss3b = f'/tmp/weibo_article_settings_{int(time.time())}.png'
        await page.screenshot(path=ss3b, full_page=True)
        print(f'   发布设置截图: {ss3b}')

        # 关闭标题超长警告（如果有）
        try:
            close_btns = page.locator('[class*="close"],[class*="dismiss"],.n-alert__close')
            if await close_btns.count() > 0:
                await close_btns.first.click(force=True)
                await page.wait_for_timeout(300)
        except: pass

        # 按优先级尝试发布/确认按钮
        publish_sels = [
            'button:has-text("下一步")',   # 发布设置页里的"下一步"
            'button:has-text("确定")',      # 确认按钮
            'button:has-text("发布")',
            'button:has-text("立即发布")',
            'button:has-text("发布文章")',
            'button[class*="publish"]',
        ]
        published = False
        for sel in publish_sels:
            try:
                btns = page.locator(sel)
                cnt = await btns.count()
                if cnt > 0:
                    # 取最后一个（避免点到「保存草稿」旁边的按钮）
                    btn = btns.last
                    if await btn.is_enabled():
                        print(f'🚀 点击: {sel} (共{cnt}个，点最后一个)')
                        await btn.click()
                        await page.wait_for_timeout(4000)
                        published = True
                        # 如果还有 "下一步" 再点一次（多步发布流程）
                        try:
                            next2 = page.locator('button:has-text("下一步")').last
                            if await next2.count() > 0 and await next2.is_enabled():
                                print('   再点一次「下一步」...')
                                await next2.click()
                                await page.wait_for_timeout(4000)
                        except: pass
                        break
            except: continue

        if not published:
            ss4 = f'/tmp/weibo_article_publish_btn_{int(time.time())}.png'
            await page.screenshot(path=ss4, full_page=True)
            print(f'⚠️  未找到发布按钮，请手动点击，截图: {ss4}')
            print('   等待 90 秒...')
            await page.wait_for_timeout(90000)

        # ── Step 7: 获取文章 URL ───────────────────────────────────────────────
        await page.wait_for_timeout(3000)
        final_url = page.url
        ss5 = f'/tmp/weibo_article_done_{int(time.time())}.png'
        await page.screenshot(path=ss5, full_page=True)
        print(f'\\n✅ 完成！最终 URL: {final_url}')
        print(f'   截图: {ss5}')

        # 提取文章链接
        article_links = await page.evaluate("""() => {
            const links = [...document.querySelectorAll('a')];
            return links.map(a=>a.href).filter(h=>h.includes('card.weibo.com/article')||h.includes('ttarticle')).slice(0,3);
        }""")
        if article_links:
            print(f'🔗 文章地址: {article_links[0]}')
        elif 'article' in final_url or 'show' in final_url:
            print(f'🔗 文章地址: {final_url}')

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
