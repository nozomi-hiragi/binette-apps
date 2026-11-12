import { assert, assertEquals, assertRejects } from "@std/assert";
import { resolve } from "@std/path";
import { catalogEntries, catalogHtml, CATALOG_NAME, REPOSITORY, writeCatalog } from "./catalog.ts";
import { computeAppMetadata, readRepliqueLibraries } from "../.binette/packages/regie/src/cli.ts";

async function git(root: string, ...args: string[]): Promise<string> {
  const result = await new Deno.Command("git", {
    cwd: root, args: ["-c", "user.name=Catalog test", "-c", "user.email=catalog@example.invalid", "-c", "commit.gpgsign=false", "-c", "tag.gpgsign=false", ...args],
    stdout: "piped", stderr: "piped",
  }).output();
  assert(result.success, new TextDecoder().decode(result.stderr));
  return new TextDecoder().decode(result.stdout).trim();
}

async function fixture(run: (root: string) => Promise<void>): Promise<void> {
  const root = await Deno.makeTempDir({ prefix: "binette-apps-test-" });
  try {
    await git(root, "init", "--initial-branch=main");
    await Deno.mkdir(resolve(root, "example"));
    await Deno.writeTextFile(resolve(root, "example", "main.ts"), 'import { App, launch } from "jsr:@binette/replique";\nclass Example extends App {}\nlaunch(new Example());\n');
    await manifest(root, "1.0.0");
    await commit(root);
    await run(root);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
}

function manifest(root: string, version: string, id = "example"): Promise<void> {
  return Deno.writeTextFile(resolve(root, "example", "app.json"), JSON.stringify({ id, version, binette: "0.2", name: "Example", entry: { as: "main.ts" } }));
}

async function commit(root: string): Promise<string> {
  await git(root, "add", ".");
  await git(root, "commit", "-m", "Fixture");
  return git(root, "rev-parse", "HEAD");
}

Deno.test("one release uses its tagged tree for source, version, integrity and requirements", () => fixture(async root => {
  const sha = await git(root, "rev-parse", "HEAD");
  await git(root, "tag", "-a", "example/v1.0.0", "-m", "Release");
  const expected = await computeAppMetadata(resolve(root, "example"), {
    libraries: await readRepliqueLibraries(new URL("../.binette/packages/replique/", import.meta.url)),
  });
  await manifest(root, "9.0.0");
  await Deno.writeTextFile(resolve(root, "example", "main.ts"), "invalid untagged code");
  await commit(root);
  const entries = await catalogEntries(root);
  assertEquals(entries.length, 1);
  assertEquals(entries[0], { id: "example", name: "Example", version: "1.0.0", source: `https://raw.githubusercontent.com/${REPOSITORY}/${sha}/example/`, ...expected });
  assert(/^sha256-[A-Za-z0-9+/]{43}=$/.test(entries[0].integrity["/"]));
  assert(Object.keys(entries[0].requires!).length > 0);
  const output = resolve(root, "output");
  await writeCatalog(root, output);
  const list = JSON.parse(await Deno.readTextFile(resolve(output, "apps.json")));
  const html = await Deno.readTextFile(resolve(output, "index.html"));
  assert(html.includes('<link rel="binette-apps" href="apps.json">'));
  assertEquals(JSON.parse(/<script type="application\/json" id="binette-apps">(.*?)<\/script>/s.exec(html)![1]), list);
  assertEquals(list, { name: CATALOG_NAME, apps: entries });
}));

Deno.test("two releases select the greatest semantic version, not lexical order or HEAD", () => fixture(async root => {
  await manifest(root, "1.10.0");
  const newest = await commit(root);
  await git(root, "tag", "example/v1.10.0");
  await manifest(root, "1.9.0");
  await commit(root);
  await git(root, "tag", "example/v1.9.0");
  const entries = await catalogEntries(root);
  assertEquals(entries.length, 1);
  assertEquals(entries[0].version, "1.10.0");
  assert(entries[0].source.includes(newest));
}));

Deno.test("apps without a release tag are omitted", () => fixture(async root => {
  await git(root, "tag", "unrelated");
  assertEquals(await catalogEntries(root), []);
}));

Deno.test("releasing a second app retains the first app and omits untagged apps", () => fixture(async root => {
  await git(root, "tag", "example/v1.0.0");
  for (const id of ["second", "unreleased"]) {
    await Deno.mkdir(resolve(root, id));
    await Deno.copyFile(resolve(root, "example", "main.ts"), resolve(root, id, "main.ts"));
    await Deno.writeTextFile(resolve(root, id, "app.json"), JSON.stringify({ id, name: id, version: "1.0.0", binette: "0.2", entry: { as: "main.ts" } }));
  }
  const sha = await commit(root);
  await git(root, "tag", "second/v1.0.0");
  const entries = await catalogEntries(root);
  assertEquals(entries.map(entry => entry.id), ["example", "second"]);
  assert(entries[1].source.endsWith(`/${sha}/second/`));
}));

Deno.test("a stable version outranks its prerelease", () => fixture(async root => {
  await git(root, "tag", "example/v1.0.0");
  await manifest(root, "1.0.0-rc.1");
  await commit(root);
  await git(root, "tag", "example/v1.0.0-rc.1");
  assertEquals((await catalogEntries(root))[0].version, "1.0.0");
}));

Deno.test("a release tag with a mismatched app.json version fails", () => fixture(async root => {
  await git(root, "tag", "example/v2.0.0");
  await assertRejects(() => catalogEntries(root), Error, "app.json version 1.0.0 does not match 2.0.0");
}));

Deno.test("a release tag with a mismatched app ID fails", () => fixture(async root => {
  await git(root, "tag", "other/v1.0.0");
  await assertRejects(() => catalogEntries(root), Error, "expected exactly one app with id other");
}));

Deno.test("HTML escapes markup and its embedded JSON remains readable", () => {
  const entry = { id: "example", version: "1.0.0", source: "https://example.com/", name: "</script><b>&", integrity: {} };
  const html = catalogHtml([entry]);
  assert(!html.includes(entry.name));
  assertEquals(JSON.parse(/<script type="application\/json" id="binette-apps">(.*?)<\/script>/s.exec(html)![1]).apps, [entry]);
});
