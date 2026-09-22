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

/* Onde este projeto mora dentro do OneDrive (ex.: "Documentos/carrossel").
   A página publicada lê as entregas do PC por esse caminho, pelo conector do
   Microsoft 365. Fora do OneDrive, o botão "Trazer do PC" não aparece. */
const raizOneDrive = [process.env.OneDriveCommercial, process.env.OneDrive]
  .filter(Boolean)
  .map((p) => path.resolve(p))
  .find((p) => RAIZ.toLowerCase().startsWith(p.toLowerCase() + path.sep));
if (raizOneDrive) {
  brand.ponte = Object.assign({}, brand.ponte, {
    onedriveBase: path.relative(raizOneDrive, RAIZ).split(path.sep).join("/")
  });
}

/* Logo largado na raiz do projeto (Logo.png) entra no lugar certo sozinho:
   o selo da capa. Ninguém precisa saber onde o arquivo deveria morar. */
const destinoLogo = path.join(RAIZ, (brand.selo && brand.selo.arquivo) || "brand/logo.png");
if (!fs.existsSync(destinoLogo)) {
  const solto = ["Logo.png", "logo.png", "Logo.jpg", "logo.jpg", "Logo.svg", "logo.svg"]
    .map((n) => path.join(RAIZ, n))
    .find((p) => fs.existsSync(p));
  if (solto) {
    fs.mkdirSync(path.dirname(destinoLogo), { recursive: true });
    fs.copyFileSync(solto, destinoLogo);
    console.log(`logo: ${path.basename(solto)} → ${path.relative(RAIZ, destinoLogo)}`);
  }
}

function logoEmDataUrl() {
  if (!fs.existsSync(destinoLogo)) return "null";
  const tipo = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
                 ".webp": "image/webp", ".svg": "image/svg+xml" }[path.extname(destinoLogo).toLowerCase()];
  if (!tipo) return "null";
  const bytes = fs.readFileSync(destinoLogo);
  if (bytes.length > 2 * 1024 * 1024) {
    console.log("logo: arquivo acima de 2 MB, mantendo o selo de texto. Salve uma versão menor.");
    return "null";
  }
  return JSON.stringify(`data:${tipo};base64,${bytes.toString("base64")}`);
}

const html = fonte
  .replace("<!--INJETAR:CSS-SLIDES-->", `<style>\n${ler("src", "layout", "slides.css")}</style>`)
  .replace("<!--INJETAR:ENGINE-->", `<script>\n${ler("src", "layout", "engine.cjs")}</script>`)
  .replace("<!--INJETAR:PROMPT-->", `<script>\n${ler("src", "copy", "prompt.cjs")}</script>`)
  .replace("<!--INJETAR:LINT-->", `<script>\n${ler("src", "copy", "lint.cjs")}</script>`)
  .replace("/*INJETAR:BRAND*/ {}", JSON.stringify(brand))
  .replace("/*INJETAR:LOGO*/ null", logoEmDataUrl());

for (const marca of ["INJETAR:CSS-SLIDES", "INJETAR:ENGINE", "INJETAR:PROMPT", "INJETAR:LINT", "INJETAR:BRAND", "INJETAR:LOGO"]) {
  if (html.includes(marca)) throw new Error(`marcador não substituído: ${marca}`);
}
if (html.includes("</script>", html.indexOf("var brand =")) === false) throw new Error("estrutura inesperada");

const destino = path.join(RAIZ, "artifact", "index.html");
fs.writeFileSync(destino, html);
console.log(`artifact/index.html · ${(html.length / 1024).toFixed(0)} KB`);
