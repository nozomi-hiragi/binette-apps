import { readRepliqueLibraries } from "../../.binette/packages/regie/src/cli.ts";
import { assert, assertEquals } from "@std/assert";
import { buildApp } from "../../.binette/packages/regie/src/build.ts";

interface PreviewNode {
  kind: string;
  text: string;
  label: string;
  handler: number;
  enabled: boolean;
  children: PreviewNode[];
  checked: boolean;
  value: number;
  min: number;
  max: number;
  step: number;
  options: string[];
  index: number;
  align: string;
  highlight: boolean;
  width: number;
}

/** デザイナーを実際の asc でコンパイルし、描いた部品の木を読み書きできるようにする。 */
async function start() {
  const built = await buildApp(path => Deno.readTextFile(new URL(path, new URL("../", import.meta.url))), {
    libraries: await readRepliqueLibraries(new URL("../../.binette/packages/replique/", import.meta.url)),
  });
  const module = await WebAssembly.compile(new Uint8Array(built.wasm));
  let frame!: { build: number; root: PreviewNode };
  function string(pointer: number): string {
    // 大きな木の JSON でも引数の数の上限に当たらないよう、まとめて読む
    const length = new DataView(exports.memory.buffer).getUint32(pointer - 4, true);
    return new TextDecoder("utf-16le").decode(new Uint8Array(exports.memory.buffer, pointer, length));
  }
  const imports: WebAssembly.Imports = {};
  for (const entry of WebAssembly.Module.imports(module)) {
    imports[entry.module] ??= {};
    imports[entry.module][entry.name] = entry.module === "binette:ui@0.1" && entry.name === "render"
      ? (pointer: number) => { frame = JSON.parse(string(pointer)); }
      : () => { throw new Error("予期しない呼び出し: " + entry.module + "." + entry.name); };
  }
  const instance = await WebAssembly.instantiate(module, imports);
  const exports = instance.exports as {
    memory: WebAssembly.Memory;
    _start(): void;
    __bina_lifecycle(state: number, arg: number, time: number): void;
    __bina_ui_event(build: number, handler: number): void;
    __bina_ui_text(build: number, handler: number, pointer: number): void;
    __bina_ui_value(build: number, handler: number, value: number): void;
    __new(size: number, id: number): number;
  };
  exports._start();
  exports.__bina_lifecycle(2, 0, 0);
  function flatten(node: PreviewNode): PreviewNode[] { return [node, ...node.children.flatMap(flatten)]; }
  const ui = {
    nodes: () => flatten(frame.root),
    find(predicate: (node: PreviewNode) => boolean): PreviewNode {
      const node = ui.nodes().find(predicate);
      assert(node, "対象の部品がありません");
      return node;
    },
    /** ラベルか文字で探したボタンを押す。 */
    click(name: string) {
      exports.__bina_ui_event(frame.build, ui.find((node) => node.kind === "button" && (node.label === name || node.text === name)).handler);
    },
    type(label: string, value: string) {
      const field = ui.find((node) => node.label === label);
      const pointer = exports.__new(value.length * 2, 2);
      new Uint16Array(exports.memory.buffer, pointer, value.length).set(Array.from(value, (c) => c.charCodeAt(0)));
      exports.__bina_ui_text(frame.build, field.handler, pointer);
    },
    /** ラベルで探した値を返す部品（checkbox・slider・picker など）に値を届ける。 */
    value(label: string, value: number) { exports.__bina_ui_value(frame.build, ui.find((node) => node.label === label).handler, value); },
    code: () => ui.find((node) => node.label === "Décor のコード").text,
    status: () => ui.find((node) => node.kind === "text" && node.text.startsWith("● ")).text,
    has: (label: string) => ui.nodes().some((node) => node.label === label),
    texts: () => ui.nodes().filter((node) => node.kind === "text").map((node) => node.text),
    /** 木の行は buttonOf なので、中の文字を集めて返す。 */
    rowText: (node: PreviewNode) => flatten(node).map((child) => child.text).join(" "),
  };
  return ui;
}

Deno.test("通常アプリの appIcon は説明をプレビューし、木とコードを保持する", async () => {
  const ui = await start();
  function checkIcon(value: string) {
    const nodes = ui.nodes();
    assertEquals(nodes.some((node) => node.kind === "appIcon"), false);
    assert(nodes.some((node) => node.kind === "text" && node.text.includes("appIcon(" + value + ")") && node.text.includes("ホーム専用")));
    assert(ui.code().includes("appIcon(" + value + ")"));
    const item = ui.find((node) => node.label.startsWith("部品を選択 appIcon"));
    assert(ui.rowText(item).includes(value));
  }
  ui.click("appIcon を追加");
  checkIcon("0");

  // 入れ子と根の appIcon を読み込んでも、ホーム専用 View を送らない。
  for (const code of ['buttonOf([appIcon(7).label("見本")], () => {})', 'appIcon(2)']) {
    ui.type("Décor のコード", code);
    ui.click("コードから反映");
    checkIcon(code.includes("7") ? "7" : "2");
  }
  // 根が appIcon のときは子を足せないので、追加のチップを押せない。
  assertEquals(ui.find((node) => node.label === "column を追加").enabled, false);
  ui.click("見本に戻す");
  assertEquals(ui.has("部品を選択 appIcon"), false);
});

Deno.test("インスペクターは選んだ部品に効く修飾だけをグループに分けて出す", async () => {
  const ui = await start();
  // 根の column: 余白・サイズ・識別・そのほか（list）。文字の中身や heading は出さない。
  for (const title of ["インスペクター", "余白", "サイズ", "識別", "そのほか", "9 個の子"]) assert(ui.texts().includes(title), title);
  for (const title of ["内容", "文字"]) assertEquals(ui.texts().includes(title), false, title);
  assert(ui.has("gap を増やす") && ui.has("list を切り替える"));
  assertEquals(ui.has("heading を増やす") || ui.has("multiline を切り替える") || ui.has("enabled を切り替える"), false);

  ui.click("部品を選択 text こんにちは");
  for (const title of ["内容", "文字", "余白"]) assert(ui.texts().includes(title), title);
  assert(ui.has("部品の文字または番号") && ui.has("heading を増やす"));
  assertEquals(ui.has("gap を増やす") || ui.has("コールバック式"), false);

  ui.click("部品を選択 button 押す");
  assert(ui.has("コールバック式") && ui.has("enabled を切り替える") && ui.has("arg を増やす"));
  assertEquals(ui.has("heading を増やす"), false);

  // コードで付けた効かない修飾も、消せるように出す。
  ui.type("Décor のコード", 'text("x").gap(4)');
  ui.click("コードから反映");
  assert(ui.has("gap の修飾を削除"));
  ui.click("gap の修飾を削除");
  assertEquals(ui.code(), 'text("x")');
  assertEquals(ui.has("gap を増やす"), false);
});

Deno.test("数値の ＋、木の操作、コードの状態と反映", async () => {
  const ui = await start();
  assertEquals(ui.status(), "● 木と一致");
  assertEquals(ui.find((node) => node.label === "コードから反映" || node.text === "コードから反映").enabled, false);
  // 根は消せず、先頭は上へ動かせない。
  assertEquals(ui.find((node) => node.label === "選択した部品を削除").enabled, false);
  assertEquals(ui.find((node) => node.label === "選択した部品を上へ移動").enabled, false);

  ui.click("padding を増やす");
  assert(ui.code().endsWith(".padding(17)"), ui.code());
  assertEquals(ui.status(), "● 木と一致");
  ui.click("padding の修飾を削除");
  assert(ui.code().endsWith("]).gap(16)"), ui.code());
  assertEquals(ui.find((node) => node.label === "padding の数値").text, "");

  ui.click("部品を選択 input 複数行…");
  ui.click("選択した部品を上へ移動");
  assert(ui.code().indexOf("input(") < ui.code().indexOf("row(["), ui.code());

  // 読めないコードは入力のうちに位置と理由を出し、反映しても木を変えない。
  const before = ui.code();
  ui.type("Décor のコード", 'column([\n  text("よい"),\n  unknown("悪い")\n])');
  assertEquals(ui.status(), "● 3 行 10 列: 対応していない部品です: unknown");
  ui.click("コードから反映");
  assertEquals(ui.status(), "● 3 行 10 列: 対応していない部品です: unknown");
  assert(ui.has("部品を選択 input 複数行…"));

  ui.type("Décor のコード", 'row([text("新しい")])');
  assertEquals(ui.status(), "● 未反映の変更があります");
  ui.click("コードから反映");
  assertEquals(ui.status(), "● 木と一致");
  assert(ui.has("部品を選択 text 新しい"));
  assertEquals(ui.has("部品を選択 input 複数行…"), false);
  assert(before !== ui.code());
});

Deno.test("見本は新しい部品をそのまま描き、プレビューの操作ではコールバック式を実行しない", async () => {
  const ui = await start();
  const kinds = new Set(ui.nodes().map((node) => node.kind));
  for (const kind of ["tabs", "listTile", "stack", "image", "badge", "checkbox", "separator", "slider", "segmented", "spinner", "progress", "chip", "spacer"]) assert(kinds.has(kind), kind);
  const tile = ui.find((node) => node.kind === "listTile");
  assertEquals(tile.children.map((child) => child.kind), ["stack", "column", "checkbox"]);
  assertEquals(ui.find((node) => node.kind === "badge").align, "topEnd");
  assertEquals(ui.find((node) => node.kind === "tabs").options, ["一般", "通知", "表示"]);
  const before = ui.code();
  // プレビューの checkbox・slider・tabs を操作しても、木もコードも変わらない
  ui.value("通知", 0);
  ui.value("音量", 0.1);
  ui.value("期間", 2);
  assertEquals(ui.code(), before);
  assertEquals(ui.find((node) => node.label === "通知" && node.kind === "checkbox").checked, true);
  assertEquals(ui.find((node) => node.kind === "slider").value, 0.6);
});

Deno.test("新しい部品を追加し、インスペクターで値・範囲・選択肢・状態・位置を編集してコードに戻す", async () => {
  const ui = await start();
  const select = (name: string) => ui.click("部品を選択 " + name);
  // 根の column に足していく
  ui.click("slider を追加");
  assert(ui.code().includes("slider(0.5, 0, 1, (value: f64) => {})"), ui.code());
  ui.type("slider の max", "10");
  ui.type("slider の値", "7.5");
  ui.type("slider の min", "x");
  assert(ui.texts().includes("min は有限の数値で指定してください。"));
  ui.click("step を増やす");
  assert(ui.code().includes("slider(7.5, 0, 10, (value: f64) => {}).step(1)"), ui.code());
  const range = ui.find((node) => node.kind === "slider" && node.highlight);
  assertEquals([range.value, range.min, range.max, range.step], [7.5, 0, 10, 1]);

  select("column");
  ui.click("segmented を追加");
  ui.type("選択肢（1 行に 1 つ）", "小\n\n中\n大");
  ui.type("選択中の番号", "2");
  assert(ui.code().includes('segmented(["小", "中", "大"], 2, (index: i32) => {})'), ui.code());
  ui.type("選択中の番号", "1.5");
  assert(ui.texts().includes("選択中の番号は整数で指定してください（-1 は選択なし）。"));
  assert(ui.has("部品を選択 segmented 大"));

  select("column");
  ui.click("checkbox を追加");
  ui.click("checked を切り替える");
  assert(ui.code().includes("checkbox(false, (checked: bool) => {})"), ui.code());
  assert(ui.has("部品を選択 checkbox —"));

  // listTile は先頭と末尾の 2 つまで。1 つだけのときは位置を選べる
  select("column");
  ui.click("listTile を追加");
  ui.click("chip を追加");
  assert(ui.code().includes('listTile("題", "副題", chip("札"))'), ui.code());
  select("listTile 題");
  ui.value("子の位置", 1);
  assert(ui.code().includes('listTile("題", "副題", null, chip("札"))'), ui.code());
  ui.click("radio を追加");
  assert(ui.code().includes('listTile("題", "副題", radio(false, () => {}), chip("札"))'), ui.code());
  ui.click("badge を追加");
  assert(ui.texts().includes("listTile の子は先頭と末尾の 2 つまでです。"));
  // 選んでいるのは足した radio。プレビューの listTile は radio を先頭、chip を末尾に描く
  const tile = ui.find((node) => node.kind === "listTile" && node.children.some((child) => child.kind === "radio"));
  assertEquals(tile.children.map((child) => [child.kind, child.highlight]), [["radio", true], ["column", false], ["chip", false]]);
  // 先頭を消すと、残った子は末尾のまま
  select("radio —");
  ui.click("選択した部品を削除");
  assert(ui.code().includes('listTile("題", "副題", null, chip("札"))'), ui.code());

  // stack の子は align を選べ、外部 URL の画像は描かずに理由を見せる
  select("column");
  ui.click("stack を追加");
  ui.click("image を追加");
  ui.type("部品の文字または番号", "https://example.com/a.png");
  assert(ui.texts().some((value) => value.startsWith("image · PNG")));
  ui.value("align の位置", 9);
  assert(ui.code().includes('image("https://example.com/a.png").align("bottomEnd")'), ui.code());
  ui.click("width を増やす");
  assert(ui.code().includes('.align("bottomEnd").width(1)'), ui.code());
  ui.value("align の位置", 0);
  assert(ui.code().includes('image("https://example.com/a.png").width(1)'), ui.code());
  assertEquals(ui.status(), "● 木と一致");
});
