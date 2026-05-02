export const PRODUCTS = [
  {
    slug: 'youtube-premium',
    kicker: '01',
    name: { zh: 'YouTube Premium', en: 'YouTube Premium', ja: 'YouTube Premium' },
    tagline: {
      zh: '家庭组拼车 · 跨区低价',
      en: 'Family-plan share · Region pricing',
      ja: 'ファミリー共有・地域価格',
    },
  },
  {
    slug: 'spotify',
    kicker: '02',
    name: { zh: 'Spotify Premium', en: 'Spotify Premium', ja: 'Spotify Premium' },
    tagline: {
      zh: '个人号升级 · 家族プラン',
      en: 'Individual upgrade · Family plan',
      ja: '個人アップグレード・家族プラン',
    },
  },
  {
    slug: 'channel-membership',
    kicker: '03',
    name: { zh: 'YouTube 频道会员', en: 'Channel Membership', ja: 'メンバーシップ代行' },
    tagline: {
      zh: 'Vtuber 应援 · 会限直播',
      en: 'Vtuber support · Member-only streams',
      ja: '推し活・メン限ライブ',
    },
  },
];

export const KIND_LABEL = {
  all: '全部', tutorial: '教程', guide: '攻略',
  comparison: '对比', warning: '避坑', 'fan-culture': '粉丝向', 'deep-dive': '深度',
};

export const LANGS = ['zh', 'en', 'ja'];

export const I18N = {
  zh: {
    navHome: '首页', back: '返回主站 ↗',
    sectionLines: '三条产品线', sectionFeatured: '本期精选', sectionLatest: '更多文章',
    readMore: '继续阅读', minRead: '分钟阅读',
    relatedTitle: '相关阅读', crumbHome: '首页',
    filterAll: '全部', articles: '篇文章', sections: '个栏目', updated: '更新于',
    footerAbout: '关于', footerProduct: '产品线', footerLegal: '条款',
    footerBlurb: 'Fantula 凡图拉 · 流媒体会员代充平台。覆盖 YouTube Premium、Spotify、频道会员三大产品线。',
  },
  en: {
    navHome: 'Home', back: 'Back to shop ↗',
    sectionLines: 'Product Lines', sectionFeatured: "Editor's Picks", sectionLatest: 'More Articles',
    readMore: 'Read more', minRead: 'min read',
    relatedTitle: 'Related Reading', crumbHome: 'Home',
    filterAll: 'All', articles: 'articles', sections: 'sections', updated: 'Updated',
    footerAbout: 'About', footerProduct: 'Lines', footerLegal: 'Legal',
    footerBlurb: 'Fantula — streaming-membership top-up platform. YouTube Premium, Spotify, Channel Membership.',
  },
  ja: {
    navHome: 'ホーム', back: 'ストアへ戻る ↗',
    sectionLines: '製品ライン', sectionFeatured: '編集部おすすめ', sectionLatest: '最新記事',
    readMore: '続きを読む', minRead: '分で読了',
    relatedTitle: '関連記事', crumbHome: 'ホーム',
    filterAll: 'すべて', articles: '記事', sections: 'セクション', updated: '更新',
    footerAbout: '私たち', footerProduct: 'ライン', footerLegal: '規約',
    footerBlurb: 'Fantula — ストリーミング会員代行プラットフォーム。YouTube Premium・Spotify・メンバーシップ。',
  },
};

export function dateFmt(dateStr, lang) {
  return new Intl.DateTimeFormat(
    lang === 'ja' ? 'ja-JP' : lang === 'en' ? 'en-US' : 'zh-CN',
    { year: 'numeric', month: 'long', day: 'numeric' }
  ).format(new Date(dateStr));
}
