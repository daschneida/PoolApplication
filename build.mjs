// Builds docs/index.html: one self-contained file (styles, vendored React/Recharts, seed
// data and the app bundle all inlined) plus the icons and manifest copied beside it.
// GitHub Pages serves docs/, so deploying is still "commit index.html".
import { build, context } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync } from "node:fs";

const watch = process.argv.includes("--watch");
const OUT = "docs";

async function assemble(bundleCode) {
  const template = readFileSync("template/index.html", "utf8");
  const styles = readFileSync("src/styles.css", "utf8");
  const vendor = readdirSync("vendor").sort().map(f => `<script>${readFileSync(`vendor/${f}`, "utf8").trim()}</script>`).join("\n");
  // function replacers: minified code contains "$&"-style sequences that String.replace would expand
  const html = template
    .replace("<!-- STYLES -->", () => `<style>\n${styles}</style>`)
    .replace("<!-- VENDOR -->", () => vendor)
    .replace("<!-- APP -->", () => `<script>\n${bundleCode}</script>`);
  if ((html.match(/<\/script>/g) || []).length !== (html.match(/<script>/g) || []).length - 1) throw new Error("script tag imbalance in assembled page");
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/index.html`, html);
  for (const f of readdirSync("static")) copyFileSync(`static/${f}`, `${OUT}/${f}`);
  console.log(`built ${OUT}/index.html (${(html.length / 1024).toFixed(0)} KB)`);
}

const options = {
  entryPoints: ["src/main.js"],
  bundle: true,
  format: "iife",
  target: ["es2020", "safari14"],
  write: false,
  minify: false,
  legalComments: "none",
  loader: { ".json": "json" }
};

if (watch) {
  const ctx = await context({ ...options, plugins: [{ name: "assemble", setup(b) { b.onEnd(async r => { if (!r.errors.length) await assemble(r.outputFiles[0].text); }); } }] });
  await ctx.watch();
  console.log("watching src/ ...");
} else {
  const r = await build(options);
  await assemble(r.outputFiles[0].text);
}
