// deno-lint-ignore-file no-import-prefix no-unversioned-import
import { Api, App, Last, StorageApi, launch } from "jsr:@binette/replique";
import { NetApi, Response } from "jsr:@binette/replique/net";
import { View, button, column, markdown, row, space, text } from "jsr:@binette/replique/ui";
import { classifyLink, documentBase, documentRef, pageTitle } from "./paths.ts";

class Docs extends App {
  private net: NetApi | null = null;
  private storage: StorageApi | null = null;
  private ref: string = "main";
  private path: string = "";
  private anchor: string = "";
  private body: string | null = null;
  private error: string = "";
  private request: i32 = 0;
  private history: string[] = [];

  override onCreate(_last: Last, api: Api): void {
    this.ref = documentRef(this.osRef());
    this.net = NetApi.from(api);
    this.storage = StorageApi.from(api);
    const saved = this.storage === null ? null : this.storage!.read("last:" + this.ref);
    this.open(saved === null ? "index.md" : saved, false);
  }

  private pageUrl(): string { return documentBase(this.ref) + this.path; }
  private cacheKey(): string { return "page:" + this.ref + ":" + this.path; }

  open(link: string, remember: bool = true): void {
    const target = classifyLink(link, this.path == "" ? documentBase(this.ref) + "index.md" : this.pageUrl(), this.ref);
    if (target.kind == "external") { this.openUrl(target.url); return; }
    if (target.kind != "page") return;
    if (remember && this.path != "" && (target.path != this.path || target.anchor != this.anchor)) {
      this.history.push(this.pageUrl() + (this.anchor == "" ? "" : "#" + this.anchor));
    }
    this.path = target.path;
    this.anchor = target.anchor;
    this.body = this.storage === null ? null : this.storage!.read(this.cacheKey());
    this.error = "";
    if (this.storage !== null) this.storage!.write("last:" + this.ref, this.pageUrl() + (this.anchor == "" ? "" : "#" + this.anchor));
    this.refresh();
  }

  back(): void {
    if (this.history.length > 0) this.open(this.history.pop(), false);
  }

  refresh(): void {
    this.error = "";
    if (this.net === null) { this.error = "読み込めません（blocked）"; return; }
    if (this.request != 0) this.net!.abort(this.request);
    this.request = this.net!.fetch(this.pageUrl());
  }

  override onNet(id: i32, res: Response): void {
    if (id != this.request) return;
    this.request = 0;
    if (res.status == 200) {
      const next = res.text();
      if (this.body === null || this.body! != next) {
        this.body = next;
        if (this.storage !== null) this.storage!.write(this.cacheKey(), next);
      }
      this.error = "";
    } else if (this.body === null) {
      this.error = res.status == 404 ? "この版（" + this.ref + "）にこのページはありません"
        : "読み込めません（" + (res.type == "error" ? res.reason : res.type == "opaqueredirect" ? "redirect" : res.status.toString()) + "）";
    }
  }

  override build(): View {
    const content: View[] = [];
    if (this.body !== null) content.push(markdown(this.body!, onLink).base(this.pageUrl()).anchor(this.anchor));
    else if (this.error != "") {
      content.push(text(this.error));
      content.push(button("もう一度", retry));
    } else content.push(text("読み込み中…"));
    return column([
      row([
        button("戻る", back).variant("ghost").enabled(this.history.length > 0),
        button("目次", contents).variant("ghost"),
        text(this.body === null ? "ドキュメント" : pageTitle(this.body!)).bold().grow().truncate(),
      ]).gap(space.sm).padding(space.md).surface("surface").divider("bottom"),
      column(content).padding(space.lg).gap(space.md).scroll().fill().key("body-" + this.path),
    ]).fill();
  }
}

const docs = new Docs();
function onLink(url: string): void { docs.open(url); }
function back(): void { docs.back(); }
function contents(): void { docs.open(documentBase(documentRef(docs.osRef())) + "spec/README.md"); }
function retry(): void { docs.refresh(); }
launch(docs);
