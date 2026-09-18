/* Geração de texto pelo Claude.
   Dois provedores: a CLI do Claude Code (usa o login que você já tem, sem chave)
   e a API da Anthropic (chave em ANTHROPIC_API_KEY). O texto volta em JSON
   estruturado, passa pelo lint da marca e, se falhar, volta para correção. */
import { spawn } from "node:child_process";
import { brand, prompt, lint, extrairJSON, cores, passo } from "../nucleo.js";

const MODELO_PADRAO = process.env.CARROSSEL_MODELO || "sonnet";

function viaClaudeCli(texto, { modelo = MODELO_PADRAO, sinal } = {}) {
  return new Promise((resolve, reject) => {
    const args = ["-p", "--output-format", "json", "--model", modelo];
    const p = spawn("claude", args, { stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", (e) => reject(new Error(
      e.code === "ENOENT"
        ? "CLI do Claude não encontrada. Instale o Claude Code ou use COPY_PROVIDER=anthropic."
        : e.message)));
    p.on("close", (code) => {
      if (code !== 0) return reject(new Error(`claude saiu com código ${code}: ${err.slice(0, 500)}`));
      try {
        const env = JSON.parse(out);
        if (env.is_error) return reject(new Error(String(env.result).slice(0, 500)));
        resolve(env.result);
      } catch {
        resolve(out);
      }
    });
    if (sinal) sinal.addEventListener("abort", () => p.kill("SIGTERM"), { once: true });
    p.stdin.end(texto);
  });
}

async function viaAnthropic(texto, { modelo = "claude-sonnet-5", sinal } = {}) {
  const chave = process.env.ANTHROPIC_API_KEY;
  if (!chave) throw new Error("ANTHROPIC_API_KEY não definida (ou use COPY_PROVIDER=claude-cli).");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal: sinal,
    headers: {
      "content-type": "application/json",
      "x-api-key": chave,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: modelo,
      max_tokens: 8000,
      messages: [{ role: "user", content: texto }]
    })
  });
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text()).slice(0, 400)}`);
  const j = await r.json();
  return (j.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
}

export async function pedir(texto, opcoes = {}) {
  const provedor = opcoes.provedor || process.env.COPY_PROVIDER || "claude-cli";
  if (provedor === "anthropic") return viaAnthropic(texto, opcoes);
  return viaClaudeCli(texto, opcoes);
}

/** Gera o carrossel inteiro e insiste até o lint passar (no máximo `tentativas`). */
export async function gerarCarrossel(opcoes) {
  const { tentativas = 3 } = opcoes;
  let instrucao = prompt.carrossel(brand, opcoes);
  let ultimo = null;

  for (let t = 1; t <= tentativas; t++) {
    passo(`Escrevendo o carrossel (tentativa ${t}/${tentativas})…`);
    const bruto = await pedir(instrucao, opcoes);
    let c;
    try {
      c = extrairJSON(bruto);
    } catch (e) {
      instrucao = prompt.carrossel(brand, opcoes) + "\n\nA resposta anterior não era JSON válido (" + e.message + "). Responda apenas com o objeto JSON.";
      continue;
    }
    c.meta = Object.assign({ tema: opcoes.tema, tipo: opcoes.tipo, palavraCta: opcoes.palavraCta }, c.meta);
    ultimo = c;

    const achados = lint.lint(c, brand);
    const erros = lint.erros(achados);
    if (!erros.length) {
      const avisos = achados.filter((a) => a.severidade === "aviso");
      if (avisos.length) console.log(cores.aviso(lint.formatar(avisos)));
      return c;
    }
    console.log(cores.aviso(`${erros.length} violação(ões) da voz da marca; pedindo correção.`));
    console.log(cores.fraco(lint.formatar(erros)));
    instrucao = [
      prompt.carrossel(brand, opcoes),
      "",
      "Você já respondeu isto, e a revisão encontrou violações:",
      JSON.stringify(ultimo),
      "",
      "VIOLAÇÕES A CORRIGIR:",
      lint.formatar(erros),
      "",
      "Devolva o carrossel inteiro corrigido, no mesmo formato JSON. Corrija só o que foi apontado."
    ].join("\n");
  }

  if (!ultimo) throw new Error("o modelo não devolveu um carrossel válido");
  console.log(cores.aviso("Lint ainda com erros após as tentativas; salvando mesmo assim para edição manual."));
  return ultimo;
}

/** Regera um slide só, mantendo o resto intacto. */
export async function gerarSlide(carrossel, indice, instrucaoAutor, opcoes = {}) {
  const bruto = await pedir(prompt.slide(brand, carrossel, indice, instrucaoAutor), opcoes);
  const novo = extrairJSON(bruto);
  if (!novo.tipo) novo.tipo = carrossel.slides[indice].tipo;
  return novo;
}

export async function gerarRoteiro(opcoes) {
  passo("Escrevendo o roteiro de Reels…");
  const bruto = await pedir(prompt.roteiro(brand, opcoes), opcoes);
  return extrairJSON(bruto);
}
