/* Servidor local — a mesma interface do artifact, rodando na sua máquina.
   Aqui não existe sandbox: a chave fica no .env, a Kie responde, o Chromium
   renderiza e baixar arquivo é só um link. Sem dependência externa.

   Só escuta em 127.0.0.1 (e, com --rede, também na LAN, para abrir no celular). */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { RAIZ, brand, lint, cores, garantirPasta, slug } from "./nucleo.js";
import { gerarCarrossel, gerarSlide, gerarRoteiro } from "./copy/gerar.js";
import { gerarImagens, provedorAtual } from "./images/index.js";
import { renderizarPNGs, escreverPreview, medirAjuste, abrirNavegador } from "./render.js";

const PASTA_OUT = garantirPasta(path.join(RAIZ, "out"));
const TIPOS = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".txt": "text/plain; charset=utf-8"
};

/* A página é escrita para o claude.ai, que monta o <head> por ela. Servindo daqui,
   esse <head> é nosso — sem ele o celular abre a página em largura de desktop. */
const ICONE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<rect width="64" height="64" rx="14" fill="#0D2B5E"/>
<rect x="14" y="20" width="36" height="10" rx="2" fill="#F5C842"/>
<rect x="14" y="34" width="26" height="4" rx="2" fill="#FFFFFF" opacity=".85"/>
<rect x="14" y="42" width="18" height="4" rx="2" fill="#FFFFFF" opacity=".55"/>
</svg>`;

function comCabecalho(html) {
  if (/^\s*<!doctype/i.test(html)) return html;
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0D2B5E">
<meta name="mobile-web-app-capable" content="yes">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/icone.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icone.svg">
<style>
  :root { color-scheme: light dark; padding-top: env(safe-area-inset-top, 0px); padding-bottom: env(safe-area-inset-bottom, 0px); }
  body { margin: 0; font: 14px system-ui, sans-serif; }
  img { max-width: 100%; }
  [hidden] { display: none !important; }
</style>
</head>
<body>
${html}
</body>
</html>`;
}

// ── tarefas em andamento ─────────────────────────────────────────────────────

const tarefas = new Map();
let proximoId = 1;

function novaTarefa(titulo) {
  const id = String(proximoId++);
  const t = { id, titulo, estado: "rodando", etapa: "começando", log: [], resultado: null, erro: null, criadaEm: Date.now() };
  tarefas.set(id, t);
  for (const [k, v] of tarefas) if (Date.now() - v.criadaEm > 3600e3) tarefas.delete(k);
  return t;
}

function anotar(t, texto) {
  t.etapa = texto;
  t.log.push(texto);
  if (t.log.length > 200) t.log.shift();
  console.log(cores.fraco(`   [${t.id}] ${texto}`));
}

// ── utilidades ───────────────────────────────────────────────────────────────

function pastaSegura(nome) {
  const limpo = String(nome || "").replace(/[\\/]+/g, "/").split("/").filter((p) => p && p !== "." && p !== "..").join("/");
  const alvo = path.join(PASTA_OUT, limpo);
  if (!alvo.startsWith(PASTA_OUT + path.sep) && alvo !== PASTA_OUT) throw new Error("caminho inválido");
  return alvo;
}

function lerCarrossel(pasta) {
  return JSON.parse(fs.readFileSync(path.join(pasta, "carrossel.json"), "utf8"));
}

function salvarCarrossel(pasta, c) {
  fs.writeFileSync(path.join(pasta, "carrossel.json"), JSON.stringify(c, null, 2));
  const legenda = [c.legenda || "", "", (c.hashtags || []).join(" ")].join("\n").trim() + "\n";
  fs.writeFileSync(path.join(pasta, "legenda.txt"), legenda);
}

function responder(res, codigo, corpo, tipo = "application/json; charset=utf-8") {
  res.writeHead(codigo, { "content-type": tipo, "cache-control": "no-store" });
  res.end(typeof corpo === "string" || Buffer.isBuffer(corpo) ? corpo : JSON.stringify(corpo));
}

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    let d = "";
    req.on("data", (c) => {
      d += c;
      if (d.length > 8e6) { reject(new Error("corpo grande demais")); req.destroy(); }
    });
    req.on("end", () => {
      try { resolve(d ? JSON.parse(d) : {}); } catch (e) { reject(e); }
    });
  });
}

function listarCarrosseis() {
  if (!fs.existsSync(PASTA_OUT)) return [];
  return fs.readdirSync(PASTA_OUT)
    .filter((n) => fs.existsSync(path.join(PASTA_OUT, n, "carrossel.json")))
    .map((n) => {
      const arq = path.join(PASTA_OUT, n, "carrossel.json");
      let meta = {}, slides = 0;
      try {
        const c = JSON.parse(fs.readFileSync(arq, "utf8"));
        meta = c.meta || {};
        slides = (c.slides || []).length;
      } catch { /* pasta com JSON quebrado: ainda aparece na lista */ }
      const png = path.join(PASTA_OUT, n, "png");
      return {
        pasta: n,
        tema: meta.tema || n,
        tipo: meta.tipo || "",
        slides,
        temPng: fs.existsSync(png) && fs.readdirSync(png).length > 0,
        atualizadoEm: fs.statSync(arq).mtimeMs
      };
    })
    .sort((a, b) => b.atualizadoEm - a.atualizadoEm);
}

/** Abre pasta ou URL no sistema. Se o comando não existir (container, servidor
    sem interface), apenas avisa — nunca derruba o servidor. */
/** URLs desta máquina na rede local — é o que você abre no celular. */
let PORTA_ATUAL = 4173;
function enderecosDaRede() {
  const fora = [];
  for (const lista of Object.values(os.networkInterfaces())) {
    for (const i of lista || []) {
      const privado = i.family === "IPv4" && !i.internal &&
        (/^10\./.test(i.address) || /^192\.168\./.test(i.address) ||
         /^172\.(1[6-9]|2\d|3[01])\./.test(i.address));
      if (privado) fora.push(`http://${i.address}:${PORTA_ATUAL}`);
    }
  }
  return fora;
}

function abrirNoSistema(alvo) {
  const falhou = () => console.log(cores.fraco(`   (abra você mesmo: ${alvo})`));
  try {
    let p;
    if (process.platform === "win32") {
      // `start` é o que abre URL e pasta no Windows; o primeiro "" é o título da janela
      p = spawn("cmd", ["/c", "start", "", alvo.replace(/&/g, "^&")], {
        detached: true, stdio: "ignore", windowsHide: true
      });
    } else {
      p = spawn(process.platform === "darwin" ? "open" : "xdg-open", [alvo], { detached: true, stdio: "ignore" });
    }
    p.on("error", falhou);
    p.unref();
  } catch {
    falhou();
  }
}

// ── ações ────────────────────────────────────────────────────────────────────

const ACOES = {
  async gerar(t, dados) {
    const tema = String(dados.tema || "").trim();
    if (!tema) throw new Error("informe o tema");
    anotar(t, "escrevendo o texto com o Claude (costuma levar 2 minutos)");
    const c = await gerarCarrossel({
      tema,
      tipo: String(dados.tipo || "metodo"),
      nSlides: Number(dados.nSlides) || 9,
      palavraCta: String(dados.palavraCta || brand.palavrasChaveCta[0]).toUpperCase(),
      contexto: dados.contexto ? String(dados.contexto) : null
    });
    const pasta = garantirPasta(path.join(PASTA_OUT, `${new Date().toISOString().slice(0, 10)}-${slug(tema)}`));
    salvarCarrossel(pasta, c);
    anotar(t, `texto pronto: ${(c.slides || []).length} slides`);

    if (dados.comImagem !== false && (dados.provedor || provedorAtual()) !== "none") {
      anotar(t, "gerando as imagens");
      const r = await gerarImagens(c, {
        pasta,
        provedor: dados.provedor || undefined,
        aoProgredir: (i, estado) => anotar(t, `imagem do slide ${i + 1}: ${estado}`)
      });
      salvarCarrossel(pasta, c);
      if (r.falhas.length) anotar(t, `${r.falhas.length} imagem(ns) falharam: ${r.falhas.map((f) => `slide ${f.slide}`).join(", ")}`);
    }

    anotar(t, "renderizando os PNG");
    await renderizarPNGs(c, pasta, { aoProgredir: (i, n) => anotar(t, `PNG ${i}/${n}`) });
    return { pasta: path.basename(pasta), carrossel: c };
  },

  async imagens(t, dados) {
    const pasta = pastaSegura(dados.pasta);
    const c = lerCarrossel(pasta);
    const provedor = dados.provedor || provedorAtual();
    anotar(t, `gerando imagens pelo provedor ${provedor}`);
    const r = await gerarImagens(c, {
      pasta,
      provedor,
      forcar: !!dados.forcar,
      aoProgredir: (i, estado) => anotar(t, `slide ${i + 1}: ${estado}`)
    });
    salvarCarrossel(pasta, c);
    anotar(t, "renderizando os PNG de novo");
    await renderizarPNGs(c, pasta, { aoProgredir: (i, n) => anotar(t, `PNG ${i}/${n}`) });
    return { pasta: path.basename(pasta), carrossel: c, falhas: r.falhas };
  },

  async render(t, dados) {
    const pasta = pastaSegura(dados.pasta);
    const c = dados.carrossel || lerCarrossel(pasta);
    if (dados.carrossel) salvarCarrossel(pasta, c);
    anotar(t, "renderizando os PNG");
    await renderizarPNGs(c, pasta, { aoProgredir: (i, n) => anotar(t, `PNG ${i}/${n}`) });
    const medidas = await medirAjuste(c, pasta);
    return { pasta: path.basename(pasta), apertados: medidas.filter((m) => m.k < 0.85 || m.estourou) };
  },

  async slide(t, dados) {
    const pasta = pastaSegura(dados.pasta);
    const c = lerCarrossel(pasta);
    const i = Number(dados.indice);
    anotar(t, `reescrevendo o slide ${i + 1}`);
    c.slides[i] = await gerarSlide(c, i, dados.instrucao || null);
    salvarCarrossel(pasta, c);
    return { pasta: path.basename(pasta), carrossel: c };
  },

  async roteiro(t, dados) {
    anotar(t, "escrevendo o roteiro");
    const r = await gerarRoteiro({ tema: String(dados.tema || "") });
    const pasta = garantirPasta(path.join(PASTA_OUT, `${new Date().toISOString().slice(0, 10)}-reels-${slug(dados.tema)}`));
    fs.writeFileSync(path.join(pasta, "roteiro.json"), JSON.stringify(r, null, 2));
    return { pasta: path.basename(pasta), roteiro: r };
  }
};

// ── rotas ────────────────────────────────────────────────────────────────────

async function rotear(req, res) {
  const url = new URL(req.url, "http://localhost");
  const rota = url.pathname;

  if (rota === "/" || rota === "/index.html") {
    const arquivo = path.join(RAIZ, "artifact", "index.html");
    if (!fs.existsSync(arquivo)) {
      return responder(res, 500, "Rode `npm run build:artifact` antes de subir o servidor.", "text/plain; charset=utf-8");
    }
    return responder(res, 200, comCabecalho(fs.readFileSync(arquivo, "utf8")), TIPOS[".html"]);
  }

  if (rota === "/manifest.webmanifest") {
    return responder(res, 200, {
      name: "Carrossel No Controle",
      short_name: "Carrossel",
      start_url: "/",
      display: "standalone",
      background_color: "#0D2B5E",
      theme_color: "#0D2B5E",
      icons: [{ src: "/icone.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }]
    }, "application/manifest+json; charset=utf-8");
  }

  if (rota === "/icone.svg") {
    return responder(res, 200, ICONE, "image/svg+xml; charset=utf-8");
  }

  if (rota === "/api/ping") {
    const provedor = provedorAtual();
    const provedores = { kie: !!process.env.KIE_API_KEY, gemini: !!process.env.GEMINI_API_KEY };
    return responder(res, 200, {
      local: true,
      provedorImagem: provedor,
      provedores,
      temChaveImagem: provedor === "none" ? false : !!provedores[provedor],
      enderecos: enderecosDaRede(),
      linhasEditoriais: Object.keys(brand.linhasEditoriais)
    });
  }

  if (rota === "/api/carrosseis" && req.method === "GET") {
    return responder(res, 200, listarCarrosseis());
  }

  if (rota.startsWith("/api/carrosseis/")) {
    const nome = decodeURIComponent(rota.slice("/api/carrosseis/".length));
    const pasta = pastaSegura(nome);
    if (req.method === "GET") return responder(res, 200, lerCarrossel(pasta));
    if (req.method === "PUT") {
      const corpo = await lerCorpo(req);
      salvarCarrossel(pasta, corpo);
      escreverPreview(corpo, pasta);
      return responder(res, 200, { ok: true });
    }
  }

  if (rota === "/api/tarefas" && req.method === "POST") {
    const corpo = await lerCorpo(req);
    const acao = ACOES[corpo.acao];
    if (!acao) return responder(res, 400, { erro: `ação desconhecida: ${corpo.acao}` });
    const t = novaTarefa(corpo.acao);
    responder(res, 202, { id: t.id });
    acao(t, corpo)
      .then((r) => { t.resultado = r; t.estado = "ok"; anotar(t, "pronto"); })
      .catch((e) => { t.erro = e.message; t.estado = "erro"; anotar(t, `erro: ${e.message}`); });
    return;
  }

  if (rota.startsWith("/api/tarefas/")) {
    const t = tarefas.get(rota.slice("/api/tarefas/".length));
    if (!t) return responder(res, 404, { erro: "tarefa não encontrada" });
    return responder(res, 200, t);
  }

  if (rota === "/api/lint" && req.method === "POST") {
    const corpo = await lerCorpo(req);
    return responder(res, 200, lint.lint(corpo, brand));
  }

  if (rota === "/api/imagem" && req.method === "POST") {
    const corpo = await lerCorpo(req);
    const pasta = pastaSegura(corpo.pasta);
    const c = lerCarrossel(pasta);
    const i = Number(corpo.indice);
    const slide = (c.slides || [])[i];
    if (!slide) return responder(res, 400, { erro: "slide inexistente" });

    const bruto = String(corpo.dados || "");
    const casa = bruto.match(/^data:(image\/(png|jpeg|jpg|webp));base64,(.+)$/);
    if (!casa) return responder(res, 400, { erro: "envie uma imagem png, jpeg ou webp" });
    const ext = casa[2] === "jpeg" ? "jpg" : casa[2];
    const nome = `manual-${String(i + 1).padStart(2, "0")}-${Date.now()}.${ext}`;
    fs.writeFileSync(path.join(garantirPasta(path.join(pasta, "img")), nome), Buffer.from(casa[3], "base64"));

    slide.imagem = Object.assign({}, slide.imagem, { arquivo: `img/${nome}` });
    delete slide.imagem.url;
    delete slide.imagem.dataUrl;
    salvarCarrossel(pasta, c);
    return responder(res, 200, { arquivo: `img/${nome}`, carrossel: c });
  }

  if (rota === "/api/abrir" && req.method === "POST") {
    const corpo = await lerCorpo(req);
    abrirNoSistema(pastaSegura(corpo.pasta));
    return responder(res, 200, { ok: true });
  }

  if (rota.startsWith("/arquivos/")) {
    const rel = decodeURIComponent(rota.slice("/arquivos/".length));
    const alvo = pastaSegura(rel);
    if (!fs.existsSync(alvo) || fs.statSync(alvo).isDirectory()) return responder(res, 404, { erro: "não encontrado" });
    const baixar = url.searchParams.has("baixar");
    res.writeHead(200, Object.assign(
      { "content-type": TIPOS[path.extname(alvo).toLowerCase()] || "application/octet-stream", "cache-control": "no-store" },
      baixar ? { "content-disposition": `attachment; filename="${path.basename(alvo)}"` } : {}
    ));
    return fs.createReadStream(alvo).pipe(res);
  }

  responder(res, 404, { erro: "rota não encontrada" });
}

// ── subida ───────────────────────────────────────────────────────────────────

export async function subirServidor({ porta: portaPedida = 4173, rede = false, abrirSozinho = true } = {}) {
  let porta = portaPedida;
  const servidor = http.createServer((req, res) => {
    rotear(req, res).catch((e) => {
      console.error(cores.erro(`erro em ${req.url}: ${e.message}`));
      if (!res.headersSent) responder(res, 500, { erro: e.message });
    });
  });

  const host = rede ? "0.0.0.0" : "127.0.0.1";

  // porta ocupada (outra janela do app aberta, por exemplo): tenta as seguintes
  let tentativa = porta;
  for (let i = 0; i < 10; i++) {
    try {
      await new Promise((ok, falha) => {
        const erro = (e) => falha(e);
        servidor.once("error", erro);
        servidor.listen(tentativa, host, () => { servidor.off("error", erro); ok(); });
      });
      break;
    } catch (e) {
      if (e.code !== "EADDRINUSE" || i === 9) {
        console.log(cores.erro(`\nNão consegui abrir a porta ${tentativa}: ${e.message}`));
        throw e;
      }
      console.log(cores.fraco(`  porta ${tentativa} ocupada, tentando ${tentativa + 1}…`));
      tentativa++;
    }
  }
  porta = tentativa;
  PORTA_ATUAL = porta;

  console.log("");
  console.log(cores.forte("Carrossel No Controle") + cores.fraco(" — app local"));
  console.log(`  ${cores.ok(`http://localhost:${porta}`)}`);
  if (rede) for (const e of enderecosDaRede()) console.log(cores.fraco(`  no celular (mesma rede): ${e}`));
  const provedor = provedorAtual();
  const temChave = provedor === "none" ? true : !!(provedor === "kie" ? process.env.KIE_API_KEY : process.env.GEMINI_API_KEY);
  console.log(cores.fraco(`  imagens: ${provedor}${temChave ? "" : cores.erro("  (sem chave no .env)")}`));
  console.log(cores.fraco("  Ctrl+C para parar."));
  console.log("");

  if (abrirSozinho !== false) abrirNoSistema(`http://localhost:${porta}`);
  void abrirNavegador;
  return servidor;
}
