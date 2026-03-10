import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect } from "vitest";
import {
  fileToModule,
  extractImports,
  resolveImports,
  buildDependencyGraph,
  findCycles,
} from "../src/check-imports.js";

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), "apdev-test-"));
}

describe("fileToModule", () => {
  it("converts regular .ts file to dotted module name", () => {
    const base = "/project/src";
    expect(fileToModule("/project/src/pkg/sub/mod.ts", base)).toBe("pkg.sub.mod");
  });

  it("converts index.ts to package name without index", () => {
    const base = "/project/src";
    expect(fileToModule("/project/src/pkg/index.ts", base)).toBe("pkg");
  });
});

describe("extractImports", () => {
  it("collects ES module import statements", async () => {
    const source = `
      import os from 'os';
      import { something } from 'pkg/sub';
    `;
    const imports = await extractImports(source, "test.ts");
    expect(imports.has("os")).toBe(true);
    expect(imports.has("pkg/sub")).toBe(true);
  });

  it("collects from...import statements", async () => {
    const source = "import { something } from 'pkg/sub';";
    const imports = await extractImports(source, "test.ts");
    expect(imports.has("pkg/sub")).toBe(true);
  });

  it("collects require() calls", async () => {
    const source = "const x = require('pkg/sub');";
    const imports = await extractImports(source, "test.js");
    expect(imports.has("pkg/sub")).toBe(true);
  });

  it("collects export...from re-exports", async () => {
    const source = "export { foo } from 'pkg/sub';";
    const imports = await extractImports(source, "test.ts");
    expect(imports.has("pkg/sub")).toBe(true);
  });
});

describe("resolveImports", () => {
  // --- Relative import resolution tests ---

  it("resolves ./b from mypkg.a to mypkg.b", () => {
    const raw = new Set(["./b"]);
    const resolved = resolveImports(raw, "mypkg", "mypkg.a", false);
    expect(resolved.has("mypkg.b")).toBe(true);
  });

  it("resolves ../c from mypkg.sub.a to mypkg.c", () => {
    const raw = new Set(["../c"]);
    const resolved = resolveImports(raw, "mypkg", "mypkg.sub.a", false);
    expect(resolved.has("mypkg.c")).toBe(true);
  });

  it("resolves ./b from index (package) mypkg to mypkg.b", () => {
    const raw = new Set(["./b"]);
    const resolved = resolveImports(raw, "mypkg", "mypkg", true);
    expect(resolved.has("mypkg.b")).toBe(true);
  });

  it("ignores relative imports when no currentModule", () => {
    const raw = new Set(["./b"]);
    const resolved = resolveImports(raw, "mypkg");
    expect(resolved.size).toBe(0);
  });

  it("filters out relative imports outside base package", () => {
    const raw = new Set(["../../outside"]);
    const resolved = resolveImports(raw, "mypkg", "mypkg.sub.a", false);
    expect(resolved.size).toBe(0);
  });
});

describe("buildDependencyGraph", () => {
  it("builds graph with no circular imports", async () => {
    const dir = makeTmpDir();
    const pkg = join(dir, "mypkg");
    mkdirSync(pkg);
    writeFileSync(join(pkg, "index.ts"), "");
    writeFileSync(join(pkg, "a.ts"), "import { something } from 'mypkg/b';\n");
    writeFileSync(join(pkg, "b.ts"), "import os from 'os';\n");

    const graph = await buildDependencyGraph(dir, "mypkg");
    expect(graph.get("mypkg.a")?.has("mypkg.b")).toBe(true);
    expect(graph.get("mypkg.b")?.size ?? 0).toBe(0);
  });

  it("detects circular imports", async () => {
    const dir = makeTmpDir();
    const pkg = join(dir, "mypkg");
    mkdirSync(pkg);
    writeFileSync(join(pkg, "index.ts"), "");
    writeFileSync(join(pkg, "a.ts"), "import { something } from 'mypkg/b';\n");
    writeFileSync(join(pkg, "b.ts"), "import { something } from 'mypkg/a';\n");

    const graph = await buildDependencyGraph(dir, "mypkg");
    const cycles = findCycles(graph);
    expect(cycles).toHaveLength(1);
    const cycleModules = new Set(cycles[0].slice(0, -1));
    expect(cycleModules).toEqual(new Set(["mypkg.a", "mypkg.b"]));
  });

  // --- Relative import tests ---

  it("detects circular relative imports (./)", async () => {
    const dir = makeTmpDir();
    const pkg = join(dir, "mypkg");
    mkdirSync(pkg);
    writeFileSync(join(pkg, "index.ts"), "");
    writeFileSync(join(pkg, "a.ts"), "import { something } from './b';\n");
    writeFileSync(join(pkg, "b.ts"), "import { something } from './a';\n");

    const graph = await buildDependencyGraph(dir, "mypkg");
    expect(graph.get("mypkg.a")?.has("mypkg.b")).toBe(true);
    expect(graph.get("mypkg.b")?.has("mypkg.a")).toBe(true);

    const cycles = findCycles(graph);
    expect(cycles).toHaveLength(1);
    const cycleModules = new Set(cycles[0].slice(0, -1));
    expect(cycleModules).toEqual(new Set(["mypkg.a", "mypkg.b"]));
  });

  it("resolves relative imports without cycle", async () => {
    const dir = makeTmpDir();
    const pkg = join(dir, "mypkg");
    mkdirSync(pkg);
    writeFileSync(join(pkg, "index.ts"), "");
    writeFileSync(join(pkg, "a.ts"), "import { something } from './b';\n");
    writeFileSync(join(pkg, "b.ts"), "import os from 'os';\n");

    const graph = await buildDependencyGraph(dir, "mypkg");
    expect(graph.get("mypkg.a")?.has("mypkg.b")).toBe(true);
    expect(findCycles(graph)).toEqual([]);
  });

  it("detects relative import cycles in sub-packages", async () => {
    const dir = makeTmpDir();
    const pkg = join(dir, "mypkg");
    mkdirSync(pkg);
    writeFileSync(join(pkg, "index.ts"), "");
    const sub = join(pkg, "sub");
    mkdirSync(sub);
    writeFileSync(join(sub, "index.ts"), "");
    writeFileSync(join(sub, "a.ts"), "import { something } from './b';\n");
    writeFileSync(join(sub, "b.ts"), "import { something } from './a';\n");

    const graph = await buildDependencyGraph(dir, "mypkg");
    expect(graph.get("mypkg.sub.a")?.has("mypkg.sub.b")).toBe(true);
    expect(graph.get("mypkg.sub.b")?.has("mypkg.sub.a")).toBe(true);

    const cycles = findCycles(graph);
    expect(cycles).toHaveLength(1);
  });
});

describe("findCycles", () => {
  it("returns empty for a DAG", () => {
    const graph = new Map<string, Set<string>>([
      ["a", new Set(["b"])],
      ["b", new Set(["c"])],
      ["c", new Set()],
    ]);
    expect(findCycles(graph)).toEqual([]);
  });

  it("detects a self-referencing module", () => {
    const graph = new Map<string, Set<string>>([["a", new Set(["a"])]]);
    const cycles = findCycles(graph);
    expect(cycles).toHaveLength(1);
  });

  it("deduplicates cycles regardless of starting node", () => {
    const graph = new Map<string, Set<string>>([
      ["a", new Set(["b"])],
      ["b", new Set(["c"])],
      ["c", new Set(["a"])],
    ]);
    const cycles = findCycles(graph);
    expect(cycles).toHaveLength(1);
  });
});
