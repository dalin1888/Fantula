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

// Columns returned in list (no content body to keep payload small)
const LIST_COLS = `id, slug, product, kind, featured, reading_time,
  title_zh, title_en, title_ja,
  excerpt_zh, excerpt_en, excerpt_ja,
  author_name, author_role, author_avatar,
  tags_zh, keywords, cover_hue, cover_label,
  views, created_at, updated_at`;

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '*';
    const url    = new URL(request.url);
    const path   = url.pathname;
    const method = request.method;

    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS(origin) });
    }

    try {
      // ── GET /images/:key ──────────────────────────────────────
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

      // ── GET /api/posts ────────────────────────────────────────
      if (method === 'GET' && path === '/api/posts') {
        const product = url.searchParams.get('category') || url.searchParams.get('product') || '';
        const slug    = url.searchParams.get('slug')    || '';
        const page    = parseInt(url.searchParams.get('page')  || '1');
        const limit   = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
        const offset  = (page - 1) * limit;

        let where = 'WHERE published = 1';
        const params = [];
        if (product) { where += ' AND product = ?'; params.push(product); }
        if (slug)    { where += ' AND slug = ?';    params.push(slug); }

        const posts = await env.DB.prepare(
          `SELECT ${LIST_COLS} FROM posts ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
        ).bind(...params, limit, offset).all();

        const total = await env.DB.prepare(
          `SELECT COUNT(*) as count FROM posts ${where}`
        ).bind(...params).first();

        return json({ posts: posts.results, total: total.count, page, limit }, 200, origin);
      }

      // ── GET /api/posts/:slug ──────────────────────────────────
      if (method === 'GET' && path.startsWith('/api/posts/')) {
        const param = decodeURIComponent(path.replace('/api/posts/', ''));
        let post;
        if (/^\d+$/.test(param)) {
          post = await env.DB.prepare('SELECT * FROM posts WHERE id = ? AND published = 1')
            .bind(parseInt(param)).first();
        } else {
          post = await env.DB.prepare('SELECT * FROM posts WHERE slug = ? AND published = 1')
            .bind(param).first();
        }
        if (!post) return json({ error: 'Not found' }, 404, origin);
        await env.DB.prepare('UPDATE posts SET views = views + 1 WHERE id = ?').bind(post.id).run();
        return json(post, 200, origin);
      }

      // ── GET /api/categories ───────────────────────────────────
      if (method === 'GET' && path === '/api/categories') {
        const cats = await env.DB.prepare('SELECT * FROM categories ORDER BY id ASC').all();
        return json(cats.results, 200, origin);
      }

      // ── Auth guard ────────────────────────────────────────────
      if (['POST', 'PUT', 'DELETE'].includes(method) && !isAuthed(request, env)) {
        return json({ error: 'Unauthorized' }, 401, origin);
      }

      // ── POST /api/posts ───────────────────────────────────────
      if (method === 'POST' && path === '/api/posts') {
        const b = await request.json();
        if (!b.slug || !(b.title_zh || b.title)) {
          return json({ error: 'slug and title_zh required' }, 400, origin);
        }
        const isPublished = typeof b.published !== 'undefined'
          ? (b.published ? 1 : 0)
          : (b.status === 'published' ? 1 : 0);

        const result = await env.DB.prepare(`
          INSERT INTO posts (
            slug, product, kind, featured, reading_time,
            title_zh, title_en, title_ja,
            excerpt_zh, excerpt_en, excerpt_ja,
            content_zh, content_en, content_ja,
            author_name, author_role, author_avatar,
            tags_zh, keywords, cover_hue, cover_label, published
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `).bind(
          b.slug,
          b.product || 'youtube-premium',
          b.kind    || 'tutorial',
          b.featured ? 1 : 0,
          b.reading_time || 5,
          b.title_zh || b.title || '',
          b.title_en || b.title || '',
          b.title_ja || b.title || '',
          b.excerpt_zh || b.excerpt || '',
          b.excerpt_en || b.excerpt || '',
          b.excerpt_ja || b.excerpt || '',
          b.content_zh || b.content || '',
          b.content_en || b.content || '',
          b.content_ja || b.content || '',
          b.author_name || b.author || '',
          b.author_role || '',
          b.author_avatar || '',
          JSON.stringify(b.tags_zh || b.tags || []),
          b.keywords || '',
          b.cover_hue || 218,
          b.cover_label || '',
          isPublished
        ).run();

        return json({ success: true, id: result.meta.last_row_id }, 201, origin);
      }

      // ── PUT /api/posts/:id ────────────────────────────────────
      if (method === 'PUT' && path.startsWith('/api/posts/')) {
        const id = path.replace('/api/posts/', '');
        const b = await request.json();
        await env.DB.prepare(`
          UPDATE posts SET
            product=?, kind=?, featured=?, reading_time=?,
            title_zh=?, title_en=?, title_ja=?,
            excerpt_zh=?, excerpt_en=?, excerpt_ja=?,
            content_zh=?, content_en=?, content_ja=?,
            author_name=?, author_role=?,
            tags_zh=?, keywords=?, published=?,
            updated_at=datetime('now')
          WHERE id=?
        `).bind(
          b.product || 'youtube-premium',
          b.kind    || 'tutorial',
          b.featured ? 1 : 0,
          b.reading_time || 5,
          b.title_zh || '', b.title_en || '', b.title_ja || '',
          b.excerpt_zh || '', b.excerpt_en || '', b.excerpt_ja || '',
          b.content_zh || '', b.content_en || '', b.content_ja || '',
          b.author_name || '', b.author_role || '',
          JSON.stringify(b.tags_zh || []),
          b.keywords || '',
          b.published ? 1 : 0,
          id
        ).run();
        return json({ success: true }, 200, origin);
      }

      // ── DELETE /api/posts/:id ─────────────────────────────────
      if (method === 'DELETE' && path.startsWith('/api/posts/')) {
        const id = path.replace('/api/posts/', '');
        await env.DB.prepare('DELETE FROM posts WHERE id = ?').bind(id).run();
        return json({ success: true }, 200, origin);
      }

      // ── POST /api/upload ──────────────────────────────────────
      if (method === 'POST' && path === '/api/upload') {
        const formData = await request.formData();
        const file = formData.get('file');
        if (!file) return json({ error: 'no file' }, 400, origin);
        const ext = file.name.split('.').pop();
        const key = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        await env.IMAGES.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
        const host = new URL(request.url).hostname;
        return json({ url: `https://${host}/images/${key}` }, 201, origin);
      }

      // ── GET /api/admin/posts ──────────────────────────────────
      if (method === 'GET' && path === '/api/admin/posts') {
        if (!isAuthed(request, env)) return json({ error: 'Unauthorized' }, 401, origin);
        const posts = await env.DB.prepare(
          `SELECT ${LIST_COLS}, published FROM posts ORDER BY created_at DESC`
        ).all();
        return json(posts.results, 200, origin);
      }

      return json({ error: 'Not found' }, 404, origin);

    } catch (err) {
      return json({ error: err.message }, 500, origin);
    }
  },
};
