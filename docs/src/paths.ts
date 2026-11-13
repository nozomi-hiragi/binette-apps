const RAW = "https://raw.githubusercontent.com/nozomi-hiragi/binette/";
const BLOB = "https://github.com/nozomi-hiragi/binette/blob/";

export function documentRef(ref: string): string { return ref == "" || ref == "dev" ? "main" : ref; }
export function repositoryBase(ref: string): string { return RAW + ref + "/"; }
export function documentBase(ref: string): string { return repositoryBase(ref) + "docs/"; }

/** Normalize URL path segments without letting traversal change the authority. */
export function normalizePath(path: string): string {
  const parts = path.split("/");
  const result: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const dot = part.toLowerCase().split("%2e").join(".");
    if (dot == "..") { if (result.length > 0) result.pop(); }
    else if (part != "" && dot != ".") result.push(part);
  }
  const last = parts[parts.length - 1].toLowerCase().split("%2e").join(".");
  return "/" + result.join("/") + (result.length > 0 && (last == "" || last == "." || last == "..") ? "/" : "");
}

function suffixStart(value: string): i32 {
  const query = value.indexOf("?");
  const hash = value.indexOf("#");
  return query < 0 ? (hash < 0 ? value.length : hash) : (hash < 0 || query < hash ? query : hash);
}

/** Resolve links using the current page, including relative and root-relative paths. */
export function resolveUrl(link: string, page: string): string {
  const value = link.trim();
  if (value == "") return page;
  if (value.startsWith("#")) return page.split("#")[0] + value;
  const baseEnd = suffixStart(page);
  const base = page.substring(0, baseEnd);
  if (value.startsWith("?")) return base + value;
  let url = value;
  const colon = value.indexOf(":");
  const firstSlash = value.indexOf("/");
  const delimiter = firstSlash < 0 ? suffixStart(value) : min<i32>(firstSlash, suffixStart(value));
  if (value.startsWith("//")) url = page.substring(0, page.indexOf(":") + 1) + value;
  else if (colon < 0 || colon > delimiter) {
    const authorityEnd = base.indexOf("/", base.indexOf("://") + 3);
    const origin = authorityEnd < 0 ? base : base.substring(0, authorityEnd);
    url = value.startsWith("/") ? origin + value : base.substring(0, base.lastIndexOf("/") + 1) + value;
  }
  const schemeEnd = url.indexOf("://");
  if (schemeEnd < 0) return url;
  const end = suffixStart(url);
  const pathStart = url.indexOf("/", schemeEnd + 3);
  if (pathStart < 0 || pathStart >= end) return url.substring(0, end) + "/" + url.substring(end);
  return url.substring(0, pathStart) + normalizePath(url.substring(pathStart, end)) + url.substring(end);
}

/** Decode URL fragments into heading IDs without trapping on malformed UTF-8. */
export function decodeAnchor(value: string): string {
  let result = "";
  const hex = "0123456789abcdef";
  for (let i = 0; i < value.length;) {
    if (value.charAt(i) != "%") { result += value.charAt(i++); continue; }
    const bytes: u8[] = [];
    while (i < value.length && value.charAt(i) == "%") {
      if (i + 2 >= value.length) return value;
      const high = hex.indexOf(value.charAt(i + 1).toLowerCase());
      const low = hex.indexOf(value.charAt(i + 2).toLowerCase());
      if (high < 0 || low < 0) return value;
      bytes.push(<u8>((high << 4) | low));
      i += 3;
    }
    const buffer = new Uint8Array(bytes.length);
    for (let j = 0; j < bytes.length; j++) buffer[j] = bytes[j];
    const decoded = String.UTF8.decode(buffer.buffer);
    const encoded = Uint8Array.wrap(String.UTF8.encode(decoded, false, 1 /* REPLACE */));
    if (encoded.length != bytes.length) return value;
    for (let j = 0; j < bytes.length; j++) if (encoded[j] != bytes[j]) return value;
    result += decoded;
  }
  return result;
}

export class Link {
  constructor(readonly kind: string, readonly url: string = "", readonly path: string = "", readonly anchor: string = "") {}
}

/** Internal Markdown pages stay in the reader; source files use GitHub's blob view. */
export function classifyLink(link: string, page: string, ref: string): Link {
  const url = resolveUrl(link, page);
  if (!url.startsWith("https://")) return new Link("ignore");
  const end = suffixStart(url);
  const clean = url.substring(0, end);
  const hash = url.indexOf("#");
  const anchor = hash < 0 ? "" : decodeAnchor(url.substring(hash + 1));
  const base = documentBase(ref);
  if (clean.startsWith(base)) {
    let path = clean.substring(base.length);
    if (path == "") path = "index.md";
    else if (path.endsWith("/")) path += "README.md";
    if (path.endsWith(".md")) return new Link("page", base + path, path, anchor);
  } else if (clean.startsWith(repositoryBase(ref))) {
    return new Link("external", BLOB + ref + "/" + url.substring(repositoryBase(ref).length));
  }
  return new Link("external", url);
}

export function pageTitle(body: string): string {
  const lines = body.split("\n");
  let fence = "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("```") || line.startsWith("~~~")) {
      const marker = line.substring(0, 3);
      if (fence == "") fence = marker;
      else if (fence == marker) fence = "";
    } else if (fence == "" && line.startsWith("# ")) return line.substring(2).split("`").join("").trim();
  }
  return "ドキュメント";
}
