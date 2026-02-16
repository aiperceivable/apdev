/**
 * Circular import detection tool.
 *
 * Builds a module-level dependency graph within a JS/TS package
 * and reports any circular import chains.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep, extname, basename } from "node:path";
import ts from "typescript";

const SUPPORTED_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
]);

/** Convert a file path to a dotted module name (relative to srcDir). */
export function fileToModule(filePath: string, srcDir: string): string {
  const rel = relative(srcDir, filePath);
  const parts = rel.split(sep);
  const last = parts[parts.length - 1];

  if (last === "index.ts" || last === "index.js" || last === "index.tsx" || last === "index.jsx") {
    parts.pop();
  } else {
    const ext = extname(last);
    parts[parts.length - 1] = basename(last, ext);
  }

  return parts.join(".");
}

/** Extract import specifiers from a TypeScript/JavaScript source file. */
export function extractImports(source: string, fileName: string): Set<string> {
  const imports = new Set<string>();

  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".tsx") || fileName.endsWith(".jsx")
      ? ts.ScriptKind.TSX
      : undefined,
  );

  function visit(node: ts.Node): void {
    // import ... from 'x' / import 'x'
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      imports.add(node.moduleSpecifier.text);
    }

    // export { ... } from 'x'
    if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      imports.add(node.moduleSpecifier.text);
    }

    // require('x')
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.Identifier &&
      (node.expression as ts.Identifier).text === "require" &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      imports.add(node.arguments[0].text);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return imports;
}

/** Filter imports to those within the base package. */
export function resolveImports(
  rawImports: Set<string>,
  basePackage: string,
): Set<string> {
  const resolved = new Set<string>();
  for (const imp of rawImports) {
    if (imp === basePackage || imp.startsWith(basePackage + "/")) {
      // Convert path-style to dot-style: "pkg/sub/mod" -> "pkg.sub.mod"
      resolved.add(imp.replaceAll("/", "."));
    }
  }
  return resolved;
}

/** Recursively find all supported source files under a directory. */
function findSourceFiles(dir: string): string[] {
  const results: string[] = [];

  function walk(d: string): void {
    const entries = readdirSync(d);
    for (const entry of entries) {
      if (entry === "node_modules" || entry === "dist" || entry === ".git") {
        continue;
      }
      const full = join(d, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        walk(full);
      } else if (SUPPORTED_EXTENSIONS.has(extname(entry))) {
        results.push(full);
      }
    }
  }

  walk(dir);
  return results;
}

/** Build a module-to-module dependency graph for the given package. */
export function buildDependencyGraph(
  srcDir: string,
  basePackage: string,
): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();
  const files = findSourceFiles(srcDir);

  for (const file of files) {
    const moduleName = fileToModule(file, srcDir);
    if (!moduleName) continue;

    let source: string;
    try {
      source = readFileSync(file, "utf-8");
    } catch (e) {
      console.error(`Warning: could not read ${file}: ${e}`);
      continue;
    }

    let rawImports: Set<string>;
    try {
      rawImports = extractImports(source, file);
    } catch (e) {
      console.error(`Warning: could not parse ${file}: ${e}`);
      continue;
    }

    const deps = resolveImports(rawImports, basePackage);
    deps.delete(moduleName);
    graph.set(moduleName, deps);
  }

  return graph;
}

/** Find all elementary cycles in the dependency graph using DFS. */
export function findCycles(
  graph: Map<string, Set<string>>,
): string[][] {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;

  const color = new Map<string, number>();
  const path: string[] = [];
  const cycles: string[][] = [];

  function dfs(node: string): void {
    color.set(node, GRAY);
    path.push(node);

    const neighbors = graph.get(node) ?? new Set<string>();
    for (const neighbor of [...neighbors].sort()) {
      if (color.get(neighbor) === GRAY && path.includes(neighbor)) {
        const idx = path.indexOf(neighbor);
        cycles.push([...path.slice(idx), neighbor]);
      } else if ((color.get(neighbor) ?? WHITE) === WHITE) {
        dfs(neighbor);
      }
    }

    path.pop();
    color.set(node, BLACK);
  }

  for (const node of [...graph.keys()].sort()) {
    if ((color.get(node) ?? WHITE) === WHITE) {
      dfs(node);
    }
  }

  // Deduplicate by normalizing cycle rotation
  const unique: string[][] = [];
  const seen = new Set<string>();

  for (const cycle of cycles) {
    const ring = cycle.slice(0, -1);
    let minVal = ring[0];
    let minIdx = 0;
    for (let i = 1; i < ring.length; i++) {
      if (ring[i] < minVal) {
        minVal = ring[i];
        minIdx = i;
      }
    }
    const normalized = [...ring.slice(minIdx), ...ring.slice(0, minIdx)].join(",");
    if (!seen.has(normalized)) {
      seen.add(normalized);
      unique.push(cycle);
    }
  }

  return unique;
}

/** Run circular import detection. Returns 0 if clean, 1 if cycles found. */
export function checkCircularImports(
  srcDir: string,
  basePackage: string,
): number {
  let stat;
  try {
    stat = statSync(srcDir);
  } catch {
    console.error(`Error: ${srcDir}/ directory not found`);
    return 1;
  }
  if (!stat.isDirectory()) {
    console.error(`Error: ${srcDir}/ is not a directory`);
    return 1;
  }

  const graph = buildDependencyGraph(srcDir, basePackage);
  console.log(`Scanned ${graph.size} modules`);

  const cycles = findCycles(graph);
  if (cycles.length > 0) {
    console.log(`\nFound ${cycles.length} circular import(s):\n`);
    for (let i = 0; i < cycles.length; i++) {
      console.log(`  Cycle ${i + 1}: ${cycles[i].join(" -> ")}`);
    }
    console.log();
    return 1;
  }

  console.log("No circular imports detected.");
  return 0;
}
