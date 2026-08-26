/**
 * Accepts cookies in either of the two forms a person actually has to hand:
 * a raw `Cookie:` header copied from devtools, or the contents of a Netscape
 * cookies.txt exported by a browser extension. Requiring one specific format
 * is a needless way to make the most fiddly step in the system fiddlier.
 */
export function parseCookies(input: string): Record<string, string> {
  const text = input.trim();
  const cookies: Record<string, string> = {};

  const looksLikeNetscape = text
    .split("\n")
    .some((line) => !line.startsWith("#") && line.split("\t").length >= 7);

  if (looksLikeNetscape) {
    for (const line of text.split("\n")) {
      if (!line.trim() || line.startsWith("#")) continue;
      const fields = line.split("\t");
      if (fields.length >= 7) cookies[fields[5].trim()] = fields[6].trim();
    }
    return cookies;
  }

  for (const pair of text.replace(/^Cookie:\s*/i, "").split(";")) {
    const index = pair.indexOf("=");
    if (index === -1) continue;
    const name = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (name) cookies[name] = value;
  }
  return cookies;
}
