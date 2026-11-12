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
  const rows = entries.map(entry => `<li><strong>${escape(entry.name ?? entry.id)}</strong> <code>${escape(entry.version)}</code>` +
    (entry.description ? `<br>${escape(entry.description)}` : "") + "</li>").join("\n");
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(CATALOG_NAME)}</title>
<link rel="binette-apps" href="apps.json">
<style>
:root { color-scheme: light dark; font-family: system-ui, sans-serif; }
body { max-width: 40rem; margin: 0 auto; padding: 2rem 1rem; line-height: 1.6; }
li { margin: .75rem 0; }
code { overflow-wrap: anywhere; }
</style>
</head>
<body>
<h1>${escape(CATALOG_NAME)}</h1>
<p>Binette の提供リストです。Binette の「アプリ」の「リスト」に、このページの URL（<code>${escape(CATALOG_URL)}</code>）を追加すると入れられます。</p>
<ul>
${rows}
</ul>
<script type="application/json" id="binette-apps">${list.replace(/</g, "\\u003c")}</script>
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
