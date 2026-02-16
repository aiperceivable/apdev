import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect } from "vitest";
import {
  fileToModule,
  extractImports,
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
  it("collects ES module import statements", () => {
    const source = `
      import os from 'os';
      import { something } from 'pkg/sub';
    `;
    const imports = extractImports(source, "test.ts");
    expect(imports.has("os")).toBe(true);
    expect(imports.has("pkg/sub")).toBe(true);
  });

  it("collects from...import statements", () => {
    const source = "import { something } from 'pkg/sub';";
    const imports = extractImports(source, "test.ts");
    expect(imports.has("pkg/sub")).toBe(true);
  });

  it("collects require() calls", () => {
    const source = "const x = require('pkg/sub');";
    const imports = extractImports(source, "test.js");
    expect(imports.has("pkg/sub")).toBe(true);
  });

  it("collects export...from re-exports", () => {
    const source = "export { foo } from 'pkg/sub';";
    const imports = extractImports(source, "test.ts");
    expect(imports.has("pkg/sub")).toBe(true);
  });
});

describe("buildDependencyGraph", () => {
  it("builds graph with no circular imports", () => {
    const dir = makeTmpDir();
    const pkg = join(dir, "mypkg");
    mkdirSync(pkg);
    writeFileSync(join(pkg, "index.ts"), "");
    writeFileSync(join(pkg, "a.ts"), "import { something } from 'mypkg/b';\n");
    writeFileSync(join(pkg, "b.ts"), "import os from 'os';\n");

    const graph = buildDependencyGraph(dir, "mypkg");
    expect(graph.get("mypkg.a")?.has("mypkg.b")).toBe(true);
    expect(graph.get("mypkg.b")?.size ?? 0).toBe(0);
  });

  it("detects circular imports", () => {
    const dir = makeTmpDir();
    const pkg = join(dir, "mypkg");
    mkdirSync(pkg);
    writeFileSync(join(pkg, "index.ts"), "");
    writeFileSync(join(pkg, "a.ts"), "import { something } from 'mypkg/b';\n");
    writeFileSync(join(pkg, "b.ts"), "import { something } from 'mypkg/a';\n");

    const graph = buildDependencyGraph(dir, "mypkg");
    const cycles = findCycles(graph);
    expect(cycles).toHaveLength(1);
    const cycleModules = new Set(cycles[0].slice(0, -1));
    expect(cycleModules).toEqual(new Set(["mypkg.a", "mypkg.b"]));
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
