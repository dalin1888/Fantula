// API client — talks to the blog-worker at api.fantula.com
const API_BASE = 'https://fantula-blog-api.jiangdalin1988.workers.dev';

export async function getPosts({ lang = '', product = '', limit = 100 } = {}) {
  const params = new URLSearchParams();
  if (lang)    params.set('lang',     lang);
  if (product) params.set('category', product);
  params.set('limit', String(limit));

  const res = await fetch(`${API_BASE}/api/posts?${params}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const data = await res.json();
  return data.posts ?? [];
}

export async function getPost(slug) {
  const res = await fetch(`${API_BASE}/api/posts/${slug}`);
  if (!res.ok) return null;
  return res.json();
}

// Helpers to pick the right language field
export function t(post, field, lang = 'zh') {
  return post[`${field}_${lang}`] || post[`${field}_zh`] || '';
}
