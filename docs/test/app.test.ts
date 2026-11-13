import { assert, assertEquals } from "@std/assert";
import { buildApp } from "../../.binette/packages/regie/src/build.ts";
import { readRepliqueLibraries } from "../../.binette/packages/regie/src/cli.ts";

interface Node {
  kind: string;
  text: string;
  handler: number;
  enabled: boolean;
  children: Node[];
  base: string;
  anchor: string;
}
interface Exports {
  memory: WebAssembly.Memory;
  _start(): void;
  __new(size: number, id: number): number;
  __bina_lifecycle(state: number, arg: number, time: number): void;
  __bina_net(id: number): void;
  __bina_ui_event(build: number, handler: number): void;
  __bina_ui_text(build: number, handler: number, pointer: number): void;
}
let built: Promise<WebAssembly.Module> | undefined;
async function compile() {
  const app = await buildApp(path => Deno.readTextFile(new URL(path, new URL("../", import.meta.url))), {
    libraries: await readRepliqueLibraries(new URL("../../.binette/packages/replique/", import.meta.url)),
  });
  return WebAssembly.compile(new Uint8Array(app.wasm));
}

async function start(storage = new Map<string, string>(), ref = "dev") {
  const module = await (built ??= compile());
  let frame: { build: number; root: Node };
  let response = { status: 200, type: "cors", reason: "", body: "" };
  const requests: string[] = [];
  const aborted: number[] = [];
  const opened: string[] = [];
  const writes: string[] = [];
  function read(pointer: number): string {
    if (!pointer) return "";
    const memory = exports.memory.buffer;
    const length = new DataView(memory).getUint32(pointer - 4, true);
    return new TextDecoder("utf-16le").decode(new Uint8Array(memory, pointer, length));
  }
  function write(value: string): number {
    const pointer = exports.__new(value.length * 2, 2);
    const units = new Uint16Array(exports.memory.buffer, pointer, value.length);
    for (let i = 0; i < value.length; i++) units[i] = value.charCodeAt(i);
    return pointer;
  }
  const handlers: Record<string, (...args: number[]) => number | void> = {
    "binette:app@0.1.why": () => 0,
    "binette:app@0.1.osRef": () => write(ref),
    "binette:app@0.1.lastPage": () => write(""),
    "binette:app@0.1.lastKind": () => 0,
    "binette:app@0.1.lastCause": () => 0,
    "binette:app@0.1.openUrl": pointer => { opened.push(read(pointer)); },
    "binette:storage@0.1.read": pointer => { const value = storage.get(read(pointer)); return value === undefined ? 0 : write(value); },
    "binette:storage@0.1.write": (key, value) => { const name = read(key); storage.set(name, read(value)); writes.push(name); return 1; },
    "binette:net@0.1.request": pointer => { requests.push(read(pointer)); return requests.length; },
    "binette:net@0.1.abort": id => { aborted.push(id); },
    "binette:net@0.1.text": (_id, field) => {
      const name = read(field);
      return write(name === "type" ? response.type : name === "reason" ? response.reason : "");
    },
    "binette:net@0.1.number": (_id, field) => read(field) === "status" ? response.status : read(field) === "length" ? new TextEncoder().encode(response.body).length : 0,
    "binette:net@0.1.copy": (_id, pointer) => { new Uint8Array(exports.memory.buffer, pointer, new TextEncoder().encode(response.body).length).set(new TextEncoder().encode(response.body)); },
    "binette:ui@0.1.render": pointer => { frame = JSON.parse(read(pointer)); },
  };
  const imports: WebAssembly.Imports = {};
  for (const entry of WebAssembly.Module.imports(module)) {
    imports[entry.module] ??= {};
    imports[entry.module][entry.name] = handlers[entry.module + "." + entry.name] ?? (() => { throw new Error("Unexpected import: " + entry.module + "." + entry.name); });
  }
  const instance = await WebAssembly.instantiate(module, imports);
  const exports = instance.exports as unknown as Exports;
  exports._start();
  exports.__bina_lifecycle(1, 0, 0);
  function flatten(node: Node): Node[] { return [node, ...node.children.flatMap(flatten)]; }
  function find(kind: string, text?: string): Node {
    const node = flatten(frame.root).find(node => node.kind === kind && (text === undefined || node.text === text));
    assert(node, `Missing ${kind}: ${text}`);
    return node;
  }
  return {
    storage, requests, aborted, opened, writes, find,
    texts: () => flatten(frame.root).filter(node => node.kind === "text").map(node => node.text),
    click(text: string) { exports.__bina_ui_event(frame.build, find("button", text).handler); },
    link(url: string) { exports.__bina_ui_text(frame.build, find("markdown").handler, write(url)); },
    respond(body: string, status = 200, type = "cors", reason = "", id = requests.length) {
      response = { body, status, type, reason };
      exports.__bina_net(id);
    },
  };
}
const base = "https://raw.githubusercontent.com/nozomi-hiragi/binette/main/docs/";

Deno.test("Docs loads index, navigates with anchors and restores back history", async () => {
  const app = await start();
  assertEquals(app.requests, [base + "index.md"]);
  assert(app.texts().includes("読み込み中…"));
  assertEquals(app.find("button", "戻る").enabled, false);
  app.respond("# Index");
  assert(app.texts().includes("Index"));
  app.click("目次");
  assertEquals(app.requests.at(-1), base + "spec/README.md");
  app.respond("# Contents");
  app.link(base + "spec/net.md#api");
  app.respond("# Net\n## API");
  assertEquals(app.find("markdown").base, base + "spec/net.md");
  assertEquals(app.find("markdown").anchor, "api");
  app.click("戻る");
  assertEquals(app.find("markdown").text, "# Contents");
  app.click("戻る");
  assertEquals(app.find("markdown").text, "# Index");
  assertEquals(app.find("button", "戻る").enabled, false);
});

Deno.test("Docs shows cached pages immediately and preserves them after offline or 404 responses", async () => {
  const storage = new Map([["page:main:index.md", "# Cached"]]);
  const app = await start(storage);
  assertEquals(app.find("markdown").text, "# Cached");
  app.respond("", 0, "error", "offline");
  assertEquals(app.find("markdown").text, "# Cached");
  app.click("目次");
  app.respond("# Contents");
  app.click("戻る");
  app.respond("", 404);
  assertEquals(app.find("markdown").text, "# Cached");
});

Deno.test("Docs updates changed bodies and does not rewrite unchanged cache", async () => {
  const app = await start(new Map([["page:main:index.md", "# Cached"]]));
  app.respond("# Cached");
  assertEquals(app.writes.filter(key => key.startsWith("page:")), []);
  app.click("目次");
  app.respond("# Contents");
  app.click("戻る");
  app.respond("# Updated");
  assertEquals(app.find("markdown").text, "# Updated");
  assertEquals(app.storage.get("page:main:index.md"), "# Updated");
});

Deno.test("Docs reports missing pages and retries network failures without cache", async () => {
  const app = await start();
  app.respond("", 404);
  assert(app.texts().includes("この版（main）にこのページはありません"));
  app.click("もう一度");
  assert(app.texts().includes("読み込み中…"));
  app.respond("", 0, "error", "offline");
  assert(app.texts().includes("読み込めません（offline）"));
  app.click("もう一度");
  app.respond("# Recovered");
  assertEquals(app.find("markdown").text, "# Recovered");
});

Deno.test("Docs ignores late responses and rewrites source links without navigating", async () => {
  const app = await start();
  app.click("目次");
  assertEquals(app.aborted, [1]);
  app.respond("# Wrong page", 200, "cors", "", 1);
  assert(app.texts().includes("読み込み中…"));
  app.respond("# Contents");
  app.link(base + "../src/main.ts#L1");
  assertEquals(app.opened, ["https://github.com/nozomi-hiragi/binette/blob/main/src/main.ts#L1"]);
  assertEquals(app.requests.length, 2);
  assertEquals(app.find("markdown").text, "# Contents");
});

Deno.test("Docs restores the last page for the current OS ref", async () => {
  const base = "https://raw.githubusercontent.com/nozomi-hiragi/binette/v0.2.1/docs/";
  const app = await start(new Map([["last:v0.2.1", base + "spec/net.md#api"], ["page:v0.2.1:spec/net.md", "# Versioned"]]), "v0.2.1");
  assertEquals(app.requests, [base + "spec/net.md"]);
  assertEquals(app.find("markdown").text, "# Versioned");
  assertEquals(app.find("markdown").anchor, "api");
});
