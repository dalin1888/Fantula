#!/usr/bin/env node
/**
 * 知乎专栏文章发布工具 — 凡图拉宣传
 *
 * 用法:
 *   node zhihu_publish.mjs "文章标题" article.html
 *   node zhihu_publish.mjs "文章标题" article.md   (自动转 HTML)
 *
 * 依赖:
 *   - Chrome 白色浪漫 Profile 3 需要开着，且 Browser Bridge 已连接
 *   - 知乎已在白色浪漫 Chrome 里登录（需要 z_c0 cookie）
 *
 * 原理:
 *   1. Browser Bridge 读取知乎 cookies（z_c0 + XSRF-TOKEN）
 *   2. POST /api/articles/drafts       创建草稿
 *   3. PATCH /api/articles/{id}/draft  写入标题和内容（注意路径带 /draft）
 *   4. PUT  /api/articles/{id}/publish 发布
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as https from 'node:https';
import * as http from 'node:http';
import { execSync } from 'node:child_process';

// ─── 动态加载 Browser Bridge（兼容任意安装位置）────────────────────────────
const _globalRoot = execSync('npm root -g').toString().trim();
const { sendCommand } = await import(
  path.join(_globalRoot, '@jackwener/opencli/dist/src/browser/daemon-client.js')
);

// ─── 参数解析 ──────────────────────────────────────────────────────────────
// 用法: node zhihu_publish.mjs "标题" article.md [topicId1,topicId2,...]
const [,, title, contentFile, topicsArg] = process.argv;
if (!title || !contentFile) {
  console.error('用法: node zhihu_publish.mjs "文章标题" article.html [话题ID1,话题ID2]');
  console.error('      node zhihu_publish.mjs "文章标题" article.md');
  console.error('      node zhihu_publish.mjs "文章标题" article.md 19571443,19549475');
  process.exit(1);
}

// 解析话题 ID 列表（可选）
const topicIds = topicsArg
  ? topicsArg.split(',').map(s => s.trim()).filter(Boolean)
  : [];

const filePath = path.resolve(contentFile);
if (!fs.existsSync(filePath)) {
  console.error(`❌ 文件不存在: ${filePath}`);
  process.exit(1);
}

// ─── 知乎图片上传 ──────────────────────────────────────────────────────────────
function guessMime(filename) {
  const ext = path.extname(filename).toLowerCase();
  return { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
           '.gif': 'image/gif',  '.webp': 'image/webp' }[ext] || 'image/jpeg';
}

async function fetchImageBuffer(src) {
  if (!src.startsWith('http')) {
    const buf = fs.readFileSync(src);
    return { buffer: buf, filename: path.basename(src) };
  }
  return new Promise((resolve, reject) => {
    const mod = src.startsWith('https://') ? https : http;
    mod.get(src, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve(fetchImageBuffer(res.headers.location));
        return;
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

async function uploadImageToZhihu(src, cookieStr, xsrfToken) {
  const { buffer, filename } = await fetchImageBuffer(src);
  const mime     = guessMime(filename);
  const boundary = 'FantulaBoundary' + Date.now().toString(16);

  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`),
    buffer,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'zhuanlan.zhihu.com',
      path:     '/api/articles/image',
      method:   'POST',
      headers: {
        'Cookie':        cookieStr,
        'x-xsrftoken':  xsrfToken,
        'Origin':        'https://zhuanlan.zhihu.com',
        'Referer':       'https://zhuanlan.zhihu.com/',
        'User-Agent':    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Content-Type':  `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const url = json.src || json.url || json.original;
          if (url) resolve(url);
          else reject(new Error(`知乎图片上传失败 (${res.statusCode}): ${data.slice(0, 200)}`));
        } catch {
          reject(new Error(`知乎图片上传响应解析失败 (${res.statusCode}): ${data.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * 扫描 Markdown 中的图片引用，逐一上传到知乎图床，返回替换后的 Markdown。
 * 本地路径相对于 baseDir 解析。
 */
async function uploadImagesInMd(md, baseDir, cookieStr, xsrfToken) {
  const imgRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const tasks = [];
  let m;
  while ((m = imgRegex.exec(md)) !== null) {
    const [full, alt, src] = m;
    const resolved = src.startsWith('http') ? src : path.resolve(baseDir, src);
    tasks.push({ full, alt, resolved, origSrc: src });
  }
  if (tasks.length === 0) return md;

  console.log(`🖼  上传 ${tasks.length} 张图片到知乎图床...`);
  let result = md;
  for (const t of tasks) {
    try {
      const zhihuUrl = await uploadImageToZhihu(t.resolved, cookieStr, xsrfToken);
      console.log(`  ✅ ${t.origSrc.slice(-40)} → ${zhihuUrl}`);
      result = result.replace(t.full, `![${t.alt}](${zhihuUrl})`);
    } catch (e) {
      console.warn(`  ⚠️  ${t.origSrc} 上传失败: ${e.message}，此图跳过`);
      result = result.replace(t.full, `（图片：${t.alt || t.origSrc}）`);
    }
  }
  return result;
}

// ─── Markdown → HTML 转换 ──────────────────────────────────────────────────
function mdToHtml(md) {
  // 将已上传的 http 图片转为 <img> 标签，忽略剩余本地路径（保险起见）
  let text = md
    .replace(/!\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g, '<img src="$2" alt="$1"><br>')
    .replace(/!\[.*?\]\((?!http)[^)]*\)/g, '');
  // 去掉 frontmatter（--- 之间的 YAML）
  text = text.replace(/^---[\s\S]*?---\n?/, '');

  // 转换 Markdown 表格 → HTML table
  text = text.replace(/((\|.+\|\n)+)/gm, tableBlock => {
    const rows = tableBlock.trim().split('\n').filter(r => !/^\|[-:| ]+\|$/.test(r));
    const html = rows.map((row, i) => {
      const cells = row.split('|').slice(1, -1).map(c => c.trim());
      const tag = i === 0 ? 'th' : 'td';
      return `<tr>${cells.map(c => `<${tag}>${c}</${tag}>`).join('')}</tr>`;
    }).join('');
    return `<table border="1" style="border-collapse:collapse;width:100%;margin:16px 0">${html}</table>\n\n`;
  });

  // 转换块级元素
  text = text
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^> (.+)$/gm, '<blockquote><p>$1</p></blockquote>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]*?<\/li>\n?)+/g, s => `<ul>${s}</ul>`)
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  // 转换内联元素
  text = text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');

  // 将剩余段落用 <p> 包裹
  const blocks = text.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
  const result = blocks.map(p => {
    if (/^<(h[1-6]|ul|ol|blockquote|table|li)/.test(p)) return p;
    return `<p>${p.replace(/\n/g, '<br>')}</p>`;
  }).join('\n');

  return result;
}

let content = fs.readFileSync(filePath, 'utf8');
const ext     = path.extname(filePath).toLowerCase();
const fileDir = path.dirname(filePath);
// htmlContent 将在 cookies 加载后处理（需要 cookies 来上传图片）

// ─── HTTP 请求封装 ─────────────────────────────────────────────────────────
function request(method, urlStr, headers, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: { ...headers, 'Content-Type': 'application/json' },
    };
    if (body) {
      const bodyStr = JSON.stringify(body);
      options.headers['Content-Length'] = Buffer.byteLength(bodyStr);
    }
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ─── 主流程 ────────────────────────────────────────────────────────────────
console.log('🔑 读取 Browser Bridge cookies...');
let cookies, xsrfToken, cookieStr;
try {
  cookies = await sendCommand('cookies', { url: 'https://www.zhihu.com' });
  const z_c0 = cookies.find(c => c.name === 'z_c0');
  if (!z_c0) {
    console.error('❌ 未找到 z_c0 cookie，请先在白色浪漫 Chrome 里登录知乎');
    process.exit(1);
  }
  xsrfToken = cookies.find(c => c.name === '_xsrf')?.value || '';
  cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
  console.log('✅ 知乎 cookies 读取成功');
} catch (e) {
  console.error('❌ Browser Bridge 连接失败，请确认 Chrome 白色浪漫已开且扩展已连接');
  process.exit(1);
}

// ─── 图片上传 + HTML 转换（在 cookies 就绪后进行）───────────────────────────
let htmlContent;
if (ext === '.md') {
  const processedMd = await uploadImagesInMd(content, fileDir, cookieStr, xsrfToken);
  htmlContent = mdToHtml(processedMd);
} else {
  htmlContent = content;
}

const baseHeaders = {
  'Cookie': cookieStr,
  'x-xsrftoken': xsrfToken,
  'Origin': 'https://zhuanlan.zhihu.com',
  'Referer': 'https://zhuanlan.zhihu.com/',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
};

// Step 1: 创建草稿
console.log('📝 创建草稿...');
const draftRes = await request(
  'POST',
  'https://zhuanlan.zhihu.com/api/articles/drafts',
  baseHeaders,
  {}
);
if (draftRes.status !== 200 && draftRes.status !== 201) {
  console.error(`❌ 创建草稿失败 (${draftRes.status}):`, JSON.stringify(draftRes.body));
  process.exit(1);
}
const draftId = draftRes.body.id;
console.log(`✅ 草稿创建成功，ID: ${draftId}`);

// Step 2: 写入标题、内容和话题
console.log('✏️  写入文章内容...');
const draftBody = { title, content: htmlContent };
if (topicIds.length > 0) {
  draftBody.topics = topicIds.map(id => ({ id, type: 'topic' }));
  console.log(`   话题 ID: ${topicIds.join(', ')}`);
}
const updateRes = await request(
  'PATCH',
  `https://zhuanlan.zhihu.com/api/articles/${draftId}/draft`,
  baseHeaders,
  draftBody
);
if (updateRes.status !== 200) {
  console.error(`❌ 写入内容失败 (${updateRes.status}):`, JSON.stringify(updateRes.body));
  process.exit(1);
}
console.log('✅ 内容写入成功');

// Step 3: 发布
console.log('🚀 发布文章...');
const publishRes = await request(
  'PUT',
  `https://zhuanlan.zhihu.com/api/articles/${draftId}/publish`,
  baseHeaders,
  {}
);
if (publishRes.status !== 200 && publishRes.status !== 201) {
  console.error(`❌ 发布失败 (${publishRes.status}):`, JSON.stringify(publishRes.body));
  process.exit(1);
}

const articleUrl = publishRes.body.url || `https://zhuanlan.zhihu.com/p/${draftId}`;
console.log('\n✅ 发布成功！');
console.log(`📍 知乎文章地址：${articleUrl}`);
