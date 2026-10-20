/**
 * Normalizes string into a clean uppercase SKU token.
 */
export function normalizeSkuPart(val: string): string {
  if (!val) return '';
  return val
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}
