#!/usr/bin/env bun
/**
 * Rasterize the social card.
 *
 * `assets/og.svg` is the editable source; `assets/og.png` is what GitHub, npm
 * and Slack actually fetch, so it is committed alongside the source.
 *
 * Run: bun run og
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Resvg } from "@resvg/resvg-js";

const WIDTH = 1200;
const HEIGHT = 630;

export function svgPath(root: string): string {
  return resolve(root, "assets/og.svg");
}

export function pngPath(root: string): string {
  return resolve(root, "assets/og.png");
}

export function renderOgPng(svg: string): Uint8Array {
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: WIDTH },
    font: {
      loadSystemFonts: true,
      defaultFontFamily: "Segoe UI",
    },
    background: "#FBFAF7",
  });
  return resvg.render().asPng();
}

async function main(): Promise<void> {
  const root = resolve(import.meta.dir, "..");
  const source = svgPath(root);
  const target = pngPath(root);

  const svg = await readFile(source, "utf8");
  const png = renderOgPng(svg);

  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, png);

  console.log(`wrote ${target} (${WIDTH}x${HEIGHT}, ${png.byteLength} bytes)`);
}

if (import.meta.main) {
  await main();
}
