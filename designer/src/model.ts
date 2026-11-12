/** Décor の式を編集する木。コールバックは実行せず、元の式を保持する。 */
export class Modifier {
  constructor(public name: string, public value: string = "") {}
}
export class Node {
  /** 文字・番号・値。checkbox と radio は "true" か "false"、選択肢を持つ部品は選択中の番号、listTile は題 */
  value: string = "";
  callback: string = "() => {}";
  children: Node[] = [];
  modifiers: Modifier[] = [];
  /** picker・segmented・tabs の選択肢 */
  options: string[] = [];
  /** slider の最小値と最大値 */
  min: string = "0";
  max: string = "1";
  /** listTile の副題 */
  subtitle: string = "";
  /** listTile の子が 1 つのとき、それが先頭か。2 つなら 1 つ目が先頭、2 つ目が末尾 */
  leading: boolean = true;
  constructor(public kind: string = "text") {}
}
/** 子の配列を引数に取る部品。 */
export function container(kind: string): boolean {
  return kind == "column" || kind == "row" || kind == "grid" || kind == "buttonOf" || kind == "stack";
}
/** 子を持てる部品。listTile は先頭と末尾の 2 つまで。 */
export function holder(kind: string): boolean { return container(kind) || kind == "listTile"; }
/** 選択肢と選択中の番号を持つ部品。 */
export function choice(kind: string): boolean { return kind == "picker" || kind == "segmented" || kind == "tabs"; }
/** 引数を取らない部品。 */
export function bare(kind: string): boolean { return kind == "spacer" || kind == "separator" || kind == "spinner"; }
/** 値が数の部品。 */
export function numericValue(kind: string): boolean { return kind == "appIcon" || kind == "progress" || kind == "slider" || choice(kind); }
/** コールバックを持つ部品。 */
export function callbackKind(kind: string): boolean {
  return kind == "button" || kind == "buttonOf" || kind == "input" || kind == "checkbox" || kind == "radio" || kind == "slider" || choice(kind);
}
/** 追加したときのコールバック式。値を受け取る部品は AS の型を書いておく。 */
export function defaultCallback(kind: string): string {
  if (kind == "input") return "(value: string) => {}";
  if (kind == "checkbox") return "(checked: bool) => {}";
  if (kind == "slider") return "(value: f64) => {}";
  if (choice(kind)) return "(index: i32) => {}";
  return "() => {}";
}
/** align に使える名前。Décor の parts.ts と同じ並び。 */
export const alignments: string[] = ["topStart", "top", "topEnd", "start", "center", "end", "bottomStart", "bottom", "bottomEnd"];
/** 画像の見本。8×8 のグラデーションの PNG */
export const sampleImage: string = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAT0lEQVR4nGPIKL6TUnEjse5qbPPFyI5zoX2ngiYf95t5mAGrqNe8/QxYRd0X72HAKuq8cgcDVlH7dVsZsIpab97IgFXUYuc6BqyiJvtWAQC6/2pl0CkcYQAAAABJRU5ErkJggg==";
/** Décor が描く画像か。Scene の document 方式と同じく base64 のラスターの data URL だけ */
export function drawableImage(src: string): boolean {
  const prefixes = ["data:image/png;base64,", "data:image/jpeg;base64,", "data:image/gif;base64,", "data:image/webp;base64,"];
  let start = -1;
  for (let i = 0; i < prefixes.length; i++) if (src.toLowerCase().startsWith(prefixes[i])) start = prefixes[i].length;
  if (start < 0 || start == src.length) return false;
  let end = src.length;
  while (end > start && end > src.length - 2 && src.charAt(end - 1) == "=") end--;
  for (let i = start; i < end; i++) {
    const c = src.charAt(i);
    if (!(c >= "a" && c <= "z") && !(c >= "A" && c <= "Z") && !(c >= "0" && c <= "9") && c != "+" && c != "/") return false;
  }
  return true;
}
/** listTile の i 番目の子が先頭か。 */
export function leadingSlot(parent: Node, index: i32): boolean { return parent.children.length == 2 ? index == 0 : parent.leading; }
export function numeric(name: string): boolean {
  return name == "padding" || name == "gap" || name == "minWidth" || name == "heading" || name == "arg" || name == "step" || name == "width" || name == "height";
}
export function flag(name: string): boolean {
  return name == "grow" || name == "list" || name == "multiline";
}
/** 修飾がその部品の見た目や振る舞いに効くか。インスペクターに出す行を選ぶのに使う。 */
export function applicable(kind: string, name: string): boolean {
  if (name == "gap") return container(kind) && kind != "stack" || kind == "listTile";
  if (name == "heading") return kind == "text";
  if (name == "list") return kind == "column" || kind == "row" || kind == "grid";
  if (name == "enabled") return callbackKind(kind);
  if (name == "multiline") return kind == "input";
  if (name == "arg") return kind == "button" || kind == "buttonOf" || kind == "radio";
  if (name == "step") return kind == "slider";
  // align は親が stack・row・column のときに効くので、木の位置で決める
  if (name == "align") return false;
  return name == "padding" || name == "minWidth" || name == "width" || name == "height" || name == "grow" || name == "key" || name == "label";
}
/** 木の行に出す値の要約。複数行は 1 行目だけにして「…」を付ける。 */
export function summary(node: Node): string {
  if (container(node.kind) || bare(node.kind)) return "";
  if (node.kind == "checkbox" || node.kind == "radio") return node.value == "true" ? "✓" : "—";
  if (node.kind == "image") return node.value.length > 24 ? node.value.substring(0, 24) + "…" : node.value;
  if (choice(node.kind)) {
    const index = validIndex(node.value) ? <i32>numberValue(node.value) : -1;
    return index >= 0 && index < node.options.length ? node.options[index] : node.options.length.toString() + " 個の選択肢";
  }
  const end = node.value.indexOf("\n");
  return end < 0 ? node.value : node.value.substring(0, end) + "…";
}
/** 段の名前を使わない有限の数か。値・min・max・step に使う */
export function plainNumber(value: string): boolean {
  return validNumber(value) && !value.startsWith("space.") && !value.startsWith("radius.") && !value.startsWith("fontSize.");
}
/** 選択中の番号として読める整数か。-1 は選択なし */
export function validIndex(value: string): boolean { return plainNumber(value) && numberValue(value) == Math.floor(numberValue(value)); }
export function numberValue(value: string): f64 {
  const names = ["xs", "sm", "md", "lg", "xl"];
  for (let i = 0; i < names.length; i++) {
    if (value == "space." + names[i] || value == "radius." + names[i] || value == "fontSize." + names[i]) return -i - 1;
  }
  return F64.parseFloat(value);
}
export function validNumber(value: string): boolean {
  if (value.startsWith("space.") || value.startsWith("radius.") || value.startsWith("fontSize.")) return !isNaN(numberValue(value));
  if (value.length == 0) return false;
  let i = value.charAt(0) == "-" || value.charAt(0) == "+" ? 1 : 0;
  let digits = 0;
  while (i < value.length && value.charAt(i) >= "0" && value.charAt(i) <= "9") { i++; digits++; }
  if (value.charAt(i) == ".") {
    i++;
    while (i < value.length && value.charAt(i) >= "0" && value.charAt(i) <= "9") { i++; digits++; }
  }
  if (digits == 0) return false;
  if (value.charAt(i) == "e" || value.charAt(i) == "E") {
    i++;
    if (value.charAt(i) == "-" || value.charAt(i) == "+") i++;
    const start = i;
    while (i < value.length && value.charAt(i) >= "0" && value.charAt(i) <= "9") i++;
    if (i == start) return false;
  }
  if (i != value.length || !isFinite(numberValue(value))) return false;
  return true;
}
/** AS の f64 の整数表記から不要な .0 を除く。指数表記も保つ。 */
export function formatNumber(value: f64): string {
  const raw = value.toString();
  const exponent = raw.indexOf("e");
  const end = exponent < 0 ? raw.length : exponent;
  return raw.substring(0, end).endsWith(".0") ? raw.substring(0, end - 2) + raw.substring(end) : raw;
}
export function validModifierNumber(name: string, value: string): boolean {
  if (value.length == 0) return name == "padding" || name == "gap";
  if (!validNumber(value)) return false;
  if (name == "step" || name == "width" || name == "height") return plainNumber(value);
  if (name != "heading" && name != "arg") return true;
  const n = numberValue(value);
  return n == Math.floor(n) && !value.startsWith("space.") && !value.startsWith("radius.") && !value.startsWith("fontSize.");
}
/** 名前付き段は名前空間を保持する。padding/gap の負整数も space 段。 */
export function stepNumber(name: string, before: string, delta: i32, configured: boolean = true): string {
  // 空の padding/gap（padding() の省略形）は md が既定なのでそこから始める
  if (configured && before.length == 0 && (name == "padding" || name == "gap")) return "space.md";
  let value = !configured ? (name == "heading" ? 1 : 0) : before.length == 0 ? (name == "padding" || name == "gap" ? -3 : name == "heading" ? 1 : 0) : numberValue(before);
  let prefix = "";
  const dot = before.indexOf(".");
  if (before.startsWith("space.") || before.startsWith("radius.") || before.startsWith("fontSize.")) prefix = before.substring(0, dot + 1);
  if (prefix.length > 0 || ((name == "padding" || name == "gap") && value >= -5 && value <= -1 && value == Math.floor(value))) {
    const names = ["xs", "sm", "md", "lg", "xl"];
    const index = <i32>Math.max(0, Math.min(4, -value - 1 + delta));
    return (prefix.length > 0 ? prefix : "space.") + names[index];
  }
  if (name == "heading") value = Math.max(1, Math.min(3, value));
  const next = name == "heading" ? Math.max(1, Math.min(3, value + delta))
    : name == "padding" || name == "gap" || name == "minWidth" || name == "step" || name == "width" || name == "height" ? Math.max(0, Math.max(0, value) + delta) : value + delta;
  return formatNumber(next);
}
function writtenNumber(value: string): string {
  if (!validNumber(value) || value.startsWith("space.") || value.startsWith("radius.") || value.startsWith("fontSize.")) return value;
  return formatNumber(numberValue(value));
}
export function quote(value: string): string {
  let out = '"';
  const hex = "0123456789abcdef";
  for (let i = 0; i < value.length; i++) {
    const c = value.charAt(i), code = value.charCodeAt(i);
    if (c == '"' || c == "\\") out += "\\" + c;
    else if (c == "\n") out += "\\n";
    else if (c == "\r") out += "\\r";
    else if (c == "\t") out += "\\t";
    else if (code < 32) out += "\\u00" + hex.charAt(code >> 4) + hex.charAt(code & 15);
    else out += c;
  }
  return out + '"';
}
function quotedModifier(name: string): boolean { return name == "key" || name == "label" || name == "align"; }
export function write(node: Node, depth: i32 = 0): string {
  let pad = "";
  for (let i = 0; i < depth; i++) pad += "  ";
  let out = node.kind + "(";
  if (container(node.kind)) {
    out += "[";
    for (let i = 0; i < node.children.length; i++) out += "\n" + pad + "  " + write(node.children[i], depth + 1) + ",";
    if (node.children.length > 0) out += "\n" + pad;
    out += "]";
  } else if (node.kind == "listTile") {
    out += quote(node.value);
    if (node.subtitle.length > 0 || node.children.length > 0) out += ", " + quote(node.subtitle);
    if (node.children.length == 1 && !node.leading) out += ", null";
    for (let i = 0; i < node.children.length; i++) out += ", " + write(node.children[i], depth);
  } else if (choice(node.kind)) {
    out += "[";
    for (let i = 0; i < node.options.length; i++) out += (i > 0 ? ", " : "") + quote(node.options[i]);
    out += "], " + writtenNumber(node.value);
  } else if (node.kind == "slider") {
    out += writtenNumber(node.value) + ", " + writtenNumber(node.min) + ", " + writtenNumber(node.max);
  } else if (node.kind == "checkbox" || node.kind == "radio") {
    out += node.value == "true" ? "true" : "false";
  } else if (!bare(node.kind)) {
    out += node.kind == "appIcon" || node.kind == "progress" ? writtenNumber(node.value) : quote(node.value);
  }
  if (callbackKind(node.kind)) out += (bare(node.kind) ? "" : ", ") + node.callback + (node.callback.includes("//") ? "\n" + pad : "");
  out += ")";
  for (let i = 0; i < node.modifiers.length; i++) {
    const m = node.modifiers[i];
    out += "." + m.name + "(" + (quotedModifier(m.name) ? quote(m.value) : numeric(m.name) ? writtenNumber(m.value) : m.value) + ")";
  }
  return out;
}
export class ParseResult {
  root: Node | null = null;
  error: string = "";
  offset: i32 = 0;
  line: i32 = 1;
  column: i32 = 1;
}
class Parser {
  pos: i32 = 0;
  count: i32 = 0;
  result: ParseResult = new ParseResult();
  constructor(private source: string) {}
  fail(reason: string): void {
    if (this.result.error.length > 0) return;
    this.result.error = reason;
    this.result.offset = this.pos;
    for (let i = 0; i < this.pos; i++) {
      if (this.source.charAt(i) == "\n") { this.result.line++; this.result.column = 1; }
      else this.result.column++;
    }
  }
  peek(): string { return this.source.charAt(this.pos); }
  skip(): void {
    while (this.pos < this.source.length) {
      const c = this.peek();
      if (c == " " || c == "\t" || c == "\r" || c == "\n") { this.pos++; continue; }
      if (this.source.substr(this.pos, 2) == "//") {
        while (this.pos < this.source.length && this.peek() != "\n") this.pos++;
        continue;
      }
      if (this.source.substr(this.pos, 2) == "/*") {
        this.pos += 2;
        while (this.pos < this.source.length && this.source.substr(this.pos, 2) != "*/") this.pos++;
        if (this.pos == this.source.length) { this.fail("コメントが閉じていません"); return; }
        this.pos += 2; continue;
      }
      return;
    }
  }
  take(s: string): boolean {
    this.skip();
    if (this.peek() != s) { this.fail("「" + s + "」が必要です"); return false; }
    this.pos++; return true;
  }
  identifier(): string {
    this.skip(); const start = this.pos;
    while (this.pos < this.source.length) {
      const c = this.peek();
      if (!(c >= "a" && c <= "z") && !(c >= "A" && c <= "Z")) break;
      this.pos++;
    }
    return this.source.substring(start, this.pos);
  }
  stringValue(): string {
    this.skip(); const q = this.peek();
    if (q != '"' && q != "'") { this.fail("文字列が必要です"); return ""; }
    this.pos++; let out = "";
    while (this.pos < this.source.length) {
      let c = this.peek(); this.pos++;
      if (c == q) return out;
      if (c == "\n" || c == "\r") { this.fail("文字列内の改行は \\n と書いてください"); return out; }
      if (c == "\\") {
        if (this.pos >= this.source.length) break;
        c = this.peek(); this.pos++;
        if (c == "n") out += "\n";
        else if (c == "r") out += "\r";
        else if (c == "t") out += "\t";
        else if (c == "b") out += "\b";
        else if (c == "f") out += "\f";
        else if (c == "\\" || c == '"' || c == "'") out += c;
        else if (c == "u") {
          let code = 0;
          for (let j = 0; j < 4; j++) {
            const digit = "0123456789abcdef".indexOf(this.peek().toLowerCase());
            if (this.pos >= this.source.length || digit < 0) { this.fail("Unicode エスケープには16進数4桁が必要です"); return out; }
            code = code * 16 + digit; this.pos++;
          }
          out += String.fromCharCode(code);
        } else { this.fail("対応していないエスケープです"); return out; }
      } else out += c;
    }
    this.fail("文字列が閉じていません"); return out;
  }
  /** 引数の区切りまでを字句として保持し、式を実行しない。 */
  expression(): string {
    this.skip(); const start = this.pos;
    let stack = "", q = "";
    while (this.pos < this.source.length) {
      const c = this.peek();
      if (q.length > 0) {
        this.pos++;
        if (c == "\\") { if (this.pos < this.source.length) this.pos++; }
        else if (c == q) q = "";
        continue;
      }
      if (c == '"' || c == "'" || c == "`") { q = c; this.pos++; continue; }
      if (this.source.substr(this.pos, 2) == "//" || this.source.substr(this.pos, 2) == "/*") { this.skip(); continue; }
      if (stack.length == 0 && (c == ")" || c == ",")) break;
      if (c == "(" || c == "[" || c == "{") stack += c == "(" ? ")" : c == "[" ? "]" : "}";
      else if (c == ")" || c == "]" || c == "}") {
        if (stack.length == 0 || c != stack.charAt(stack.length - 1)) { this.fail("式の括弧が対応していません"); break; }
        stack = stack.substring(0, stack.length - 1);
      }
      this.pos++;
    }
    if (q.length > 0 || stack.length > 0) this.fail("式が閉じていません");
    const value = this.source.substring(start, this.pos).trim();
    if (value.length == 0) this.fail("引数が必要です");
    return value;
  }
  /** 段の名前を使わない有限の数の引数。 */
  plain(what: string, integer: boolean = false): string {
    const value = this.expression();
    if (this.result.error.length == 0 && !(integer ? validIndex(value) : plainNumber(value))) this.fail(what + "は有限の" + (integer ? "整数" : "数値") + "で指定してください");
    return value;
  }
  /** 次の引数の前の「,」。 */
  comma(): boolean { return this.take(","); }
  /** listTile の先頭・末尾。null か部品 */
  slot(depth: i32): Node | null {
    this.skip();
    if (this.source.substr(this.pos, 4) == "null") {
      const after = this.source.charAt(this.pos + 4);
      if (!(after >= "a" && after <= "z") && !(after >= "A" && after <= "Z")) { this.pos += 4; return null; }
    }
    return this.node(depth + 1);
  }
  node(depth: i32): Node {
    const n = new Node(this.identifier());
    if (++this.count > 500 || depth > 48) { this.fail("部品は500個、深さは48段までです"); return n; }
    const known = ["text", "button", "input", "appIcon", "spacer", "separator", "checkbox", "radio", "slider", "picker", "segmented", "tabs", "progress", "spinner", "image", "listTile", "chip", "badge"];
    if (!container(n.kind) && !known.includes(n.kind)) { this.fail("対応していない部品です: " + n.kind); return n; }
    if (!this.take("(")) return n;
    if (container(n.kind)) {
      if (!this.take("[")) return n;
      this.skip();
      while (this.peek() != "]" && this.result.error.length == 0) {
        n.children.push(this.node(depth + 1)); this.skip();
        if (this.peek() != ",") break;
        this.pos++; this.skip();
      }
      if (!this.take("]")) return n;
    } else if (n.kind == "appIcon") {
      n.value = this.expression();
      if (!validNumber(n.value)) this.fail("アイコン番号は有限の数値で指定してください");
    } else if (n.kind == "progress") {
      n.value = this.plain("進み具合");
    } else if (n.kind == "slider") {
      n.value = this.plain("値");
      if (!this.comma()) return n;
      n.min = this.plain("min ");
      if (!this.comma()) return n;
      n.max = this.plain("max ");
    } else if (n.kind == "checkbox" || n.kind == "radio") {
      n.value = this.identifier();
      if (n.value != "true" && n.value != "false") this.fail("true または false が必要です");
    } else if (choice(n.kind)) {
      if (!this.take("[")) return n;
      this.skip();
      while (this.peek() != "]" && this.result.error.length == 0) {
        n.options.push(this.stringValue()); this.skip();
        if (this.peek() != ",") break;
        this.pos++; this.skip();
      }
      if (!this.take("]") || !this.comma()) return n;
      n.value = this.plain("選択中の番号", true);
    } else if (n.kind == "listTile") {
      n.value = this.stringValue();
      this.skip();
      if (this.peek() == "," && this.result.error.length == 0) {
        this.pos++; this.skip();
        if (this.peek() != ")") {
          n.subtitle = this.stringValue();
          let empty = true;
          for (let slot = 0; slot < 2 && this.result.error.length == 0; slot++) {
            this.skip();
            if (this.peek() != ",") break;
            this.pos++; this.skip();
            if (this.peek() == ")") break;
            const child = this.slot(depth);
            if (child !== null) { n.children.push(child); if (slot == 1 && empty) n.leading = false; empty = false; }
          }
        }
      }
    } else if (!bare(n.kind)) n.value = this.stringValue();
    if (callbackKind(n.kind)) {
      if (!this.take(",")) return n;
      n.callback = this.expression();
    }
    this.skip();
    if (this.peek() == ",") this.pos++;
    if (!this.take(")")) return n;
    this.skip();
    while (this.peek() == "." && this.result.error.length == 0) {
      this.pos++; const name = this.identifier();
      if (!numeric(name) && !flag(name) && !quotedModifier(name) && name != "enabled") { this.fail("対応していない修飾です: " + name); return n; }
      if (!this.take("(")) return n;
      let value = "";
      this.skip();
      if (quotedModifier(name)) {
        value = this.stringValue();
        this.skip();
        if (name == "align" && !alignments.includes(value)) this.fail("位置の名前は topStart・top・topEnd・start・center・end・bottomStart・bottom・bottomEnd です");
      } else if (!flag(name) && this.peek() != ")") value = this.expression();
      else if (numeric(name) && name != "padding" && name != "gap") this.fail("数値が必要です");
      if (numeric(name) && value.length > 0 && !validModifierNumber(name, value)) this.fail(name == "heading" || name == "arg" ? "整数を指定してください（段の名前は使えません）" : name == "step" || name == "width" || name == "height" ? "有限の数値が必要です（段の名前は使えません）" : "有限の数値か段の名前が必要です");
      if (name == "enabled" && value != "true" && value != "false") this.fail("true または false が必要です");
      if (!this.take(")")) return n;
      n.modifiers.push(new Modifier(name, value)); this.skip();
    }
    return n;
  }
  run(): ParseResult {
    if (this.source.length > 65536) { this.fail("コードは65536文字までです"); return this.result; }
    const n = this.node(0); this.skip();
    if (this.peek() == ";") { this.pos++; this.skip(); }
    if (this.pos < this.source.length) this.fail("部品の式の後に余分な文字があります");
    if (this.result.error.length == 0) this.result.root = n;
    return this.result;
  }
}
export function parse(source: string): ParseResult { return new Parser(source).run(); }
export const example: string = 'column([\n' +
  '  text("こんにちは").heading(1),\n' +
  '  row([text("Décor の見本"), spacer(), chip("新しい部品"), button("押す", () => {}).padding(space.sm)]).gap(12),\n' +
  '  input("複数行\\n編集できます", (value: string) => {}).multiline().height(72).label("メモ"),\n' +
  '  tabs(["一般", "通知", "表示"], 1, (index: i32) => {}),\n' +
  '  listTile("のぞみ", "新しいメッセージが 3 件", stack([image("' + sampleImage + '").width(40).height(40), badge("3").align("topEnd")]), checkbox(true, (checked: bool) => {}).label("通知")),\n' +
  '  separator(),\n' +
  '  row([text("音量"), slider(0.6, 0, 1, (value: f64) => {}).grow().label("音量")]).gap(12),\n' +
  '  row([segmented(["日", "週", "月"], 1, (index: i32) => {}).label("期間"), spacer(), spinner().label("読み込み中")]).gap(12),\n' +
  '  progress(0.4),\n' +
  ']).gap(16).padding(16)';
