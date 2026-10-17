const CODE_PREFIX = /^OAC/;
const MIN_QUERY_LENGTH = 2;

/** What staff typed, reduced to the part of the code after `OAC-`: upper case, no spaces or dashes. */
export function normalizeCodeQuery(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(CODE_PREFIX, "");
}

/**
 * Orders whose code ends with what was typed, so staff can key in just the last characters.
 * Codes never contain 0, 1, I or O, so a query with one of those cannot match anything: it is
 * left as typed instead of being "corrected" into a different, wrong order.
 */
export function findByCode<T extends { code: string }>(orders: T[], query: string): T[] {
  const wanted = normalizeCodeQuery(query);
  if (wanted.length < MIN_QUERY_LENGTH) return [];
  return orders.filter((o) => o.code.replace(/^OAC-/, "").endsWith(wanted));
}
