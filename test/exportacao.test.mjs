/* A exportação do app publicado passa pelo html2canvas, que entende menos CSS que
   o Chromium. Este teste renderiza todos os tipos de slide por ele e falha se
   algum quebrar — foi assim que `color-mix()` derrubou o .zip no celular. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { RAIZ, brand, layout, CSS_SLIDES, logoDataUrl } from "../src/nucleo.js";

const EXEMPLO = path.join(RAIZ, "examples", "todos-os-tipos.json");
const H2C = path.join(RAIZ, "node_modules", "html2canvas", "dist", "html2canvas.min.js");

test("html2canvas exporta todos os tipos de slide", { concurrency: false }, async (t) => {
  if (!fs.existsSync(H2C)) return t.skip("html2canvas não instalado (npm i)");

  const carrossel = JSON.parse(fs.readFileSync(EXEMPLO, "utf8"));
  const deck = layout.renderDeck(carrossel, {
    handle: brand.handle,
    cabecalho: brand.cabecalho,
    logo: logoDataUrl(),
    seloTexto: (brand.selo && brand.selo.texto) || "NC",
    imagem: () => null
  });

  const exe = ["/opt/pw-browsers/chromium", process.env.CHROMIUM_PATH].find((p) => p && fs.existsSync(p));
  const navegador = await chromium.launch(exe ? { executablePath: exe } : {});
  try {
    const pagina = await navegador.newPage({ viewport: { width: brand.formato.largura, height: brand.formato.altura } });
    await pagina.setContent(
      `<!doctype html><meta charset="utf-8"><style>${CSS_SLIDES}body{margin:0}</style>` +
      `${deck}<script>${fs.readFileSync(H2C, "utf8")}</script>`
    );
    await pagina.waitForFunction("window.html2canvas !== undefined");

    const falhas = await pagina.evaluate(async (alvo) => {
      const ruins = [];
      for (const el of document.querySelectorAll(".slide")) {
        try {
          const c = await window.html2canvas(el, { width: alvo.l, height: alvo.a, scale: 1, backgroundColor: null, logging: false });
          if (c.width !== alvo.l || c.height !== alvo.a) ruins.push({ tipo: el.className, erro: `saiu ${c.width}x${c.height}` });
        } catch (e) {
          ruins.push({ tipo: el.className, erro: String(e.message || e) });
        }
      }
      return ruins;
    }, { l: brand.formato.largura, a: brand.formato.altura });

    assert.deepEqual(falhas, [], "slides que o html2canvas não exportou: " + JSON.stringify(falhas, null, 1));
  } finally {
    await navegador.close();
  }
});
