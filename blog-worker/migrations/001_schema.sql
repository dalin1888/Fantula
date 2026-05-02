-- Drop and recreate everything clean
DROP TABLE IF EXISTS posts;
DROP TABLE IF EXISTS categories;

CREATE TABLE categories (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  slug  TEXT UNIQUE NOT NULL,
  name_zh TEXT NOT NULL,
  name_en TEXT NOT NULL,
  name_ja TEXT NOT NULL
);

INSERT INTO categories (slug, name_zh, name_en, name_ja) VALUES
  ('youtube-premium', 'YouTube Premium', 'YouTube Premium', 'YouTube Premium'),
  ('spotify',         'Spotify Premium', 'Spotify Premium', 'Spotify Premium'),
  ('channel-membership', 'YouTube 频道会员', 'Channel Membership', 'メンバーシップ代行');

CREATE TABLE posts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  slug         TEXT UNIQUE NOT NULL,
  product      TEXT NOT NULL DEFAULT 'youtube-premium',
  kind         TEXT NOT NULL DEFAULT 'tutorial',
  featured     INTEGER NOT NULL DEFAULT 0,

  title_zh     TEXT NOT NULL DEFAULT '',
  title_en     TEXT NOT NULL DEFAULT '',
  title_ja     TEXT NOT NULL DEFAULT '',

  excerpt_zh   TEXT NOT NULL DEFAULT '',
  excerpt_en   TEXT NOT NULL DEFAULT '',
  excerpt_ja   TEXT NOT NULL DEFAULT '',

  content_zh   TEXT NOT NULL DEFAULT '',
  content_en   TEXT NOT NULL DEFAULT '',
  content_ja   TEXT NOT NULL DEFAULT '',

  author_name  TEXT NOT NULL DEFAULT '',
  author_role  TEXT NOT NULL DEFAULT '',
  author_avatar TEXT NOT NULL DEFAULT '',

  tags_zh      TEXT NOT NULL DEFAULT '[]',
  keywords     TEXT NOT NULL DEFAULT '',
  cover_hue    INTEGER NOT NULL DEFAULT 218,
  cover_label  TEXT NOT NULL DEFAULT '',

  reading_time INTEGER NOT NULL DEFAULT 5,
  published    INTEGER NOT NULL DEFAULT 1,
  views        INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT
);

CREATE INDEX idx_posts_product   ON posts(product);
CREATE INDEX idx_posts_published ON posts(published);
CREATE INDEX idx_posts_created   ON posts(created_at DESC);
