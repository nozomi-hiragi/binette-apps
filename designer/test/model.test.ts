import { assertEquals } from "@std/assert";
import asc from "assemblyscript/asc";

// 純粋ロジックを実際の AssemblyScript コンパイラーと Wasm で検証する。
const fixture = `
import { parse, write, Node, example, validNumber, formatNumber, validModifierNumber, stepNumber, applicable, summary } from "./model";
export function roundTrip(): i32 {
  const first = parse(example);
  if (first.root === null) return 1;
  const code = write(changetype<Node>(first.root));
  const next = parse(code);
  if (next.root === null) return 2;
  return write(changetype<Node>(next.root)) == code ? 0 : 3;
}
export function allParts(): string {
  const code = 'grid([column([]), row([]), text("日本語\\\\n二行目").heading(2), button("押す", (i: i32): void => { use(i, "a,b)"); }).arg(2), buttonOf([appIcon(1)], open).key("a"), input("メモ", (s: string) => { save(s); }).multiline()]).padding().gap(space.md).minWidth(120.5).grow().list().enabled(false).label("見本")';
  const first = parse(code);
  if (first.root === null) return first.error;
  const output = write(changetype<Node>(first.root));
  const next = parse(output);
  if (next.root === null) return next.error;
  return write(changetype<Node>(next.root)) == output ? output : "不一致";
}
export function position(): string {
  const r = parse('column([\\n  text("よい"),\\n  unknown("悪い")\\n])');
  return r.line.toString() + ":" + r.column.toString() + ":" + r.error + ":" + (r.root === null ? "木なし" : "木あり");
}
export function callback(): string {
  const r = parse('button("試験", (i: i32) => { /* , ) */ call([i, 2], { a: "a,b)" }); })');
  if (r.root === null) return r.error;
  return changetype<Node>(r.root).callback;
}
export function comment(): i32 {
  const r = parse('button("末尾", () => {} // 末尾のコメント\\n)');
  if (r.root === null) return 1;
  const code = write(changetype<Node>(r.root));
  return parse(code).root === null ? 2 : 0;
}
export function errors(): i32 {
  const cases = ['text("未完)', 'text("x").other()', 'text("x").enabled(1)', 'text("x").gap(Infinity)', 'column([text("x"))', 'button("x", () => {]', 'text("x") trailing', 'text("x").grow(true)', 'text("x").heading()', '/* 未完'];
  for (let i = 0; i < cases.length; i++) if (parse(cases[i]).root !== null) return i + 1;
  return 0;
}
export function escaping(): i32 {
  const n = new Node("text");
  n.value = "引用\\\"\\\\\\n\\t" + String.fromCharCode(0) + "日本語";
  const r = parse(write(n));
  if (r.root === null) return 1;
  return changetype<Node>(r.root).value == n.value ? 0 : 2;
}
export function limits(): i32 {
  let code = 'text("x")';
  for (let i = 0; i < 51; i++) code = 'column([' + code + '])';
  if (parse(code).root !== null) return 1;
  code = 'column([';
  for (let i = 0; i < 501; i++) code += 'text("x"),';
  code += '])';
  return parse(code).root === null && !validNumber("1e999") && !validNumber("space.no") && validNumber("-.5") && validNumber("1e+21") && !validNumber("1e+") ? 0 : 2;
}
export function numberFormatting(): string {
  return [formatNumber(1), formatNumber(-2), formatNumber(0), formatNumber(1.25), formatNumber(-0.5), formatNumber(1e21)].join(",");
}
export function numberSteps(): string {
  return [
    stepNumber("minWidth", "10", 1), stepNumber("minWidth", "10.5", -1),
    stepNumber("padding", "space.xs", -1), stepNumber("gap", "space.xl", 1),
    stepNumber("padding", "radius.sm", 1), stepNumber("gap", "fontSize.lg", -1),
    stepNumber("padding", "-1", -1), stepNumber("gap", "-5", 1),
    stepNumber("padding", "", 1), stepNumber("gap", "", -1),
    stepNumber("heading", "", 1), stepNumber("heading", "1", -1), stepNumber("heading", "3", 1),
    stepNumber("heading", "99", -1), stepNumber("heading", "-4", 1),
    stepNumber("arg", "", 1), stepNumber("arg", "-2", -1), stepNumber("minWidth", "", 1)
  ].join(",");
}
export function integerModifiers(): i32 {
  const names = ["heading", "arg"];
  const valid = ["0", "-2", "3", "2.0", "1e2"];
  const invalid = ["", "1.5", "space.md", "radius.sm", "fontSize.lg", "Infinity", "1e999"];
  for (let i = 0; i < names.length; i++) {
    for (let j = 0; j < valid.length; j++) {
      if (!validModifierNumber(names[i], valid[j])) return 1;
      if (parse('text("x").' + names[i] + '(' + valid[j] + ')').root === null) return 2;
    }
    for (let j = 0; j < invalid.length; j++) {
      if (validModifierNumber(names[i], invalid[j])) return 3;
      if (parse('text("x").' + names[i] + '(' + invalid[j] + ')').root !== null) return 4;
    }
  }
  return validModifierNumber("padding", "") && validModifierNumber("gap", "") &&
    validModifierNumber("minWidth", "1.5") && validModifierNumber("gap", "space.md") ? 0 : 5;
}
export function inspectorRows(): string {
  const kinds = ["column", "row", "grid", "buttonOf", "text", "button", "input", "appIcon", "stack", "listTile", "checkbox", "radio", "slider", "tabs", "progress"];
  const names = ["padding", "gap", "minWidth", "grow", "heading", "key", "label", "list", "enabled", "multiline", "arg", "step", "align"];
  const out: string[] = [];
  for (let i = 0; i < kinds.length; i++) {
    let line = kinds[i] + ":";
    for (let j = 0; j < names.length; j++) if (applicable(kinds[i], names[j])) line += names[j] + " ";
    out.push(line.trim());
  }
  return out.join("|");
}
export function newParts(): string {
  const code = 'column([spacer(), separator(), spinner(), checkbox(true, (c: bool) => {}), radio(false, select).arg(2), slider(-1.5, -2, 2e3, (v: f64) => {}).step(0.5),' +
    ' picker(["赤", "青\\\\n二行"], -1, (i: i32) => {}), segmented([], 0, pick), tabs(["一", "二"], 1, (i: i32) => {}), progress(-1), image("data:image/png;base64,AAAA"),' +
    ' stack([text("下"), badge("3").align("topEnd")]).padding(4), listTile("題"), listTile("題", ""), listTile("題", "副", chip("札")), listTile("題", "副", null, badge("1"),),' +
    ' listTile("題", "副", text("前"), text("後")).gap(8), chip("札").width(40).height(20)])';
  const first = parse(code);
  if (first.root === null) return first.error;
  const output = write(changetype<Node>(first.root));
  const next = parse(output);
  if (next.root === null) return next.error;
  return write(changetype<Node>(next.root)) == output ? output : "不一致";
}
export function newErrors(): i32 {
  const cases = ['checkbox(1, f)', 'radio(true)', 'slider(1, 0, space.md, f)', 'slider(1, 0, f)', 'picker(["a"], 0.5, f)', 'picker("a", 0, f)', 'tabs([1], 0, f)',
    'progress(Infinity)', 'spacer(1)', 'listTile("a", "b", c, d, e)', 'listTile("a", "b", nul)', 'text("x").align("middle")', 'slider(1, 0, 2, f).step(space.md)', 'image(src)', 'text("x").width(space.md)'];
  for (let i = 0; i < cases.length; i++) if (parse(cases[i]).root !== null) return i + 1;
  // 文字列を取る修飾は、閉じ括弧の前に空白があっても読める
  const spaced = ['text("x").label("name" )', 'chip("New").align( "end" )'];
  for (let i = 0; i < spaced.length; i++) if (parse(spaced[i]).root === null) return 100 + i;
  return 0;
}
export function newSummaries(): string {
  const r = parse('row([checkbox(true, f), radio(false, f), tabs(["一", "二"], 1, f), picker(["一"], -1, f), slider(0.5, 0, 1, f), listTile("題"), image("data:image/png;base64,AAAAAAAAAAAAAAAAAAAAAAAA"), spacer()])');
  if (r.root === null) return r.error;
  const root = changetype<Node>(r.root);
  const out: string[] = [];
  for (let i = 0; i < root.children.length; i++) out.push(summary(root.children[i]));
  return out.join(",");
}
export function summaries(): string {
  const r = parse('column([text("一行"), input("複数\\\\n行", (s: string) => {}), appIcon(3), row([])])');
  if (r.root === null) return r.error;
  const root = changetype<Node>(r.root);
  const out = [summary(root)];
  for (let i = 0; i < root.children.length; i++) out.push(summary(root.children[i]));
  return out.join(",");
}
`;

Deno.test("デザイナーの木と式の往復・全パーツ・修飾・日本語を AS で確認する", async () => {
  const model = await Deno.readTextFile(new URL("../src/model.ts", import.meta.url));
  const stderr = asc.createMemoryStream();
  let wasm: Uint8Array | undefined;
  const result = await asc.main(["fixture.ts", "--outFile", "fixture.wasm"], {
    readFile: (name) => name === "fixture.ts" ? fixture : name === "model.ts" ? model : null,
    writeFile(name, value) {
      if (name === "fixture.wasm" && typeof value !== "string") wasm = value;
    },
    listFiles: () => [], stderr,
  });
  assertEquals(result.error, null, stderr.toString());
  const { instance } = await WebAssembly.instantiate(new Uint8Array(wasm!), {
    env: { abort() { throw new Error("AssemblyScript の検証が中断されました"); } },
  });
  const exports = instance.exports as {
    memory: WebAssembly.Memory;
    roundTrip(): number;
    allParts(): number;
    position(): number;
    callback(): number;
    comment(): number;
    errors(): number;
    escaping(): number;
    limits(): number;
    numberFormatting(): number;
    numberSteps(): number;
    integerModifiers(): number;
    inspectorRows(): number;
    summaries(): number;
    newParts(): number;
    newErrors(): number;
    newSummaries(): number;
  };
  function string(pointer: number): string {
    const length = new DataView(exports.memory.buffer).getUint32(pointer - 4, true) / 2;
    return String.fromCharCode(...new Uint16Array(exports.memory.buffer, pointer, length));
  }
  assertEquals(exports.roundTrip(), 0);
  const output = string(exports.allParts());
  assertEquals(output.includes(".padding().gap(space.md).minWidth(120.5).grow().list().enabled(false)"), true, output);
  assertEquals(output.includes(".multiline()"), true);
  assertEquals(output.includes('buttonOf(['), true);
  assertEquals(output.includes('.arg(2)'), true);
  assertEquals(string(exports.position()), "3:10:対応していない部品です: unknown:木なし");
  assertEquals(string(exports.callback()), '(i: i32) => { /* , ) */ call([i, 2], { a: "a,b)" }); }');
  assertEquals(exports.comment(), 0);
  assertEquals(exports.errors(), 0);
  assertEquals(exports.escaping(), 0);
  assertEquals(exports.limits(), 0);
  // 整数表記、小数、段の境界・既定値、整数専用の修飾を実 Wasm で確認する。
  assertEquals(string(exports.numberFormatting()), "1,-2,0,1.25,-0.5,1e+21");
  assertEquals(string(exports.numberSteps()), "11,9.5,space.xs,space.xl,radius.md,fontSize.md,space.xs,space.xl,space.md,space.md,2,1,3,2,2,1,-3,1");
  assertEquals(exports.integerModifiers(), 0);
  // インスペクターは部品に効く修飾だけを出し、木の行は値の 1 行目だけを見せる。
  assertEquals(string(exports.inspectorRows()).split("|"), [
    "column:padding gap minWidth grow key label list",
    "row:padding gap minWidth grow key label list",
    "grid:padding gap minWidth grow key label list",
    "buttonOf:padding gap minWidth grow key label enabled arg",
    "text:padding minWidth grow heading key label",
    "button:padding minWidth grow key label enabled arg",
    "input:padding minWidth grow key label enabled multiline",
    "appIcon:padding minWidth grow key label",
    "stack:padding minWidth grow key label",
    "listTile:padding gap minWidth grow key label",
    "checkbox:padding minWidth grow key label enabled",
    "radio:padding minWidth grow key label enabled arg",
    "slider:padding minWidth grow key label enabled step",
    "tabs:padding minWidth grow key label enabled",
    "progress:padding minWidth grow key label",
  ]);
  // 新しい部品の引数と修飾を読み書きし、もう一度読んでも同じ式になる
  const parts = string(exports.newParts());
  for (const piece of ["spacer(),", "separator(),", "spinner(),", "checkbox(true, (c: bool) => {})", "radio(false, select).arg(2)", "slider(-1.5, -2, 2000, (v: f64) => {}).step(0.5)",
    'picker(["赤", "青\\n二行"], -1, (i: i32) => {})', "segmented([], 0, pick)", 'tabs(["一", "二"], 1, (i: i32) => {})', "progress(-1)", 'image("data:image/png;base64,AAAA")',
    'badge("3").align("topEnd")', '  ]).padding(4)', 'listTile("題"),', 'listTile("題", "副", chip("札"))', 'listTile("題", "副", null, badge("1"))', 'listTile("題", "副", text("前"), text("後")).gap(8)',
    'chip("札").width(40).height(20)']) assert(parts.includes(piece), piece + "\n" + parts);
  // 2 つ目の listTile("題", "") は副題が空なので題だけに戻る
  assertEquals(parts.split('listTile("題"),').length, 3, parts);
  assertEquals(exports.newErrors(), 0);
  assertEquals(string(exports.newSummaries()), "✓,—,二,1 個の選択肢,0.5,題,data:image/png;base64,AA…,");
  assertEquals(string(exports.summaries()), ",一行,複数…,3,");
});
