/* Núcleo compartilhado: carrega o design system, o motor de layout,
   o construtor de prompt e o lint — todos a partir dos mesmos arquivos
   que o artifact publicado inlina. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const layout = require("./layout/engine.cjs");
export const prompt = require("./copy/prompt.cjs");
export const lint = require("./copy/lint.cjs");

export const brand = JSON.parse(fs.readFileSync(path.join(RAIZ, "brand", "brand.json"), "utf8"));

export const CSS_SLIDES = fs.readFileSync(path.join(RAIZ, "src", "layout", "slides.css"), "utf8");

/** Lê .env sem dependência externa. Variáveis já definidas no ambiente vencem. */
export function carregarEnv(arquivo = path.join(RAIZ, ".env")) {
  if (!fs.existsSync(arquivo)) return process.env;
  for (const linha of fs.readFileSync(arquivo, "utf8").split("\n")) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    const valor = m[2].replace(/^["']|["']$/g, "");
    if (process.env[m[1]] === undefined || process.env[m[1]] === "") process.env[m[1]] = valor;
  }
  return process.env;
}

export function slug(s) {
  return String(s || "carrossel")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "carrossel";
}

export function garantirPasta(p) {
  fs.mkdirSync(p, { recursive: true });
  return p;
}

/** Extrai o primeiro objeto JSON completo de uma resposta de modelo. */
export function extrairJSON(texto) {
  if (!texto) throw new Error("resposta vazia do modelo");
  let t = String(texto).trim();
  const cerca = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (cerca) t = cerca[1].trim();
  const inicio = t.indexOf("{");
  if (inicio < 0) throw new Error("nenhum JSON encontrado na resposta:\n" + t.slice(0, 400));
  let nivel = 0, dentro = false, escapa = false;
  for (let i = inicio; i < t.length; i++) {
    const c = t[i];
    if (escapa) { escapa = false; continue; }
    if (c === "\\") { escapa = true; continue; }
    if (c === '"') { dentro = !dentro; continue; }
    if (dentro) continue;
    if (c === "{") nivel++;
    else if (c === "}" && --nivel === 0) return JSON.parse(t.slice(inicio, i + 1));
  }
  throw new Error("JSON incompleto na resposta do modelo");
}

export const cores = {
  ok: (s) => `\x1b[32m${s}\x1b[0m`,
  erro: (s) => `\x1b[31m${s}\x1b[0m`,
  aviso: (s) => `\x1b[33m${s}\x1b[0m`,
  fraco: (s) => `\x1b[2m${s}\x1b[0m`,
  forte: (s) => `\x1b[1m${s}\x1b[0m`
};

export function log(...a) { console.log(...a); }
export function passo(txt) { console.log(cores.forte("▸ ") + txt); }
