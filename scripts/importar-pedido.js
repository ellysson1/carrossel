#!/usr/bin/env node
/* Traz para o disco um pedido feito pelo celular.

   O artifact grava os pedidos na coleção `pedidos` do próprio banco. O Claude, em
   sessão no seu PC, lê essa coleção com a ferramenta de dados (salvando cada
   documento como JSON) e passa o arquivo para cá:

     node scripts/importar-pedido.js <pedido.json>

   Sai uma pasta em out/ igual à que a CLI cria, pronta para
   `carrossel imagens` e `carrossel render`. */
import fs from "node:fs";
import path from "node:path";
import { RAIZ, slug, garantirPasta, cores } from "../src/nucleo.js";

const arquivo = process.argv[2];
if (!arquivo) {
  console.error("uso: importar-pedido.js <pedido.json>");
  process.exit(1);
}

const doc = JSON.parse(fs.readFileSync(path.resolve(arquivo), "utf8"));
const carrossel = doc.carrossel || doc.data?.carrossel || doc;
if (!carrossel || !Array.isArray(carrossel.slides) || !carrossel.slides.length) {
  console.error("esse arquivo não tem um carrossel dentro (esperava {carrossel:{slides:[…]}})");
  process.exit(1);
}

const tema = (carrossel.meta || {}).tema || doc.tema || "pedido do celular";
const dia = new Date(Number(doc.criadoEm) || Date.now()).toISOString().slice(0, 10);
const pasta = garantirPasta(path.join(RAIZ, "out", `${dia}-${slug(tema)}`));

// imagens que vieram do acervo do artifact não existem aqui: o gerador local as refaz
for (const s of carrossel.slides) {
  if (s.imagem) {
    delete s.imagem.url;
    delete s.imagem.assetId;
    delete s.imagem.dataUrl;
  }
}

fs.writeFileSync(path.join(pasta, "carrossel.json"), JSON.stringify(carrossel, null, 2));
fs.writeFileSync(
  path.join(pasta, "legenda.txt"),
  [carrossel.legenda || "", "", (carrossel.hashtags || []).join(" ")].join("\n").trim() + "\n"
);

console.log(JSON.stringify({
  pasta: path.relative(process.cwd(), pasta),
  tema,
  slides: carrossel.slides.length,
  comPromptDeImagem: carrossel.slides.filter((s) => s.imagem && s.imagem.prompt).length
}, null, 2));
console.log(cores.fraco(`\nagora: node bin/carrossel.js imagens ${path.relative(process.cwd(), pasta)}`));
