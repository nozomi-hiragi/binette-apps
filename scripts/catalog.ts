import { resolve } from "@std/path";
import { compare, parse } from "@std/semver";
import { computeAppMetadata, readRepliqueLibraries } from "../.binette/packages/regie/src/cli.ts";

export const REPOSITORY = "nozomi-hiragi/binette-apps";
export const CATALOG_URL = "https://nozomi-hiragi.github.io/binette-apps/";
export const CATALOG_NAME = "Binette Apps";

export interface CatalogEntry {
  id: string;
  source: string;
  version: string;
  name?: string;
  icon?: string;
  description?: string;
  integrity: Record<string, string>;
  requires?: Record<string, string>;
}

async function git(root: string, args: string[]): Promise<Uint8Array> {
  const result = await new Deno.Command("git", { cwd: root, args, stdout: "piped", stderr: "piped" }).output();
  if (!result.success) throw new Error(`git ${args.join(" ")}: ${new TextDecoder().decode(result.stderr).trim()}`);
  return result.stdout;
}

async function gitText(root: string, args: string[]): Promise<string> {
  return new TextDecoder().decode(await git(root, args)).trim();
}

/** Read release trees without changing the checkout or its index. */
async function extract(root: string, commit: string, directory: string): Promise<void> {
  const archive = await git(root, ["archive", "--format=tar", commit]);
  const child = new Deno.Command("tar", { args: ["-xf", "-", "-C", directory], stdin: "piped", stdout: "null", stderr: "piped" }).spawn();
  const writer = child.stdin.getWriter();
  await writer.write(archive);
  await writer.close();
  const result = await child.output();
  if (!result.success) throw new Error(`tar: ${new TextDecoder().decode(result.stderr).trim()}`);
}

/** Select the greatest SemVer release for each app ID, including prereleases. */
export async function catalogEntries(root: string): Promise<CatalogEntry[]> {
  const tags = (await gitText(root, ["tag", "--list"])).split("\n").filter(Boolean).sort();
  const releases = new Map<string, { tag: string; version: string }>();
  for (const tag of tags) {
    const match = /^([^/]+)\/v(.+)$/.exec(tag);
    if (!match) continue;
    const [, id, version] = match;
    const parsed = parse(version);
    const previous = releases.get(id);
    if (!previous || compare(parsed, parse(previous.version)) > 0) releases.set(id, { tag, version });
  }
  const entries: CatalogEntry[] = [];
  if (releases.size === 0) return entries;
  const libraries = await readRepliqueLibraries(new URL("../.binette/packages/replique/", import.meta.url));
  for (const [id, release] of [...releases].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
    const commit = await gitText(root, ["rev-parse", `refs/tags/${release.tag}^{commit}`]);
    if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error(`Invalid commit: ${commit}`);
    const directory = await Deno.makeTempDir({ prefix: "binette-apps-catalog-" });
    try {
      await extract(root, commit, directory);
      const matches: { folder: string; manifest: { id: string; version?: string; name?: string; icon?: string; description?: string } }[] = [];
      for await (const folder of Deno.readDir(directory)) {
        if (!folder.isDirectory || folder.name.startsWith(".")) continue;
        let text: string;
        try { text = await Deno.readTextFile(resolve(directory, folder.name, "app.json")); }
        catch (error) { if (error instanceof Deno.errors.NotFound) continue; throw error; }
        const manifest = JSON.parse(text);
        if (manifest.id === id) matches.push({ folder: folder.name, manifest });
      }
      if (matches.length !== 1) throw new Error(`${release.tag}: expected exactly one app with id ${id}.`);
      const { folder, manifest } = matches[0];
      if (manifest.version !== release.version) throw new Error(`${release.tag}: app.json version ${manifest.version} does not match ${release.version}.`);
      const source = `https://raw.githubusercontent.com/${REPOSITORY}/${commit}/${encodeURIComponent(folder)}/`;
      entries.push({
        id,
        source,
        version: release.version,
        ...(manifest.name ? { name: manifest.name } : {}),
        ...(manifest.icon ? { icon: new URL(manifest.icon, source).href } : {}),
        ...(manifest.description ? { description: manifest.description } : {}),
        ...await computeAppMetadata(resolve(directory, folder), { libraries }),
      });
    } finally {
      await Deno.remove(directory, { recursive: true });
    }
  }
  return entries;
}

const escape = (text: string) => text.replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`);

/** Keep the linked list and the embedded fallback identical. */
export function catalogHtml(entries: CatalogEntry[]): string {
  const list = JSON.stringify({ name: CATALOG_NAME, apps: entries });
  const copyControl = () => `<div class="catalog-url"><code>${escape(CATALOG_URL)}</code><button type="button" class="copy-url">URL をコピー</button></div>`;
  const cards = entries.map(entry => {
    const name = entry.name ?? entry.id;
    // Reject active URL schemes before embedding an optional icon.
    let icon = "";
    if (entry.icon) {
      try {
        const url = new URL(entry.icon);
        if (["https:", "http:"].includes(url.protocol)) {
          // CSS hex escapes protect the quoted URL, including control characters.
          icon = Array.from(url.href, char => {
            const code = char.charCodeAt(0);
            return code < 32 || code === 127 || char === '"' || char === "\\" ? `\\${code.toString(16)} ` : char;
          }).join("");
        }
      } catch { /* Invalid icons use the letter fallback. */ }
    }
    const fallback = `<span>${escape(Array.from(name)[0]?.toUpperCase() ?? "?")}</span>`;
    return `<li class="app-card" id="${escape(entry.id)}">
<div class="app-heading"><span class="app-icon" aria-hidden="true">${fallback}${icon ? `<span class="icon-image" style="background-image: url(&quot;${escape(icon)}&quot;)"></span>` : ""}</span>
<div class="app-title"><h2><a href="#${escape(encodeURIComponent(entry.id))}">${escape(name)}</a></h2><p class="version">${escape(entry.version)}</p></div></div>
${entry.description ? `<p class="description">${escape(entry.description)}</p>` : ""}
<div class="install"><h3>インストール方法</h3><p>Binette の「アプリ」→「リスト」で、次の URL を追加してください。追加したリストから「${escape(name)}」を選んでインストールできます。</p>${copyControl()}</div>
</li>`;
  }).join("\n");
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(CATALOG_NAME)}</title>
<link rel="binette-apps" href="apps.json">
<style>
:root {
  color-scheme: light;
  --color-base-100: #ffffff;
  --color-base-200: #f3f5f8;
  --color-base-300: #d5dae1;
  --color-base-content: #16181d;
  --color-primary: #3273b9;
  --color-primary-content: #ffffff;
  --radius-box: 16px;
  --radius-field: 10px;
  font-family: system-ui, sans-serif;
}
@media (prefers-color-scheme: dark) {
  :root {
    color-scheme: dark;
    --color-base-100: #22252b;
    --color-base-200: #16181c;
    --color-base-300: #353a43;
    --color-base-content: #f1f3f5;
    --color-primary: #5b9be0;
    --color-primary-content: #0d1117;
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--color-base-200); color: var(--color-base-content); line-height: 1.65; }
main { max-width: 68rem; margin: 0 auto; padding: 3.5rem 1.25rem; }
header { max-width: 44rem; margin-bottom: 2.5rem; }
h1 { margin: 0 0 .5rem; font-size: clamp(1.8rem, 5vw, 2.5rem); line-height: 1.25; letter-spacing: -.03em; }
header > p { margin: 0 0 1.25rem; }
a { color: inherit; text-decoration-color: var(--color-base-300); text-underline-offset: .2em; }
a:hover { text-decoration-color: var(--color-primary); }
.apps { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 26rem), 1fr)); gap: 1.25rem; padding: 0; margin: 0; list-style: none; }
.app-card { min-width: 0; padding: 1.5rem; background: var(--color-base-100); border: 1px solid var(--color-base-300); border-radius: var(--radius-box); scroll-margin-top: 1.5rem; }
.app-card:target { outline: 3px solid var(--color-primary); outline-offset: 4px; }
.app-heading { display: flex; align-items: center; gap: 1rem; }
.app-icon { position: relative; display: grid; place-items: center; flex: 0 0 4rem; width: 4rem; height: 4rem; overflow: hidden; border-radius: var(--radius-box); background: var(--color-base-200); color: var(--color-primary); font-size: 1.8rem; font-weight: 700; }
.icon-image { position: absolute; inset: 0; width: 100%; height: 100%; background-position: center; background-size: contain; background-repeat: no-repeat; pointer-events: none; }
.app-title { min-width: 0; }
h2 { margin: 0; font-size: 1.25rem; line-height: 1.4; overflow-wrap: anywhere; }
.app-title a { text-decoration: none; }
.version { margin: .25rem 0 0; font-size: .875rem; overflow-wrap: anywhere; }
.description { margin: 1.25rem 0; overflow-wrap: anywhere; }
.install { margin-top: 1.5rem; padding-top: 1.25rem; border-top: 1px solid var(--color-base-300); }
h3 { margin: 0; font-size: .875rem; }
.install p { margin: .5rem 0 1rem; font-size: .875rem; overflow-wrap: anywhere; }
.catalog-url { display: flex; flex-wrap: wrap; align-items: center; gap: .75rem; }
.catalog-url code { flex: 1 1 14rem; min-width: 0; padding: .625rem .75rem; border: 1px solid var(--color-base-300); border-radius: var(--radius-field); background: var(--color-base-200); font-size: .8rem; overflow-wrap: anywhere; user-select: all; }
button { min-height: 44px; padding: .625rem .875rem; border: 1px solid var(--color-primary); border-radius: var(--radius-field); background: var(--color-primary); color: var(--color-primary-content); font: inherit; font-size: .875rem; cursor: pointer; }
button:hover { filter: brightness(1.1); }
button:focus-visible, a:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 3px; }
.copy-status { min-height: 1.65em; margin: 1rem 0 0; font-size: .875rem; }
@media (max-width: 480px) { main { padding: 2rem 1rem; } .app-card { padding: 1.125rem; } header { margin-bottom: 1.5rem; } }
</style>
</head>
<body>
<main>
<header><h1>${escape(CATALOG_NAME)}</h1><p>Binette で使えるアプリを集めました。提供リストの URL を追加して、アプリをインストールできます。</p>${copyControl()}<p class="copy-status" role="status" aria-live="polite"></p></header>
<ul class="apps">
${cards}
</ul>
</main>
<script type="application/json" id="binette-apps">${list.replace(/</g, "\\u003c")}</script>
<script>
document.querySelectorAll('.copy-url').forEach(function (button) {
  button.addEventListener('click', async function () {
    var status = document.querySelector('.copy-status');
    try {
      await navigator.clipboard.writeText(button.previousElementSibling.textContent);
      button.textContent = 'コピーしました';
      status.textContent = '提供リストの URL をコピーしました。';
      setTimeout(function () { button.textContent = 'URL をコピー'; }, 2000);
    } catch {
      status.textContent = 'コピーできませんでした。URL を選択してコピーしてください。';
      var selection = window.getSelection();
      if (selection) {
        var range = document.createRange();
        range.selectNodeContents(button.previousElementSibling);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
  });
});
</script>
</body>
</html>
`;
}

export async function writeCatalog(root: string, output: string): Promise<void> {
  const entries = await catalogEntries(root);
  await Deno.mkdir(output, { recursive: true });
  await Deno.writeTextFile(resolve(output, "apps.json"), JSON.stringify({ name: CATALOG_NAME, apps: entries }, null, 2) + "\n");
  await Deno.writeTextFile(resolve(output, "index.html"), catalogHtml(entries));
}

if (import.meta.main) {
  if (Deno.args.length !== 1 || !Deno.args[0]) throw new Error("Usage: deno task catalog <outDir>");
  await writeCatalog(resolve(import.meta.dirname!, ".."), resolve(Deno.args[0]));
}
