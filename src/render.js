/* Renderização: monta a página de prévia e captura um PNG 1080x1350 por slide.
   A Nunito vai embutida em base64 — o PNG nunca sai com fonte trocada porque
   a rede demorou. Antes de capturar: document.fonts.ready, imagens decodificadas
   e auto-ajuste tipográfico rodado. */
import fs from "node:fs";
import path from "node:path";
import { RAIZ, brand, layout, CSS_SLIDES, garantirPasta, cores } from "./nucleo.js";

const PESOS = [400, 500, 700, 800, 900];

/** Chromium alternativo (CHROMIUM_PATH ou o pré-instalado no ambiente remoto). */
function executavelChromium() {
  const candidatos = [process.env.CHROMIUM_PATH, "/opt/pw-browsers/chromium"].filter(Boolean);
  return candidatos.find((c) => fs.existsSync(c));
}

export async function abrirNavegador(extra = {}) {
  const { chromium } = await import("playwright");
  const exe = executavelChromium();
  return chromium.launch(Object.assign({}, exe ? { executablePath: exe } : {}, extra));
}

function fonteEmbutida() {
  const dir = path.join(RAIZ, "node_modules", "@fontsource", "nunito", "files");
  return PESOS.map((p) => {
    const arq = path.join(dir, `nunito-latin-${p}-normal.woff2`);
    if (!fs.existsSync(arq)) return "";
    const b64 = fs.readFileSync(arq).toString("base64");
    return `@font-face{font-family:Nunito;font-style:normal;font-weight:${p};font-display:block;src:url(data:font/woff2;base64,${b64}) format("woff2");}`;
  }).join("\n");
}

function fonteRemota() {
  return "@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;700;800;900&display=block');";
}

/** HTML completo da prévia/renderização. */
export function montarHTML(carrossel, opcoes = {}) {
  const deck = layout.renderDeck(carrossel, {
    handle: brand.handle,
    cabecalho: brand.cabecalho,
    imagem: (ref) => {
      if (!ref) return null;
      if (ref.dataUrl) return ref.dataUrl;
      if (ref.arquivo) return String(ref.arquivo).split(path.sep).join("/");
      if (ref.url) return ref.url;
      return null;
    }
  });

  const fonte = opcoes.fonteRemota ? fonteRemota() : fonteEmbutida();
  const engine = fs.readFileSync(path.join(RAIZ, "src", "layout", "engine.cjs"), "utf8");

  return `<!doctype html>
<html lang="pt-BR">
<meta charset="utf-8">
<title>${layout.esc((carrossel.meta && carrossel.meta.tema) || "Carrossel")}</title>
<style>
${fonte}
${CSS_SLIDES}
:root { color-scheme: light dark; }
body { margin: 0; background: #11131a; display: flex; flex-direction: column; align-items: center; gap: 24px; padding: 24px; }
</style>
<body>
${deck}
<script>${engine}</script>
<script>
  window.__pronto = (async function () {
    await (document.fonts ? document.fonts.ready : Promise.resolve());
    await Promise.all([].map.call(document.images, function (i) {
      return i.complete ? Promise.resolve() : new Promise(function (r) { i.onload = i.onerror = r; });
    }));
    CarrosselLayout.ajustarTodos(document);
    await (document.fonts ? document.fonts.ready : Promise.resolve());
    return true;
  })();
</script>
</body>
</html>`;
}

export function escreverPreview(carrossel, pasta) {
  const arquivo = path.join(pasta, "preview.html");
  fs.writeFileSync(arquivo, montarHTML(carrossel));
  return arquivo;
}

/** Captura um PNG por slide em 1080x1350 reais. */
export async function renderizarPNGs(carrossel, pasta, opcoes = {}) {
  const destino = garantirPasta(path.join(pasta, "png"));
  const arquivoHTML = escreverPreview(carrossel, pasta);

  const navegador = await abrirNavegador({ args: ["--force-color-profile=srgb", "--font-render-hinting=none"] });
  const pagina = await navegador.newPage({
    viewport: { width: brand.formato.largura, height: brand.formato.altura },
    deviceScaleFactor: Number(opcoes.escala) || 1
  });
  const gerados = [];
  try {
    await pagina.goto("file://" + arquivoHTML);
    await pagina.waitForFunction("window.__pronto !== undefined");
    await pagina.evaluate("window.__pronto");

    const slides = await pagina.$$(".slide");
    for (let i = 0; i < slides.length; i++) {
      const arq = path.join(destino, `${String(i + 1).padStart(2, "0")}.png`);
      await slides[i].screenshot({ path: arq, type: "png", scale: "css" });
      gerados.push(arq);
      opcoes.aoProgredir?.(i + 1, slides.length);
    }
  } finally {
    await navegador.close();
  }
  return gerados;
}

/** Diagnóstico de recorte: quanto cada slide precisou encolher para caber. */
export async function medirAjuste(carrossel, pasta) {
  const arquivoHTML = escreverPreview(carrossel, pasta);
  const navegador = await abrirNavegador();
  const pagina = await navegador.newPage({ viewport: { width: brand.formato.largura, height: brand.formato.altura } });
  try {
    await pagina.goto("file://" + arquivoHTML);
    await pagina.waitForFunction("window.__pronto !== undefined");
    await pagina.evaluate("window.__pronto");
    return await pagina.evaluate(`[].map.call(document.querySelectorAll('.slide'), function (s, i) {
      var c = s.querySelector('.corpo');
      return { slide: i + 1, k: Number(s.style.getPropertyValue('--k') || 1), estourou: c.scrollHeight > c.clientHeight + 1 };
    })`);
  } finally {
    await navegador.close();
  }
}

export function avisoAjuste(medicoes) {
  const apertados = (medicoes || []).filter((m) => m.k < 0.85 || m.estourou);
  if (!apertados.length) return null;
  return cores.aviso(
    "Texto apertado em: " + apertados.map((m) => `slide ${m.slide} (${Math.round(m.k * 100)}%${m.estourou ? ", ainda estoura" : ""})`).join(", ")
  );
}
