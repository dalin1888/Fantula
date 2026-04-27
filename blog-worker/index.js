const CORS_HEADERS = (origin) => ({
  'Access-Control-Allow-Origin': origin || '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Secret',
  'Access-Control-Max-Age': '86400',
});

function json(data, status = 200, origin = '*') {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS(origin) },
  });
}

function isAuthed(request, env) {
  return request.headers.get('X-API-Secret') === env.API_SECRET;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '*';
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS(origin) });
    }

    try {
      // ─── 公开接口 ───────────────────────────────────────────

      // GET /images/:key — 从 R2 提供图片
      if (method === 'GET' && path.startsWith('/images/')) {
        const key = decodeURIComponent(path.replace('/images/', ''));
        const object = await env.IMAGES.get(key);
        if (!object) return new Response('Not found', { status: 404 });
        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set('etag', object.httpEtag);
        headers.set('Cache-Control', 'public, max-age=31536000');
        return new Response(object.body, { headers });
      }

      // GET /api/posts — 获取文章列表
      if (method === 'GET' && path === '/api/posts') {
        const lang     = url.searchParams.get('lang')     || '';
        const category = url.searchParams.get('category') || '';
        const slug     = url.searchParams.get('slug')     || '';
        const page  = parseInt(url.searchParams.get('page')  || '1');
        const limit = parseInt(url.searchParams.get('limit') || '10');
        const offset = (page - 1) * limit;

        let where = 'WHERE published = 1';
        const params = [];
        if (lang)     { where += ' AND lang = ?';     params.push(lang); }
        if (category) { where += ' AND category = ?'; params.push(category); }
        if (slug)     { where += ' AND slug = ?';     params.push(slug); }

        const posts = await env.DB.prepare(
          `SELECT id, title, slug, excerpt, cover_image, lang, category, tags, views, created_at
           FROM posts ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
        ).bind(...params, limit, offset).all();

        const total = await env.DB.prepare(
          `SELECT COUNT(*) as count FROM posts ${where}`
        ).bind(...params).first();

        return json({ posts: posts.results, total: total.count, page, limit }, 200, origin);
      }

      // GET /api/posts/:id_or_slug — 获取单篇文章（支持数字ID和slug两种方式）
      if (method === 'GET' && path.startsWith('/api/posts/')) {
        const param = decodeURIComponent(path.replace('/api/posts/', ''));
        let post;
        if (/^\d+$/.test(param)) {
          post = await env.DB.prepare(
            'SELECT * FROM posts WHERE id = ? AND published = 1'
          ).bind(parseInt(param)).first();
        } else {
          post = await env.DB.prepare(
            'SELECT * FROM posts WHERE slug = ? AND published = 1'
          ).bind(param).first();
        }

        if (!post) return json({ error: 'Not found' }, 404, origin);

        // 更新浏览量
        await env.DB.prepare('UPDATE posts SET views = views + 1 WHERE id = ?').bind(post.id).run();

        return json(post, 200, origin);
      }

      // GET /api/categories — 获取分类列表
      if (method === 'GET' && path === '/api/categories') {
        const cats = await env.DB.prepare('SELECT * FROM categories ORDER BY id ASC').all();
        return json(cats.results, 200, origin);
      }

      // ─── 需要鉴权的接口 ──────────────────────────────────────

      if (!isAuthed(request, env)) {
        // 未授权但不是公开接口
        if (['POST', 'PUT', 'DELETE'].includes(method)) {
          return json({ error: 'Unauthorized' }, 401, origin);
        }
      }

      // POST /api/posts — 发布新文章
      if (method === 'POST' && path === '/api/posts') {
        if (!isAuthed(request, env)) return json({ error: 'Unauthorized' }, 401, origin);
        const body = await request.json();
        const { title, slug, content, excerpt, cover_image, lang, category, tags, published, status } = body;

        if (!title || !slug || !content) {
          return json({ error: 'title, slug, content 为必填项' }, 400, origin);
        }

        // 兼容 published 布尔值 和 status 字符串两种方式
        const isPublished = (typeof published !== 'undefined')
          ? (published ? 1 : 0)
          : (status === 'published' ? 1 : 0);

        const result = await env.DB.prepare(
          `INSERT INTO posts (title, slug, content, excerpt, cover_image, lang, category, tags, published)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          title, slug, content,
          excerpt || '',
          cover_image || '',
          lang || 'zh',
          category || 'general',
          JSON.stringify(tags || []),
          isPublished
        ).run();

        return json({ success: true, id: result.meta.last_row_id }, 201, origin);
      }

      // PUT /api/posts/:id — 更新文章
      if (method === 'PUT' && path.startsWith('/api/posts/')) {
        if (!isAuthed(request, env)) return json({ error: 'Unauthorized' }, 401, origin);
        const id = path.replace('/api/posts/', '');
        const body = await request.json();
        const { title, content, excerpt, cover_image, lang, category, tags, published } = body;

        await env.DB.prepare(
          `UPDATE posts SET title=?, content=?, excerpt=?, cover_image=?, lang=?, category=?, tags=?, published=?, updated_at=datetime('now')
           WHERE id=?`
        ).bind(
          title, content, excerpt || '', cover_image || '',
          lang || 'zh', category || 'general',
          JSON.stringify(tags || []),
          published ? 1 : 0, id
        ).run();

        return json({ success: true }, 200, origin);
      }

      // DELETE /api/posts/:id — 删除文章
      if (method === 'DELETE' && path.startsWith('/api/posts/')) {
        if (!isAuthed(request, env)) return json({ error: 'Unauthorized' }, 401, origin);
        const id = path.replace('/api/posts/', '');
        await env.DB.prepare('DELETE FROM posts WHERE id = ?').bind(id).run();
        return json({ success: true }, 200, origin);
      }

      // POST /api/upload — 上传图片到 R2
      if (method === 'POST' && path === '/api/upload') {
        if (!isAuthed(request, env)) return json({ error: 'Unauthorized' }, 401, origin);
        const formData = await request.formData();
        const file = formData.get('file');
        if (!file) return json({ error: '没有文件' }, 400, origin);

        const ext = file.name.split('.').pop();
        const key = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        await env.IMAGES.put(key, file.stream(), {
          httpMetadata: { contentType: file.type },
        });

        // 返回完整 URL（Worker 自身的 /images/:key 路由来服务图片）
        const host = request.headers.get('Host') || 'fantula-blog-api.jiangdalin1988.workers.dev';
        return json({ url: `https://${host}/images/${key}` }, 201, origin);
      }

      // GET /api/admin/posts — 管理后台获取所有文章（含未发布）
      if (method === 'GET' && path === '/api/admin/posts') {
        if (!isAuthed(request, env)) return json({ error: 'Unauthorized' }, 401, origin);
        const posts = await env.DB.prepare(
          'SELECT id, title, slug, lang, category, published, views, created_at FROM posts ORDER BY created_at DESC'
        ).all();
        return json(posts.results, 200, origin);
      }

      return json({ error: 'Not found' }, 404, origin);

    } catch (err) {
      return json({ error: err.message }, 500, origin);
    }
  },
};