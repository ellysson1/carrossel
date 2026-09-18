#!/usr/bin/env node
/* Ponte entre a CLI e o artifact publicado.

   Passo 1 — listar as imagens que precisam ir para o acervo do artifact:
     node scripts/preparar-app.js out/<pasta> --listar

   Passo 2 — depois de subir cada imagem e receber a url, montar o documento:
     node scripts/preparar-app.js out/<pasta> --urls '{"img/slide-01-ab.png":"https://…"}'
     node scripts/preparar-app.js out/<pasta> --urls mapa.json

   Grava <pasta>/app-doc.json, pronto para o ArtifactData gravar na coleção
   "carrosseis" — é de lá que o histórico da página lê. */
import fs from "node:fs";
import path from "node:path";
import { slug } from "../src/nucleo.js";

const [, , alvo, modo, valor] = process.argv;

function sair(msg) {
  console.error(msg);
  process.exit(1);
}

if (!alvo || !modo) {
  sair("uso: preparar-app.js <pasta> --listar | --urls <json|arquivo.json>");
}

const pasta = path.resolve(alvo);
const arquivoCarrossel = path.join(pasta, "carrossel.json");
if (!fs.existsSync(arquivoCarrossel)) sair(`não achei carrossel.json em ${pasta}`);
const carrossel = JSON.parse(fs.readFileSync(arquivoCarrossel, "utf8"));

/** Caminhos de imagem citados pelos slides, na ordem. */
function imagensDoCarrossel() {
  const vistos = new Set();
  const lista = [];
  for (const s of carrossel.slides || []) {
    const rel = s.imagem && s.imagem.arquivo;
    if (!rel || vistos.has(rel)) continue;
    const abs = path.join(pasta, rel);
    if (!fs.existsSync(abs)) continue;
    vistos.add(rel);
    lista.push({ relativo: String(rel).split(path.sep).join("/"), absoluto: abs, bytes: fs.statSync(abs).size });
  }
  return lista;
}

if (modo === "--listar") {
  const imagens = imagensDoCarrossel();
  console.log(JSON.stringify({
    pasta: path.relative(process.cwd(), pasta),
    tema: (carrossel.meta || {}).tema || "",
    docId: `${new Date().toISOString().slice(0, 10)}-${slug((carrossel.meta || {}).tema)}`.slice(0, 200),
    imagens: imagens.map((i) => ({ relativo: i.relativo, arquivo: path.relative(process.cwd(), i.absoluto), kb: Math.round(i.bytes / 1024) }))
  }, null, 2));
  process.exit(0);
}

if (modo !== "--urls") sair(`modo desconhecido: ${modo}`);
if (!valor) sair("--urls precisa do mapa {caminho relativo: url}");

let mapa;
try {
  mapa = JSON.parse(fs.existsSync(valor) ? fs.readFileSync(valor, "utf8") : valor);
} catch (e) {
  sair(`não consegui ler o mapa de urls: ${e.message}`);
}

const semUrl = [];
for (const s of carrossel.slides || []) {
  const rel = s.imagem && s.imagem.arquivo;
  if (!rel) continue;
  const chave = String(rel).split(path.sep).join("/");
  const url = mapa[chave] || mapa[path.basename(chave)];
  if (url) s.imagem.url = url;
  else semUrl.push(chave);
}

const meta = carrossel.meta || {};
const docId = `${new Date().toISOString().slice(0, 10)}-${slug(meta.tema)}`.slice(0, 200);
const doc = {
  tema: meta.tema || "sem tema",
  tipo: meta.tipo || "",
  atualizadoEm: Date.now(),
  origem: "cli",
  carrossel
};

const destino = path.join(pasta, "app-doc.json");
fs.writeFileSync(destino, JSON.stringify(doc, null, 2));
fs.writeFileSync(arquivoCarrossel, JSON.stringify(carrossel, null, 2));

console.log(JSON.stringify({
  docId,
  colecao: "carrosseis",
  arquivo: path.relative(process.cwd(), destino),
  imagensSemUrl: semUrl
}, null, 2));
