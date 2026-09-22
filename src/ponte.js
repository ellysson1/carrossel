/* Ponte celular ↔ PC, disparada por botão — nada roda sozinho.

   Ida (celular → PC): o app publicado grava o pedido como JSON numa pasta do
   Google Drive (brand.ponte.drivePedidos). O PC não tem o Drive montado em
   disco, então quem lê é o Claude Code em segundo plano, que tem o conector
   do Drive. O conteúdo NÃO passa pelo modelo: o app lê o resultado da
   ferramenta direto do fluxo stream-json e decodifica o base64 aqui.

   Volta (PC → celular): o carrossel pronto vira uma "entrega" em
   out/_entregas/. Esta pasta mora no OneDrive, que sincroniza sozinho; o app
   publicado lê pelo conector do Microsoft 365 e sobe as fotos no acervo dele.
   As fotos vão em JPEG reduzido (celular/), porque o conector devolve a imagem
   inteira dentro da resposta. */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { RAIZ, brand, slug, garantirPasta } from "./nucleo.js";
import { gerarImagens } from "./images/index.js";
import { renderizarPNGs, abrirNavegador } from "./render.js";

const PASTA_OUT = path.join(RAIZ, "out");
const PASTA_PEDIDOS = path.join(PASTA_OUT, "_pedidos");
const PASTA_ENTREGAS = path.join(PASTA_OUT, "_entregas");
const MODELO_PONTE = process.env.CARROSSEL_MODELO_PONTE || "claude-haiku-4-5-20251001";

const FERRAMENTAS = [
  "ToolSearch",
  "mcp__claude_ai_Google_Drive__search_files",
  "mcp__claude_ai_Google_Drive__download_file_content",
  "mcp__claude_ai_Google_Drive__update_file"
];

function instrucoes(pastaPedidos, pastaProcessados) {
  return [
    "Tarefa mecânica no Google Drive. Não escreva nada além do pedido e não abra outros arquivos.",
    "Se as ferramentas do Drive estiverem adiadas, carregue-as com ToolSearch (select:" + FERRAMENTAS.slice(1).join(",") + ").",
    `1. search_files com query: parentId = '${pastaPedidos}' and mimeType = 'application/json' — excludeContentSnippets true, pageSize 50.`,
    "2. Para CADA arquivo encontrado, nesta ordem:",
    "   a. download_file_content com o fileId.",
    `   b. só se o download deu certo: update_file com o mesmo fileId e parentId '${pastaProcessados}'.`,
    "3. Responda só com o número de arquivos baixados."
  ].join("\n");
}

/** Roda o Claude Code em segundo plano e devolve os downloads, lidos do fluxo. */
function rodarClaude(texto, aoAndar) {
  return new Promise((resolve, reject) => {
    const args = [
      "-p", "--output-format", "stream-json", "--verbose",
      "--model", MODELO_PONTE,
      "--allowedTools", FERRAMENTAS.join(",")
    ];
    const p = spawn("claude", args, { stdio: ["pipe", "pipe", "pipe"], shell: process.platform === "win32", cwd: RAIZ });
    const nomes = {};            // tool_use_id → nome da ferramenta
    const baixados = [];
    let resto = "", erro = "", final = null;

    function linha(l) {
      let ev;
      try { ev = JSON.parse(l); } catch { return; }
      const blocos = (ev.message && ev.message.content) || [];
      if (ev.type === "assistant") {
        for (const b of blocos) if (b.type === "tool_use") {
          nomes[b.id] = b.name;
          if (/download_file_content/.test(b.name)) aoAndar?.("baixando um pedido do Drive");
          if (/update_file/.test(b.name)) aoAndar?.("movendo o pedido para processados");
        }
      } else if (ev.type === "user") {
        for (const b of blocos) {
          if (b.type !== "tool_result" || !/download_file_content/.test(nomes[b.tool_use_id] || "")) continue;
          const txt = typeof b.content === "string" ? b.content
            : (b.content || []).filter((c) => c.type === "text").map((c) => c.text).join("");
          try {
            const r = JSON.parse(txt);
            if (r.content) baixados.push({ id: r.id, titulo: r.title, texto: Buffer.from(r.content, "base64").toString("utf8") });
          } catch { /* resultado de erro: o arquivo fica no Drive para a próxima vez */ }
        }
      } else if (ev.type === "result") {
        final = ev;
      }
    }

    p.stdout.on("data", (d) => {
      resto += d;
      const partes = resto.split(/\r?\n/);
      resto = partes.pop();
      partes.forEach(linha);
    });
    p.stderr.on("data", (d) => (erro += d));
    p.on("error", (e) => reject(new Error(e.code === "ENOENT" ? "CLI do Claude não encontrada no PATH." : e.message)));
    p.on("close", (code) => {
      if (resto) linha(resto);
      if (code !== 0 && !baixados.length) return reject(new Error(`claude saiu com código ${code}: ${erro.slice(0, 400)}`));
      resolve({ baixados, custo: final && final.total_cost_usd, resposta: final && final.result });
    });
    p.stdin.end(texto);
  });
}

/** Pedido (JSON do app) → pasta em out/, igual à que a CLI cria. */
export function importarPedido(doc) {
  const carrossel = doc.carrossel || (doc.data && doc.data.carrossel) || doc;
  if (!carrossel || !Array.isArray(carrossel.slides) || !carrossel.slides.length) {
    throw new Error("esse pedido não tem um carrossel dentro");
  }
  const tema = (carrossel.meta || {}).tema || doc.tema || "pedido do celular";
  const dia = new Date(Number(doc.criadoEm) || Date.now()).toISOString().slice(0, 10);
  const pasta = garantirPasta(path.join(PASTA_OUT, `${dia}-${slug(tema)}`));

  // imagens do acervo do artifact não existem aqui: o gerador local as refaz
  for (const s of carrossel.slides) {
    if (s.imagem) {
      delete s.imagem.url;
      delete s.imagem.assetId;
      delete s.imagem.dataUrl;
      delete s.imagem.celular;
    }
  }
  fs.writeFileSync(path.join(pasta, "carrossel.json"), JSON.stringify(carrossel, null, 2));
  fs.writeFileSync(
    path.join(pasta, "legenda.txt"),
    [carrossel.legenda || "", "", (carrossel.hashtags || []).join(" ")].join("\n").trim() + "\n"
  );
  return { pasta, tema, carrossel };
}

/** Busca no Drive os pedidos novos e guarda cada um em out/_pedidos/. */
export async function buscarPedidos(aoAndar) {
  const p = brand.ponte || {};
  if (!p.drivePedidos || !p.driveProcessados) throw new Error("brand.json sem ponte.drivePedidos/driveProcessados");
  garantirPasta(PASTA_PEDIDOS);
  aoAndar?.("perguntando ao Drive se há pedidos (leva uns 20 segundos)");
  const r = await rodarClaude(instrucoes(p.drivePedidos, p.driveProcessados), aoAndar);
  for (const b of r.baixados) {
    fs.writeFileSync(path.join(PASTA_PEDIDOS, `${b.id}.json`), b.texto);
  }
  return { novos: r.baixados.length, custo: r.custo };
}

/** Processa o que estiver em out/_pedidos/: imagens, PNG e entrega. */
export async function processarPedidos(aoAndar, { provedor } = {}) {
  if (!fs.existsSync(PASTA_PEDIDOS)) return [];
  const feitos = [];
  const arquivos = fs.readdirSync(PASTA_PEDIDOS).filter((n) => n.endsWith(".json") && !n.endsWith(".feito.json"));
  for (const nome of arquivos) {
    const arq = path.join(PASTA_PEDIDOS, nome);
    let doc;
    try { doc = JSON.parse(fs.readFileSync(arq, "utf8")); } catch {
      aoAndar?.(`pedido ${nome} ilegível; deixei de lado`);
      fs.renameSync(arq, arq.replace(/\.json$/, ".ilegivel"));
      continue;
    }
    let importado;
    try { importado = importarPedido(doc); } catch (e) {
      aoAndar?.(`pedido ${nome}: ${e.message}; deixei de lado`);
      fs.renameSync(arq, arq.replace(/\.json$/, ".invalido"));
      continue;
    }
    const { pasta, tema, carrossel } = importado;
    aoAndar?.(`"${tema}": gerando as imagens`);
    const r = await gerarImagens(carrossel, {
      pasta,
      provedor: provedor || undefined,
      aoProgredir: (i, estado) => aoAndar?.(`"${tema}": slide ${i + 1} ${estado}`)
    });
    fs.writeFileSync(path.join(pasta, "carrossel.json"), JSON.stringify(carrossel, null, 2));
    aoAndar?.(`"${tema}": renderizando os PNG`);
    await renderizarPNGs(carrossel, pasta, { aoProgredir: () => {} });
    await prepararEntrega(pasta, aoAndar);
    fs.renameSync(arq, arq.replace(/\.json$/, ".feito.json"));
    feitos.push({ pasta: path.basename(pasta), tema, falhas: r.falhas.length });
  }
  return feitos;
}

/** JPEG reduzido de cada foto, para caber na resposta do conector. */
async function fotosParaCelular(pasta, carrossel) {
  garantirPasta(path.join(pasta, "celular"));
  const alvos = (carrossel.slides || [])
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.imagem && s.imagem.arquivo && fs.existsSync(path.join(pasta, s.imagem.arquivo)));
  if (!alvos.length) return;
  const nav = await abrirNavegador();
  try {
    const pg = await nav.newPage();
    for (const { s, i } of alvos) {
      const origem = path.join(pasta, s.imagem.arquivo);
      const ext = path.extname(origem).slice(1).toLowerCase().replace("jpg", "jpeg");
      const dataUrl = `data:image/${ext};base64,${fs.readFileSync(origem).toString("base64")}`;
      const jpeg = await pg.evaluate(async (src) => {
        const im = new Image();
        im.src = src;
        await im.decode();
        const k = Math.min(1, 1440 / Math.max(im.naturalWidth, im.naturalHeight));
        const c = document.createElement("canvas");
        c.width = Math.round(im.naturalWidth * k);
        c.height = Math.round(im.naturalHeight * k);
        c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
        return c.toDataURL("image/jpeg", 0.84);
      }, dataUrl);
      const rel = `celular/slide-${String(i + 1).padStart(2, "0")}.jpg`;
      fs.writeFileSync(path.join(pasta, rel), Buffer.from(jpeg.split(",")[1], "base64"));
      s.imagem.celular = rel;
    }
  } finally {
    await nav.close();
  }
}

/** Marca a pasta como pronta para o celular buscar. */
export async function prepararEntrega(pasta, aoAndar) {
  const arq = path.join(pasta, "carrossel.json");
  const carrossel = JSON.parse(fs.readFileSync(arq, "utf8"));
  aoAndar?.("preparando as fotos para o celular");
  await fotosParaCelular(pasta, carrossel);
  fs.writeFileSync(arq, JSON.stringify(carrossel, null, 2));
  garantirPasta(PASTA_ENTREGAS);
  const nome = path.basename(pasta);
  const entrega = {
    pasta: nome,
    tema: (carrossel.meta || {}).tema || nome,
    enviadoEm: Date.now(),
    carrossel
  };
  fs.writeFileSync(path.join(PASTA_ENTREGAS, `${nome}.json`), JSON.stringify(entrega));
  return entrega;
}
