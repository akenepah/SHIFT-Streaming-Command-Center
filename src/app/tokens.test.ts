/**
 * Guards the design tokens (locked Powerplay palette): resolves --shift-* values from globals.css and
 * checks the contrast of the pairings the UI actually uses. A retheme that
 * breaks accessibility fails here.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(fileURLToPath(new URL("./globals.css", import.meta.url)), "utf8");
const root = css.slice(css.indexOf(":root {"), css.indexOf("@theme inline {"));
const vars = new Map<string, string>();
for (const m of root.matchAll(/(--shift-[\w-]+):\s*([^;]+);/g)) vars.set(m[1], m[2].trim());

function resolve(name: string, depth = 0): string {
  const v = vars.get(name);
  if (!v) throw new Error(`Unknown token ${name}`);
  const ref = /^var\((--shift-[\w-]+)\)$/.exec(v);
  if (ref && depth < 10) return resolve(ref[1], depth + 1);
  return v;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(resolve(a)), luminance(resolve(b))].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

describe("SHIFT brand tokens", () => {
  it("keeps the locked Powerplay anchors", () => {
    expect(resolve("--shift-brand-blue")).toBe("#2563eb");
    expect(resolve("--shift-brand-navy")).toBe("#0b1425");
    expect(resolve("--shift-brand-slate")).toBe("#334155");
    expect(resolve("--shift-brand-coral")).toBe("#fb7185");
    expect(resolve("--shift-brand-coral-text")).toBe("#9f2346");
    expect(resolve("--shift-brand-canvas")).toBe("#f7f7f7");
  });

  it("maps primary, navigation, canvas and accent roles to the brand", () => {
    expect(resolve("--shift-primary")).toBe("#2563eb");
    expect(resolve("--shift-nav")).toBe("#0b1425");
    expect(resolve("--shift-bg")).toBe("#f7f7f7");
    expect(resolve("--shift-accent")).toBe("#fb7185");
    // Coral is an accent, never the danger color.
    expect(resolve("--shift-danger")).not.toBe(resolve("--shift-accent"));
  });

  it.each([
    // [foreground, background, minimum ratio]
    ["--shift-text", "--shift-bg", 4.5],
    ["--shift-text-secondary", "--shift-surface", 4.5],
    ["--shift-text-muted", "--shift-surface", 4.5],
    ["--shift-text-muted", "--shift-bg", 4.5],
    ["--shift-on-primary", "--shift-primary", 4.5],
    ["--shift-on-primary", "--shift-primary-hover", 4.5],
    ["--shift-primary-strong", "--shift-surface", 4.5],
    ["--shift-primary-strong", "--shift-primary-soft", 4.5],
    ["--shift-secondary", "--shift-secondary-soft", 4.5],
    ["--shift-on-primary", "--shift-primary-pressed", 4.5],
    ["--shift-accent-strong", "--shift-bg", 4.5],
    ["--shift-opp-very-high", "--shift-surface", 3],
    ["--shift-opp-strong", "--shift-surface", 3],
    ["--shift-opp-moderate", "--shift-surface", 3],
    ["--shift-opp-limited", "--shift-surface", 3],
    ["--shift-opp-none", "--shift-surface", 3],
    ["--shift-accent-strong", "--shift-accent-soft", 4.5],
    ["--shift-nav-text", "--shift-nav", 4.5],
    ["--shift-nav-text-muted", "--shift-nav", 4.5],
    ["--shift-on-primary", "--shift-nav-accent", 4.5],
    ["--shift-warning-strong", "--shift-warning-soft", 4.5],
    ["--shift-danger", "--shift-danger-soft", 4.5],
    ["--shift-success", "--shift-success-soft", 4.5],
    ["--shift-pos-g", "--shift-pos-g-soft", 4.5],
    ["--shift-pos-c", "--shift-pos-c-soft", 4.5],
    ["--shift-focus", "--shift-surface", 3],
    ["--shift-focus", "--shift-bg", 3],
  ])("%s on %s meets %s:1", (fg, bg, min) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(min);
  });
});
