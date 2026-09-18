/* Orquestra a geração das imagens de um carrossel.
   - monta o prompt final (assunto do slide + estilo da casa + negativos)
   - chama o provedor escolhido (kie | gemini | none)
   - guarda em out/<slug>/img/slide-N.png e grava o caminho no JSON
   - não regera o que já existe, a menos que o prompt tenha mudado (hash) */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { brand, cores, garantirPasta } from "../nucleo.js";

const PROVEDORES = { kie: () => import("./kie.js"), gemini: () => import("./gemini.js") };

export function provedorAtual() {
  return (process.env.IMAGE_PROVIDER || "kie").toLowerCase();
}

/** Prompt final enviado ao gerador de imagem. */
export function montarPrompt(promptDoSlide, aspect) {
  const im = brand.imagem || {};
  return [
    String(promptDoSlide || "").trim().replace(/\s+/g, " "),
    im.estiloEn || im.estilo,
    aspect ? `${aspect} vertical framing` : null,
    `Avoid: ${im.negativoEn || im.negativo}.`
  ].filter(Boolean).join(". ");
}

function hash(s) {
  return crypto.createHash("sha1").update(s).digest("hex").slice(0, 12);
}

function alvos(carrossel, somente) {
  const lista = [];
  (carrossel.slides || []).forEach((s, i) => {
    if (somente && somente.indexOf(i) < 0) return;
    if (!s.imagem) return;
    if (!s.imagem.prompt && !s.imagem.arquivo) return;
    const aspect = s.tipo === "capa" ? (brand.imagem.proporcaoCapa || "4:5") : (brand.imagem.proporcaoInterna || "16:9");
    lista.push({ indice: i, slide: s, aspect });
  });
  return lista;
}

async function comLimite(itens, limite, tarefa) {
  const fila = itens.slice();
  const trabalhadores = Array.from({ length: Math.min(limite, fila.length) }, async () => {
    while (fila.length) await tarefa(fila.shift());
  });
  await Promise.all(trabalhadores);
}

/**
 * Gera as imagens que faltam. Devolve {geradas, puladas, falhas}.
 * opcoes: {pasta, forcar, sinal, provedor, paralelas, aoProgredir, somenteIndices}
 */
export async function gerarImagens(carrossel, opcoes = {}) {
  const provedor = (opcoes.provedor || provedorAtual()).toLowerCase();
  const pasta = garantirPasta(path.join(opcoes.pasta, "img"));
  const itens = alvos(carrossel, opcoes.somenteIndices);
  const resultado = { geradas: 0, puladas: 0, falhas: [] };

  if (provedor === "none" || !itens.length) {
    resultado.puladas = itens.length;
    return resultado;
  }
  const carregar = PROVEDORES[provedor];
  if (!carregar) throw new Error(`IMAGE_PROVIDER desconhecido: ${provedor} (use kie, gemini ou none)`);
  const mod = await carregar();

  await comLimite(itens, Number(opcoes.paralelas) || 2, async ({ indice, slide, aspect }) => {
    const nome = `slide-${String(indice + 1).padStart(2, "0")}`;
    const promptFinal = montarPrompt(slide.imagem.prompt, aspect);
    const assinatura = hash(`${provedor}|${process.env.KIE_MODEL || process.env.GEMINI_MODEL || ""}|${promptFinal}`);
    const destino = path.join(pasta, `${nome}-${assinatura}.png`);
    const relativo = path.relative(opcoes.pasta, destino);

    if (!opcoes.forcar && fs.existsSync(destino)) {
      slide.imagem.arquivo = relativo;
      resultado.puladas++;
      opcoes.aoProgredir?.(indice, "em cache");
      return;
    }
    try {
      opcoes.aoProgredir?.(indice, "gerando");
      const buf = await mod.gerar({
        prompt: promptFinal,
        aspect,
        sinal: opcoes.sinal,
        aoProgredir: (e) => opcoes.aoProgredir?.(indice, e)
      });
      fs.writeFileSync(destino, buf);
      slide.imagem.arquivo = relativo;
      slide.imagem.promptFinal = promptFinal;
      resultado.geradas++;
      opcoes.aoProgredir?.(indice, cores.ok("pronta"));
    } catch (e) {
      resultado.falhas.push({ slide: indice + 1, erro: e.message });
      opcoes.aoProgredir?.(indice, cores.erro(e.message));
    }
  });

  return resultado;
}

/** Testa credencial e modelo do provedor com uma imagem mínima. */
export async function diagnostico(provedor = provedorAtual()) {
  const carregar = PROVEDORES[provedor];
  if (!carregar) return { provedor, ok: false, erro: `provedor desconhecido: ${provedor}` };
  const mod = await carregar();
  const inicio = Date.now();
  try {
    const buf = await mod.gerar({
      prompt: montarPrompt("an empty wooden desk beside a window in an institutional office", "16:9"),
      aspect: "16:9",
      aoProgredir: (e) => console.log(cores.fraco(`   ${e}`))
    });
    return { provedor, ok: true, bytes: buf.length, ms: Date.now() - inicio, buffer: buf };
  } catch (e) {
    return { provedor, ok: false, erro: e.message, ms: Date.now() - inicio };
  }
}
