import { assertEquals } from "@std/assert";
import asc from "assemblyscript/asc";

const base = "https://raw.githubusercontent.com/nozomi-hiragi/binette/main/docs/";
const page = base + "spec/README.md";
const cases: [string, string, string][] = [
  ["Development and empty refs use main", '[documentRef("dev"), documentRef(""), documentRef("v0.2.1")].join("|")', "main|main|v0.2.1"],
  ["Relative links resolve against the page directory", `resolveUrl("../guide/start.md#intro", ${JSON.stringify(page)})`, base + "guide/start.md#intro"],
  ["Dot segments are normalized before classification", `resolveUrl("../../src/./main.ts", ${JSON.stringify(page)})`, base.replace("docs/", "src/main.ts")],
  ["Traversal stops at the URL authority", `resolveUrl("../../../../../../x", ${JSON.stringify(page)})`, "https://raw.githubusercontent.com/x"],
  ["Encoded dot segments cannot evade normalization", `resolveUrl("%2e%2e/%2E%2e/src/main.ts", ${JSON.stringify(page)})`, base.replace("docs/", "src/main.ts")],
  ["Root-relative links retain the authority", `resolveUrl("/a/../b.md", ${JSON.stringify(page)})`, "https://raw.githubusercontent.com/b.md"],
  ["A colon inside a query is not a URL scheme", `resolveUrl("net.md?next=https://example.com/", ${JSON.stringify(page)})`, base + "spec/net.md?next=https://example.com/"],
  ["Fragment and query links retain the page", `resolveUrl("#hello", ${JSON.stringify(page + "?x=1#old")})`, page + "?x=1#hello"],
  ["Query-only links replace the previous query", `resolveUrl("?x=2#new", ${JSON.stringify(page + "?x=1#old")})`, page + "?x=2#new"],
  ["Markdown links retain their destination anchor", `describe("net.md#api")`, "page|" + base + "spec/net.md|spec/net.md|api"],
  ["Encoded Japanese fragments become heading IDs", 'describe("net.md#%E6%97%A5%E6%9C%AC%E8%AA%9E")', "page|" + base + "spec/net.md|spec/net.md|日本語"],
  ["Encoded emoji and punctuation become heading IDs", 'describe("net.md#%F0%9F%93%96-%23%20")', "page|" + base + "spec/net.md|spec/net.md|📖-# "],
  ["Malformed fragments remain literal without aborting", '[describe("net.md#%ZZ"), describe("net.md#%E6%97"), describe("net.md#%C0%AF"), describe("net.md#%ED%A0%80")].join(";")', ["%ZZ", "%E6%97", "%C0%AF", "%ED%A0%80"].map(anchor => "page|" + base + "spec/net.md|spec/net.md|" + anchor).join(";")],
  ["Directory links use README", 'describe("../guide/")', "page|" + base + "guide/README.md|guide/README.md|"],
  ["The docs root uses index", 'describe("../")', "page|" + base + "index.md|index.md|"],
  ["Cross-directory source links use GitHub blob and keep fragments", 'describe("../../packages/core/src/index.ts#L10")', "external|https://github.com/nozomi-hiragi/binette/blob/main/packages/core/src/index.ts#L10||"],
  ["Non-Markdown docs assets open externally", 'describe("../image.svg")', "external|" + base + "image.svg||"],
  ["Other HTTPS links open externally", 'describe("https://example.com/a?b=1#c")', "external|https://example.com/a?b=1#c||"],
  ["Protocol-relative links resolve to HTTPS", 'describe("//example.com/a")', "external|https://example.com/a||"],
  ["Lookalike repo paths remain external", 'describe("https://raw.githubusercontent.com/nozomi-hiragi/binette/main-other/docs/index.md")', "external|https://raw.githubusercontent.com/nozomi-hiragi/binette/main-other/docs/index.md||"],
  ["Other refs remain external", 'describe("https://raw.githubusercontent.com/nozomi-hiragi/binette/v0.2.1/docs/index.md")', "external|https://raw.githubusercontent.com/nozomi-hiragi/binette/v0.2.1/docs/index.md||"],
  ["Unsafe and non-HTTPS schemes are ignored", '[describe("javascript:alert(1)"), describe("http://example.com/"), describe("mailto:a@example.com")].join(";")', "ignore|||;ignore|||;ignore|||"],
  ["Page titles ignore fenced code", 'pageTitle("```md\\n# Example\\n```\\n# Actual title\\n## Next")', "Actual title"],
  ["Page titles drop code span marks", 'pageTitle("# ホーム（`cadre.home`）")', "ホーム（cadre.home）"],
  ["Untitled pages use the app name", 'pageTitle("## Section")', "ドキュメント"],
];

const fixture = `
import { documentRef, resolveUrl, classifyLink, pageTitle } from "./paths";
function describe(url: string): string {
  const link = classifyLink(url, ${JSON.stringify(page)}, "main");
  return [link.kind, link.url, link.path, link.anchor].join("|");
}
${cases.map(([, expression], index) => `export function case${index}(): string { return ${expression}; }`).join("\n")}
`;

async function compile() {
  const source = await Deno.readTextFile(new URL("../src/paths.ts", import.meta.url));
  const stderr = asc.createMemoryStream();
  let wasm: Uint8Array | undefined;
  const result = await asc.main(["fixture.ts", "--outFile", "fixture.wasm"], {
    readFile: name => name === "fixture.ts" ? fixture : name === "paths.ts" ? source : null,
    writeFile(name, value) { if (name === "fixture.wasm" && typeof value !== "string") wasm = value; },
    listFiles: () => [], stderr,
  });
  assertEquals(result.error, null, stderr.toString());
  const { instance } = await WebAssembly.instantiate(new Uint8Array(wasm!), {
    env: { abort() { throw new Error("AssemblyScript test aborted"); } },
  });
  return instance.exports;
}
let compiled: ReturnType<typeof compile> | undefined;
for (const [index, [name, , expected]] of cases.entries()) {
  Deno.test(name, async () => {
    const exports = await (compiled ??= compile());
    const pointer = (exports[`case${index}`] as () => number)();
    const memory = (exports.memory as WebAssembly.Memory).buffer;
    const length = new DataView(memory).getUint32(pointer - 4, true);
    assertEquals(new TextDecoder("utf-16le").decode(new Uint8Array(memory, pointer, length)), expected);
  });
}
