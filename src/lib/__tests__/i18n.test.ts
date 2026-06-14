import {
  normalizeLocale,
  pluralize,
  pluralScans,
  formatLocalizedMonthAfterIn,
  formatCategoryLabel,
  toIntlLocale,
  setAppLocale,
} from '@/lib/i18n';

describe('normalizeLocale', () => {
  it('returns cs for Czech variants', () => {
    expect(normalizeLocale('cs')).toBe('cs');
    expect(normalizeLocale('cs-CZ')).toBe('cs');
    expect(normalizeLocale('cz')).toBe('cs');
    expect(normalizeLocale('CZ')).toBe('cs');
    expect(normalizeLocale('CS')).toBe('cs');
  });

  it('normalizes known locales', () => {
    expect(normalizeLocale('ru')).toBe('ru');
    expect(normalizeLocale('uk')).toBe('uk');
    expect(normalizeLocale('en')).toBe('en');
    expect(normalizeLocale('en-US')).toBe('en');
    expect(normalizeLocale('ru-RU')).toBe('ru');
  });

  it('falls back to cs for unknown/null/undefined', () => {
    expect(normalizeLocale(undefined)).toBe('cs');
    expect(normalizeLocale(null)).toBe('cs');
    expect(normalizeLocale('')).toBe('cs');
    expect(normalizeLocale('fr')).toBe('cs');
    expect(normalizeLocale('zh-CN')).toBe('cs');
  });
});

describe('toIntlLocale', () => {
  it('maps normalized locales to Intl tags', () => {
    expect(toIntlLocale('cs')).toBe('cs-CZ');
    expect(toIntlLocale('ru')).toBe('ru-RU');
    expect(toIntlLocale('uk')).toBe('uk-UA');
    expect(toIntlLocale('en')).toBe('en-US');
  });
});

describe('pluralize — Czech', () => {
  const forms = { one: 'skен', few: 'skeny', many: 'skenů' };

  it('uses "one" for 1', () => {
    expect(pluralize(1, forms, 'cs')).toBe('skен');
  });

  it('uses "few" for 2-4', () => {
    expect(pluralize(2, forms, 'cs')).toBe('skeny');
    expect(pluralize(3, forms, 'cs')).toBe('skeny');
    expect(pluralize(4, forms, 'cs')).toBe('skeny');
  });

  it('uses "many" for 0 and 5+', () => {
    expect(pluralize(0, forms, 'cs')).toBe('skenů');
    expect(pluralize(5, forms, 'cs')).toBe('skenů');
    expect(pluralize(20, forms, 'cs')).toBe('skenů');
    expect(pluralize(100, forms, 'cs')).toBe('skenů');
  });

  it('handles negative counts via abs', () => {
    expect(pluralize(-1, forms, 'cs')).toBe('skен');
    expect(pluralize(-3, forms, 'cs')).toBe('skeny');
  });
});

describe('pluralize — Russian', () => {
  const forms = { one: 'скан', few: 'скана', many: 'сканов' };

  it('uses "one" for 1, 21, 31', () => {
    expect(pluralize(1, forms, 'ru')).toBe('скан');
    expect(pluralize(21, forms, 'ru')).toBe('скан');
    expect(pluralize(101, forms, 'ru')).toBe('скан');
  });

  it('uses "few" for 2-4, 22-24', () => {
    expect(pluralize(2, forms, 'ru')).toBe('скана');
    expect(pluralize(3, forms, 'ru')).toBe('скана');
    expect(pluralize(4, forms, 'ru')).toBe('скана');
    expect(pluralize(22, forms, 'ru')).toBe('скана');
    expect(pluralize(24, forms, 'ru')).toBe('скана');
  });

  it('uses "many" for 0, 5-20, 11-14 exceptions', () => {
    expect(pluralize(0, forms, 'ru')).toBe('сканов');
    expect(pluralize(5, forms, 'ru')).toBe('сканов');
    expect(pluralize(11, forms, 'ru')).toBe('сканов');
    expect(pluralize(12, forms, 'ru')).toBe('сканов');
    expect(pluralize(14, forms, 'ru')).toBe('сканов');
    expect(pluralize(20, forms, 'ru')).toBe('сканов');
    expect(pluralize(111, forms, 'ru')).toBe('сканов');
  });
});

describe('pluralize — English', () => {
  const forms = { one: 'scan', many: 'scans' };

  it('uses "one" for 1 only', () => {
    expect(pluralize(1, forms, 'en')).toBe('scan');
  });

  it('uses "many" for 0 and 2+', () => {
    expect(pluralize(0, forms, 'en')).toBe('scans');
    expect(pluralize(2, forms, 'en')).toBe('scans');
    expect(pluralize(21, forms, 'en')).toBe('scans');
  });
});

describe('pluralize — falls back to "many" when "few" omitted', () => {
  const formsNoFew = { one: 'один', many: 'много' };

  it('uses many when few count would apply but few is missing', () => {
    expect(pluralize(2, formsNoFew, 'cs')).toBe('много');
    expect(pluralize(3, formsNoFew, 'ru')).toBe('много');
  });
});

describe('pluralScans', () => {
  it('returns correct Czech forms', () => {
    setAppLocale('cs');
    expect(pluralScans(1)).toBe('sken');
    expect(pluralScans(3)).toBe('skeny');
    expect(pluralScans(5)).toBe('skenů');
  });

  it('returns correct Russian forms', () => {
    expect(pluralScans(1, 'ru')).toBe('скан');
    expect(pluralScans(2, 'ru')).toBe('скана');
    expect(pluralScans(5, 'ru')).toBe('сканов');
  });
});

describe('formatLocalizedMonthAfterIn — Czech locative', () => {
  const LOCATIVE_MONTHS = [
    'lednu', 'únoru', 'březnu', 'dubnu', 'květnu', 'červnu',
    'červenci', 'srpnu', 'září', 'říjnu', 'listopadu', 'prosinci',
  ];

  it('returns Czech locative form for all 12 months', () => {
    LOCATIVE_MONTHS.forEach((expected, idx) => {
      const date = new Date(2025, idx, 15);
      expect(formatLocalizedMonthAfterIn(date, 'cs')).toBe(expected);
    });
  });

  it('returns Russian nominative month for ru locale', () => {
    const date = new Date(2025, 4, 15); // May
    const result = formatLocalizedMonthAfterIn(date, 'ru');
    // Should be a Russian nominative month name, not Czech locative
    expect(result).not.toBe('květnu');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('formatCategoryLabel', () => {
  it('falls back to t("common.document") for null/undefined', () => {
    // t is real here, will return czech translation
    const result = formatCategoryLabel(undefined, 'cs');
    expect(typeof result).toBe('string');
  });

  it('returns known category label', () => {
    // "danove" maps to known Czech label
    const result = formatCategoryLabel('danove', 'cs');
    expect(result).toBeTruthy();
    expect(result).not.toBe('danove');
  });

  it('title-cases unknown categories', () => {
    const result = formatCategoryLabel('unknown_category_foo', 'cs');
    expect(result).toBe('Unknown Category Foo');
  });

  it('normalizes dashes and spaces in category key', () => {
    // "danove-danove" or "danove danove" shouldn't break
    const result = formatCategoryLabel('random-category', 'cs');
    expect(result).toBe('Random Category');
  });
});
