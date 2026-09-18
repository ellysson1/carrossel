#!/usr/bin/env node
/* Monta artifact/index.html a partir de artifact/app.html, injetando os
   MESMOS arquivos que a CLI usa: brand.json, slides.css, engine.cjs,
   prompt.cjs e lint.cjs. Regra escrita uma vez, aplicada nos dois lugares. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ler = (...p) => fs.readFileSync(path.join(RAIZ, ...p), "utf8");

const fonte = ler("artifact", "app.html");
const brand = JSON.parse(ler("brand", "brand.json"));

const html = fonte
  .replace("<!--INJETAR:CSS-SLIDES-->", `<style>\n${ler("src", "layout", "slides.css")}</style>`)
  .replace("<!--INJETAR:ENGINE-->", `<script>\n${ler("src", "layout", "engine.cjs")}</script>`)
  .replace("<!--INJETAR:PROMPT-->", `<script>\n${ler("src", "copy", "prompt.cjs")}</script>`)
  .replace("<!--INJETAR:LINT-->", `<script>\n${ler("src", "copy", "lint.cjs")}</script>`)
  .replace("/*INJETAR:BRAND*/ {}", JSON.stringify(brand));

for (const marca of ["INJETAR:CSS-SLIDES", "INJETAR:ENGINE", "INJETAR:PROMPT", "INJETAR:LINT", "INJETAR:BRAND"]) {
  if (html.includes(marca)) throw new Error(`marcador não substituído: ${marca}`);
}
if (html.includes("</script>", html.indexOf("var brand =")) === false) throw new Error("estrutura inesperada");

const destino = path.join(RAIZ, "artifact", "index.html");
fs.writeFileSync(destino, html);
console.log(`artifact/index.html · ${(html.length / 1024).toFixed(0)} KB`);
