/** Suggest a Flow key from its name: initials of several words, else the first letters. */
export function suggestFlowKey(name: string) {
  const words = name
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length >= 2) {
    const initials = words.map((w) => w[0]).join("");
    if (initials.length >= 2) return initials.slice(0, 6);
  }
  const compact = words.join("");
  return compact.length >= 2 ? compact.slice(0, 4) : "";
}

/** Keep only A–Z and 0–9, upper-cased, at most 8 (the server's key rule). */
export function normaliseFlowKey(value: string) {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
}
