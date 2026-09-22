#!/usr/bin/env node
/* Traz para o disco um pedido feito pelo celular (um JSON salvo à mão).

     node scripts/importar-pedido.js <pedido.json>

   O caminho normal é o botão "Buscar pedidos do celular" do app local, que
   usa a mesma função (src/ponte.js). Sai uma pasta em out/ igual à que a CLI
   cria, pronta para `carrossel imagens` e `carrossel render`. */
import fs from "node:fs";
import path from "node:path";
import { cores } from "../src/nucleo.js";
import { importarPedido } from "../src/ponte.js";

const arquivo = process.argv[2];
if (!arquivo) {
  console.error("uso: importar-pedido.js <pedido.json>");
  process.exit(1);
}

let r;
try {
  r = importarPedido(JSON.parse(fs.readFileSync(path.resolve(arquivo), "utf8")));
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

console.log(JSON.stringify({
  pasta: path.relative(process.cwd(), r.pasta),
  tema: r.tema,
  slides: r.carrossel.slides.length,
  comPromptDeImagem: r.carrossel.slides.filter((s) => s.imagem && s.imagem.prompt).length
}, null, 2));
console.log(cores.fraco(`\nagora: node bin/carrossel.js imagens ${path.relative(process.cwd(), r.pasta)}`));
