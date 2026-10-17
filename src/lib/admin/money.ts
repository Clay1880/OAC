/** What an admin typed in a price box ("45", "45.5", "₹1,250.00") as integer paise, or null if invalid. */
export function parseRupees(input: string): number | null {
  const cleaned = input.trim().replace(/^₹/, "").replace(/,/g, "").trim();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  const paise = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(paise) && paise <= 2_000_000_00 ? paise : null;
}
