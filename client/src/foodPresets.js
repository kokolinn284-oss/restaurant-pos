// Food Presets Library with crisp, offline-ready vector food SVG data URIs

const svgWrap = (content, bg = '#fef3c7') =>
  `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="${encodeURIComponent(bg)}"/>${content}</svg>`;

export const FOOD_PRESETS = [
  {
    id: 'fried_rice',
    name: 'ထမင်းကြော် (Fried Rice)',
    keywords: ['ထမင်းကြော်', 'ဒံပေါက်', 'ထမင်းပေါင်း'],
    category: 'ထမင်း',
    url: svgWrap(
      `<path d="M18 52c0 18 14 32 32 32s32-14 32-32H18z" fill="%23f59e0b"/>` +
      `<ellipse cx="50" cy="52" rx="32" ry="10" fill="%23fbbf24"/>` +
      `<circle cx="42" cy="50" r="3" fill="%2310b981"/>` +
      `<circle cx="56" cy="49" r="2.5" fill="%23ef4444"/>` +
      `<circle cx="48" cy="53" r="2.5" fill="%23f97316"/>` +
      `<circle cx="62" cy="52" r="2" fill="%2310b981"/>` +
      `<path d="M28 32l40 22M32 26l38 24" stroke="%2378350f" stroke-width="3" stroke-linecap="round"/>`,
      '#fef3c7'
    )
  },
  {
    id: 'mohinga',
    name: 'မုန့်ဟင်းခါး (Mohinga)',
    keywords: ['မုန့်ဟင်းခါး', 'မုန့်တီ', 'နန်းကြီးသုပ်'],
    category: 'မုန့်/ခေါက်ဆွဲ',
    url: svgWrap(
      `<path d="M16 50c0 19 15 34 34 34s34-15 34-34H16z" fill="%23b45309"/>` +
      `<ellipse cx="50" cy="50" rx="34" ry="10" fill="%23f59e0b"/>` +
      `<path d="M26 48q8-6 16 0t16 0 16 0" fill="none" stroke="%23fef08a" stroke-width="3.5" stroke-linecap="round"/>` +
      `<circle cx="45" cy="48" r="6" fill="%23fef08a"/><circle cx="45" cy="48" r="3.5" fill="%23eab308"/>` +
      `<polygon points="62,38 72,46 64,52" fill="%23d97706"/>`,
      '#fffbeb'
    )
  },
  {
    id: 'noodles',
    name: 'ခေါက်ဆွဲ (Noodles)',
    keywords: ['ခေါက်ဆွဲ', 'ရှမ်းခေါက်ဆွဲ', 'ကြာဇံ'],
    category: 'မုန့်/ခေါက်ဆွဲ',
    url: svgWrap(
      `<path d="M16 52c0 19 15 33 34 33s34-14 34-33H16z" fill="%23dc2626"/>` +
      `<ellipse cx="50" cy="52" rx="34" ry="9" fill="%23f87171"/>` +
      `<path d="M25 49c6-8 12 6 18-2s12 6 18-2 12 5 15-1" fill="none" stroke="%23fef08a" stroke-width="4" stroke-linecap="round"/>` +
      `<circle cx="42" cy="47" r="3" fill="%2310b981"/>` +
      `<circle cx="58" cy="48" r="3" fill="%2310b981"/>` +
      `<path d="M30 20l42 32M36 15l40 32" stroke="%23451a03" stroke-width="3" stroke-linecap="round"/>`,
      '#fef2f2'
    )
  },
  {
    id: 'curry',
    name: 'ဟင်းထမင်း / ဟင်း (Curry)',
    keywords: ['ဟင်း', 'ဟင်းထမင်း', 'ကြက်သားဟင်း', 'ဝက်သားဟင်း', 'အမဲသားဟင်း'],
    category: 'ဟင်း',
    url: svgWrap(
      `<ellipse cx="50" cy="65" rx="36" ry="18" fill="%239a3412"/>` +
      `<ellipse cx="50" cy="62" rx="32" ry="14" fill="%23c2410c"/>` +
      `<circle cx="40" cy="60" r="7" fill="%237c2d12"/>` +
      `<circle cx="56" cy="58" r="8" fill="%237c2d12"/>` +
      `<circle cx="48" cy="66" r="6" fill="%23ea580c"/>` +
      `<path d="M48 42c0-8 6-12 6-16M56 44c0-6 5-10 5-14" fill="none" stroke="%23fb923c" stroke-width="2.5" stroke-linecap="round"/>`,
      '#ffedd5'
    )
  },
  {
    id: 'bbq',
    name: 'အကင် (BBQ / Grilled)',
    keywords: ['ကင်', 'ကြက်သားကင်', 'ဝက်သားကင်', 'အကင်'],
    category: 'အကင်',
    url: svgWrap(
      `<path d="M20 75l56-56" stroke="%2378350f" stroke-width="4" stroke-linecap="round"/>` +
      `<rect x="28" y="52" width="16" height="12" rx="3" fill="%23b91c1c" transform="rotate(-45 36 58)"/>` +
      `<rect x="42" y="38" width="16" height="12" rx="3" fill="%23c2410c" transform="rotate(-45 50 44)"/>` +
      `<rect x="56" y="24" width="16" height="12" rx="3" fill="%23b91c1c" transform="rotate(-45 64 30)"/>` +
      `<circle cx="72" cy="72" r="8" fill="%23ef4444" opacity="0.3"/>`,
      '#fee2e2'
    )
  },
  {
    id: 'crispy_fried',
    name: 'အကြော် (Crispy Fried)',
    keywords: ['ကြော်', 'ကြက်သားကြော်', 'ငါးကြော်', 'အကြော်'],
    category: 'အကြော်',
    url: svgWrap(
      `<path d="M30 65c-6-10 2-24 16-24 12 0 20 8 26 18 6 10-2 22-14 22-12 0-22-6-28-16z" fill="%23d97706"/>` +
      `<path d="M35 60c-4-6 2-16 11-16 8 0 14 5 18 12s-1 15-9 15c-8 0-16-5-20-11z" fill="%23f59e0b"/>` +
      `<path d="M68 68l14 12M74 65l12 12" stroke="%23fef3c7" stroke-width="4" stroke-linecap="round"/>`,
      '#fef3c7'
    )
  },
  {
    id: 'side_dish',
    name: 'အရံဟင်း (Side Dish)',
    keywords: ['ပဲပြုတ်', 'ချဉ်ပေါင်', 'အရံဟင်း', 'သုပ်', 'အသုပ်', 'ငါးပိ'],
    category: 'အရံဟင်း',
    url: svgWrap(
      `<ellipse cx="50" cy="56" rx="34" ry="18" fill="%2315803d"/>` +
      `<ellipse cx="50" cy="53" rx="30" ry="14" fill="%2322c55e"/>` +
      `<circle cx="42" cy="52" r="5" fill="%2386efac"/>` +
      `<circle cx="54" cy="50" r="5" fill="%2386efac"/>` +
      `<circle cx="48" cy="56" r="4.5" fill="%234ade80"/>` +
      `<circle cx="60" cy="55" r="3.5" fill="%23ef4444"/>`,
      '#f0fdf4'
    )
  },
  {
    id: 'cold_drink',
    name: 'အအေး / အချိုရည် (Soft Drink)',
    keywords: ['ကိုလာ', 'ကိုကာကိုလာ', 'အချိုရည်', 'ရေသန့်', 'အအေး'],
    category: 'အအေး',
    url: svgWrap(
      `<path d="M32 30l6 50h24l6-50z" fill="%230284c7"/>` +
      `<path d="M35 38l4 40h22l4-40z" fill="%2338bdf8"/>` +
      `<path d="M52 14l6 20M56 14l-2 16" stroke="%23ef4444" stroke-width="3" stroke-linecap="round"/>` +
      `<circle cx="45" cy="54" r="3" fill="%23fff" opacity="0.6"/>` +
      `<circle cx="52" cy="64" r="2.5" fill="%23fff" opacity="0.6"/>`,
      '#f0f9ff'
    )
  },
  {
    id: 'juice',
    name: 'ဖျော်ရည် (Fruit Juice)',
    keywords: ['ဖျော်ရည်', 'လိမ္မော်ရည်', 'သံပုရာရည်', 'သစ်သီး'],
    category: 'အအေး',
    url: svgWrap(
      `<path d="M30 32l7 48h26l7-48z" fill="%23ea580c"/>` +
      `<path d="M33 40l5 38h24l5-38z" fill="%23f97316"/>` +
      `<circle cx="68" cy="30" r="14" fill="%23facc15"/>` +
      `<circle cx="68" cy="30" r="11" fill="%23fef08a"/>` +
      `<path d="M48 16l8 24" stroke="%2310b981" stroke-width="3.5" stroke-linecap="round"/>`,
      '#fff7ed'
    )
  },
  {
    id: 'tea',
    name: 'လဖက်ရည် (Tea)',
    keywords: ['လဖက်ရည်', 'လက်ဖက်ရည်', 'နို့လဖက်ရည်', 'ရေနွေးကြမ်း'],
    category: 'အပူ',
    url: svgWrap(
      `<ellipse cx="50" cy="74" rx="30" ry="8" fill="%23cbd5e1"/>` +
      `<path d="M28 42h44v18c0 10-8 18-18 18s-18-8-18-18V42z" fill="%23d97706"/>` +
      `<path d="M72 48h8a6 6 0 0 1 0 12h-8" fill="none" stroke="%23d97706" stroke-width="4"/>` +
      `<path d="M42 32c0-6 4-8 4-12M52 32c0-6 4-8 4-12" fill="none" stroke="%23b45309" stroke-width="2.5" stroke-linecap="round"/>`,
      '#fffbeb'
    )
  },
  {
    id: 'coffee',
    name: 'ကော်ဖီ (Coffee)',
    keywords: ['ကော်ဖီ', 'coffee', 'espresso', 'latte'],
    category: 'အပူ',
    url: svgWrap(
      `<ellipse cx="50" cy="74" rx="30" ry="8" fill="%23cbd5e1"/>` +
      `<path d="M28 42h44v18c0 10-8 18-18 18s-18-8-18-18V42z" fill="%23451a03"/>` +
      `<ellipse cx="50" cy="44" rx="20" ry="4" fill="%2378350f"/>` +
      `<path d="M72 48h8a6 6 0 0 1 0 12h-8" fill="none" stroke="%23451a03" stroke-width="4"/>` +
      `<path d="M44 32c0-5 3-7 3-11M54 32c0-5 3-7 3-11" fill="none" stroke="%23a16207" stroke-width="2" stroke-linecap="round"/>`,
      '#fefce8'
    )
  },
  {
    id: 'beer',
    name: 'ဘီယာ (Beer)',
    keywords: ['ဘီယာ', 'beer', 'ဒရပ်ဘီယာ', 'draft'],
    category: 'ဘား/အရက်',
    url: svgWrap(
      `<path d="M30 36h34v42c0 4-4 8-8 8H38c-4 0-8-4-8-8V36z" fill="%23eab308"/>` +
      `<path d="M64 44h10a6 6 0 0 1 0 14H64" fill="none" stroke="%23ca8a04" stroke-width="5"/>` +
      `<ellipse cx="47" cy="36" rx="20" ry="7" fill="%23fff"/>` +
      `<circle cx="34" cy="33" r="6" fill="%23fff"/>` +
      `<circle cx="46" cy="31" r="7" fill="%23fff"/>` +
      `<circle cx="58" cy="33" r="6" fill="%23fff"/>` +
      `<path d="M36 46v24M44 46v24M52 46v24" stroke="%23ca8a04" stroke-width="2.5" stroke-linecap="round"/>`,
      '#fef9c3'
    )
  },
  {
    id: 'liquor',
    name: 'ဝီစကီ / အရက် (Liquor)',
    keywords: ['ဝီစကီ', 'ရမ်', 'ဂျင်း', 'အရက်', 'whisky', 'rum', 'gin'],
    category: 'ဘား/အရက်',
    url: svgWrap(
      `<path d="M44 20h12v12h-12z" fill="%23b45309"/>` +
      `<path d="M34 32h32l4 10v40H30V42z" fill="%23d97706"/>` +
      `<rect x="36" y="48" width="28" height="22" rx="2" fill="%23fef3c7"/>` +
      `<line x1="40" y1="56" x2="60" y2="56" stroke="%2378350f" stroke-width="2"/>` +
      `<line x1="42" y1="62" x2="58" y2="62" stroke="%2378350f" stroke-width="1.5"/>`,
      '#fffbeb'
    )
  },
  {
    id: 'dessert',
    name: 'အချိုပွဲ (Dessert)',
    keywords: ['အချိုပွဲ', 'ရေခဲမုန့်', 'ဖာလူဒါ', 'ကိတ်', 'သရေစာ'],
    category: 'အချိုပွဲ',
    url: svgWrap(
      `<path d="M26 50h48l-8 28H34z" fill="%23ec4899"/>` +
      `<circle cx="38" cy="44" r="12" fill="%23f472b6"/>` +
      `<circle cx="50" cy="38" r="13" fill="%23fbbf24"/>` +
      `<circle cx="62" cy="44" r="12" fill="%2360a5fa"/>` +
      `<circle cx="50" cy="24" r="5" fill="%23ef4444"/>`,
      '#fdf2f8'
    )
  }
];

export function getFoodImage(item, categoryName = '') {
  if (item?.image) return item.image;
  const name = String(item?.name || '').toLowerCase();
  const cat = String(categoryName || '').toLowerCase();

  // Try matching keywords in name
  for (const p of FOOD_PRESETS) {
    if (p.keywords.some(k => name.includes(k.toLowerCase()))) return p.url;
  }
  // Try matching category
  for (const p of FOOD_PRESETS) {
    if (p.keywords.some(k => cat.includes(k.toLowerCase()))) return p.url;
  }

  // Category fallback
  if (cat.includes('ထမင်း')) return FOOD_PRESETS[0].url;
  if (cat.includes('ခေါက်ဆွဲ') || cat.includes('မုန့်')) return FOOD_PRESETS[1].url;
  if (cat.includes('အကင်')) return FOOD_PRESETS[4].url;
  if (cat.includes('အကြော်')) return FOOD_PRESETS[5].url;
  if (cat.includes('ဟင်း')) return FOOD_PRESETS[3].url;
  if (cat.includes('အအေး') || cat.includes('ဖျော်ရည်')) return FOOD_PRESETS[7].url;
  if (cat.includes('လက်ဖက်ရည်') || cat.includes('ကော်ဖီ')) return FOOD_PRESETS[9].url;
  if (cat.includes('ဘီယာ') || cat.includes('အရက်') || item?.is_alcohol) return FOOD_PRESETS[11].url;

  return FOOD_PRESETS[0].url;
}
