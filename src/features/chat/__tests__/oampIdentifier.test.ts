import { extractOampIdentifier, normalizeOampIdentifier } from '@/features/chat/oampIdentifier';

describe('extractOampIdentifier', () => {
  it('returns null for empty string', () => {
    expect(extractOampIdentifier('')).toBeNull();
  });

  it('returns null when no OAMP identifier present', () => {
    expect(extractOampIdentifier('Vážený pane, prosíme o vaši odpověď do 30 dnů.')).toBeNull();
    expect(extractOampIdentifier('Invoice #12345')).toBeNull();
  });

  it('extracts canonical form from clean text', () => {
    expect(extractOampIdentifier('OAM-123456/MV-2024')).toBe('OAM-123456/MV-2024');
  });

  it('extracts and drops optional proceedings suffix (-4)', () => {
    expect(extractOampIdentifier('OAM-123456-4/MV-2024')).toBe('OAM-123456/MV-2024');
  });

  it('handles stray whitespace around separator', () => {
    expect(extractOampIdentifier('OAM-12345 / TP-2023')).toBe('OAM-12345/TP-2023');
  });

  it('handles missing dash between OAM and sequence', () => {
    expect(extractOampIdentifier('OAM 12345/MV-2024')).toBe('OAM-12345/MV-2024');
  });

  it('normalizes 0AM OCR misread to OAM', () => {
    expect(extractOampIdentifier('0AM-12345/MV-2024')).toBe('OAM-12345/MV-2024');
    expect(extractOampIdentifier('0am-12345/mv-2024')).toBe('OAM-12345/MV-2024');
  });

  it('uppercases the type portion', () => {
    expect(extractOampIdentifier('OAM-99999/mv-2025')).toBe('OAM-99999/MV-2025');
  });

  it('extracts from middle of longer text', () => {
    const text = 'Věc: žádost o pobyt č.j. OAM-456789/TP-2024, doručena dne 1. 3. 2024';
    expect(extractOampIdentifier(text)).toBe('OAM-456789/TP-2024');
  });

  it('handles various type codes (2-4 chars)', () => {
    expect(extractOampIdentifier('OAM-1/MV-2024')).toBe('OAM-1/MV-2024');
    expect(extractOampIdentifier('OAM-1/MVCR-2024')).toBe('OAM-1/MVCR-2024');
  });
});

describe('normalizeOampIdentifier', () => {
  it('uppercases identifier', () => {
    expect(normalizeOampIdentifier('oam-123/mv-2024')).toBe('OAM-123/MV-2024');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeOampIdentifier('  OAM-123/MV-2024  ')).toBe('OAM-123/MV-2024');
  });

  it('removes internal spaces', () => {
    expect(normalizeOampIdentifier('OAM-123 / MV-2024')).toBe('OAM-123/MV-2024');
  });

  it('replaces leading 0AM with OAM', () => {
    expect(normalizeOampIdentifier('0AM-123/MV-2024')).toBe('OAM-123/MV-2024');
  });

  it('is idempotent on canonical form', () => {
    const canonical = 'OAM-123456/MV-2024';
    expect(normalizeOampIdentifier(canonical)).toBe(canonical);
  });
});
