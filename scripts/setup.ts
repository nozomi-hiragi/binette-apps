const root = new URL("../", import.meta.url);
const directory = new URL(".binette/", root);
const repository = "https://github.com/nozomi-hiragi/binette.git";

async function git(args: string[]): Promise<string> {
  const result = await new Deno.Command("git", { cwd: root, args, stdout: "piped", stderr: "piped" }).output();
  if (!result.success) throw new Error(new TextDecoder().decode(result.stderr).trim());
  return new TextDecoder().decode(result.stdout).trim();
}

/** Keep the SDK checkout at the release selected by binette.json. */
export async function setup(): Promise<void> {
  const { tag } = JSON.parse(await Deno.readTextFile(new URL("binette.json", root)));
  if (typeof tag !== "string" || !/^v\d+\.\d+\.\d+$/.test(tag)) throw new Error("binette.json must select a release tag.");
  let exists = false;
  try { exists = (await Deno.stat(directory)).isDirectory; }
  catch (error) { if (!(error instanceof Deno.errors.NotFound)) throw error; }
  if (!exists) await git(["clone", "--depth", "1", "--branch", tag, repository, ".binette"]);
  const [head, target, origin, changes] = await Promise.all([
    git(["-C", ".binette", "rev-parse", "HEAD"]),
    git(["-C", ".binette", "rev-parse", `refs/tags/${tag}^{commit}`]),
    git(["-C", ".binette", "remote", "get-url", "origin"]),
    git(["-C", ".binette", "status", "--porcelain", "--untracked-files=no"]),
  ]);
  if (head !== target || origin !== repository || changes) {
    throw new Error("The .binette checkout differs from the selected release. Move it aside and run setup again.");
  }
  for (const path of ["packages/regie/src/cli.ts", "packages/regie/src/build.ts", "packages/replique/src/index.ts"]) {
    await Deno.stat(new URL(path, directory));
  }
  console.log(`Binette ${tag}: ${head}`);
}

if (import.meta.main) await setup();
