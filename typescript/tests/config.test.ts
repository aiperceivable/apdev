import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect } from "vitest";
import { loadConfig } from "../src/config.js";

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), "apdev-test-"));
}

describe("loadConfig", () => {
  it("loads config from package.json apdev field", () => {
    const dir = makeTmpDir();
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({
        name: "test",
        apdev: { base_package: "myproject", src_dir: "src" },
      }),
    );
    const cfg = loadConfig(dir);
    expect(cfg["base_package"]).toBe("myproject");
    expect(cfg["src_dir"]).toBe("src");
  });

  it("returns empty object when package.json does not exist", () => {
    const dir = makeTmpDir();
    const cfg = loadConfig(dir);
    expect(cfg).toEqual({});
  });

  it("returns empty object when apdev section is absent", () => {
    const dir = makeTmpDir();
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name: "something" }),
    );
    const cfg = loadConfig(dir);
    expect(cfg).toEqual({});
  });

  it("preserves all fields from apdev section", () => {
    const dir = makeTmpDir();
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({
        name: "test",
        apdev: { base_package: "myproject", custom_key: "custom_value" },
      }),
    );
    const cfg = loadConfig(dir);
    expect(cfg["base_package"]).toBe("myproject");
    expect(cfg["custom_key"]).toBe("custom_value");
  });
});
