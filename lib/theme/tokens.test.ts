import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(fileURLToPath(new URL("../../app/globals.css", import.meta.url)), "utf8");

function declarations(block: string): string[] {
  return block
    .split(";")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("--") || line.startsWith("color-scheme"))
    .sort();
}

function blockAfter(marker: string): string {
  const start = css.indexOf(marker);
  expect(start, `selector ${marker} not found`).toBeGreaterThanOrEqual(0);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  return css.slice(open + 1, close);
}

describe("theme tokens", () => {
  it("system-dark and forced-dark blocks define the same values", () => {
    const system = declarations(blockAfter(':root:not([data-theme="light"])'));
    const forced = declarations(blockAfter(':root[data-theme="dark"]'));
    expect(system.length).toBeGreaterThan(20);
    expect(forced).toEqual(system);
  });

  it("every dark token overrides an existing light token", () => {
    const light = new Set(
      declarations(blockAfter("@theme"))
        .filter((d) => d.startsWith("--color-"))
        .map((d) => d.split(":")[0]),
    );
    const dark = declarations(blockAfter(':root[data-theme="dark"]'))
      .filter((d) => d.startsWith("--color-"))
      .map((d) => d.split(":")[0]);
    for (const name of dark) expect(light, name).toContain(name);
  });
});
