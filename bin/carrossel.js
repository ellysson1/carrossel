#!/usr/bin/env node
/* CLI do gerador de carrosséis — No Controle (@profellyssonrocha)
   Pipeline completo: tema → texto (Claude) → imagens (Kie/Gemini) → PNG 1080x1350.
   Rode `carrossel ajuda` para a lista de comandos. */
import fs from "node:fs";
import path from "node:path";
import { RAIZ, brand, lint, layout, carregarEnv, slug, garantirPasta, cores, passo } from "../src/nucleo.js";
import { gerarCarrossel, gerarSlide, gerarRoteiro } from "../src/copy/gerar.js";
import { gerarImagens, diagnostico, provedorAtual } from "../src/images/index.js";
import { renderizarPNGs, escreverPreview, medirAjuste, avisoAjuste, abrirNavegador } from "../src/render.js";

carregarEnv();

// ── argumentos ───────────────────────────────────────────────────────────────

function parsear(argv) {
  const opts = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const [chave, valorInline] = a.slice(2).split("=");
      const proximo = argv[i + 1];
      if (valorInline !== undefined) opts[chave] = valorInline;
      else if (proximo && !proximo.startsWith("--")) { opts[chave] = proximo; i++; }
      else opts[chave] = true;
    } else opts._.push(a);
  }
  return opts;
}

const AJUDA = `
${cores.forte("carrossel")} — gerador de carrosséis do @profellyssonrocha

  ${cores.forte("carrossel novo")} --tema "..." [opções]      pipeline completo: texto, imagens e PNG
  ${cores.forte("carrossel texto")} --tema "..." [opções]     só o texto (JSON do carrossel)
  ${cores.forte("carrossel imagens")} <pasta>                 gera as imagens que faltam
  ${cores.forte("carrossel render")} <pasta>                  regera os PNG a partir do JSON
  ${cores.forte("carrossel lint")} <pasta|arquivo.json>       confere o texto contra as regras da marca
  ${cores.forte("carrossel roteiro")} --tema "..."            roteiro de Reels cronometrado
  ${cores.forte("carrossel lote")} <arquivo>                  vários carrosséis de uma vez
  ${cores.forte("carrossel doctor")}                          testa chaves, modelo e navegador

Opções de geração:
  --tema "..."          assunto do carrossel (obrigatório)
  --tipo <linha>        ${Object.keys(brand.linhasEditoriais).join(" | ")}   (padrão: metodo)
  --slides <6..10>      quantidade de slides (padrão: 9)
  --cta <PALAVRA>       palavra-chave do comentário (padrão: ${brand.palavrasChaveCta[0]})
  --contexto <arquivo>  material de apoio verificado (acórdão, edital, notas)
  --modelo <nome>       modelo do Claude (padrão: sonnet)
  --saida <pasta>       pasta de saída (padrão: out/<data>-<tema>)
  --sem-imagem          não chama o gerador de imagem
  --sem-png             não abre o navegador para renderizar
  --forcar              regera imagens mesmo se já existirem
  --provedor <nome>     kie | gemini | none (padrão: ${provedorAtual()})
`;

// ── utilidades ───────────────────────────────────────────────────────────────

function pastaDoAlvo(alvo) {
  if (!alvo) throw new Error("informe a pasta do carrossel (ex.: out/2026-09-18-meu-tema)");
  const p = path.resolve(alvo);
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) return p;
  if (p.endsWith(".json")) return path.dirname(p);
  throw new Error(`pasta não encontrada: ${alvo}`);
}

function lerCarrossel(pasta) {
  const arq = path.join(pasta, "carrossel.json");
  if (!fs.existsSync(arq)) throw new Error(`não achei carrossel.json em ${pasta}`);
  return JSON.parse(fs.readFileSync(arq, "utf8"));
}

function salvarCarrossel(pasta, c) {
  fs.writeFileSync(path.join(pasta, "carrossel.json"), JSON.stringify(c, null, 2));
}

function salvarLegenda(pasta, c) {
  const texto = [c.legenda || "", "", (c.hashtags || []).join(" ")].join("\n").trim() + "\n";
  fs.writeFileSync(path.join(pasta, "legenda.txt"), texto);
}

function pastaSaida(opts, tema) {
  if (opts.saida) return garantirPasta(path.resolve(opts.saida));
  const dia = new Date().toISOString().slice(0, 10);
  return garantirPasta(path.join(RAIZ, "out", `${dia}-${slug(tema)}`));
}

function opcoesDeGeracao(opts) {
  if (!opts.tema) throw new Error('faltou --tema "assunto do carrossel"');
  return {
    tema: String(opts.tema),
    tipo: String(opts.tipo || "metodo"),
    nSlides: Number(opts.slides || 9),
    palavraCta: String(opts.cta || brand.palavrasChaveCta[0]).toUpperCase(),
    contexto: opts.contexto ? fs.readFileSync(path.resolve(String(opts.contexto)), "utf8") : null,
    modelo: opts.modelo ? String(opts.modelo) : undefined
  };
}

function relatarLint(c) {
  const achados = lint.lint(c, brand);
  if (!achados.length) { console.log(cores.ok("Lint: nenhum apontamento.")); return 0; }
  const erros = lint.erros(achados);
  console.log((erros.length ? cores.erro : cores.aviso)(lint.formatar(achados)));
  console.log(cores.fraco(`${erros.length} erro(s), ${achados.length - erros.length} aviso(s).`));
  return erros.length;
}

// ── comandos ─────────────────────────────────────────────────────────────────

async function cmdTexto(opts, { silencioso } = {}) {
  const ger = opcoesDeGeracao(opts);
  const pasta = pastaSaida(opts, ger.tema);
  const c = await gerarCarrossel(ger);
  salvarCarrossel(pasta, c);
  salvarLegenda(pasta, c);
  if (!silencioso) {
    console.log(cores.ok(`Texto pronto: ${path.relative(process.cwd(), path.join(pasta, "carrossel.json"))}`));
    console.log(cores.fraco(`${(c.slides || []).length} slides · ${(c.slides || []).map((s) => s.tipo).join(" › ")}`));
  }
  return { pasta, carrossel: c };
}

async function cmdImagens(pasta, opts) {
  const c = lerCarrossel(pasta);
  const provedor = String(opts.provedor || provedorAtual());
  if (provedor === "none") { console.log(cores.fraco("Provedor de imagem: none — nada a gerar.")); return c; }
  passo(`Gerando imagens pelo provedor ${provedor}…`);
  const r = await gerarImagens(c, {
    pasta,
    forcar: !!opts.forcar,
    provedor,
    paralelas: Number(opts.paralelas || 2),
    aoProgredir: (i, estado) => console.log(cores.fraco(`   slide ${i + 1}: ${estado}`))
  });
  salvarCarrossel(pasta, c);
  console.log(`${cores.ok(`${r.geradas} imagem(ns) gerada(s)`)}${r.puladas ? cores.fraco(`, ${r.puladas} em cache`) : ""}`);
  if (r.falhas.length) {
    console.log(cores.erro(`${r.falhas.length} falha(s):`));
    r.falhas.forEach((f) => console.log(cores.erro(`   slide ${f.slide}: ${f.erro}`)));
    console.log(cores.fraco("Os slides sem imagem ainda renderizam: o fundo sólido entra no lugar."));
  }
  return c;
}

async function cmdRender(pasta) {
  const c = lerCarrossel(pasta);
  passo("Renderizando PNG 1080x1350…");
  const arquivos = await renderizarPNGs(c, pasta, {
    aoProgredir: (i, total) => process.stdout.write(cores.fraco(`   ${i}/${total}\r`))
  });
  const aviso = avisoAjuste(await medirAjuste(c, pasta));
  if (aviso) console.log(aviso);
  console.log(cores.ok(`${arquivos.length} PNG em ${path.relative(process.cwd(), path.join(pasta, "png"))}`));
  console.log(cores.fraco(`Prévia no navegador: ${path.relative(process.cwd(), escreverPreview(c, pasta))}`));
  return arquivos;
}

async function cmdNovo(opts) {
  const { pasta, carrossel } = await cmdTexto(opts, { silencioso: false });
  if (!opts["sem-imagem"]) await cmdImagens(pasta, opts);
  if (!opts["sem-png"]) await cmdRender(pasta);
  else escreverPreview(lerCarrossel(pasta), pasta);
  console.log("");
  console.log(cores.forte("Pronto para publicar:"), path.relative(process.cwd(), pasta));
  console.log(cores.fraco("  png/         slides na ordem"));
  console.log(cores.fraco("  legenda.txt  legenda e hashtags"));
  console.log(cores.fraco("  preview.html prévia no navegador"));
  console.log(cores.fraco("  carrossel.json  edite o texto e rode `carrossel render` de novo"));
  void carrossel;
  return pasta;
}

async function cmdLote(arquivo, opts) {
  const bruto = fs.readFileSync(path.resolve(arquivo), "utf8");
  let itens;
  if (arquivo.endsWith(".json")) itens = JSON.parse(bruto);
  else {
    itens = bruto.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#")).map((l) => {
      const [tipo, ...resto] = l.split("|");
      return resto.length ? { tipo: tipo.trim(), tema: resto.join("|").trim() } : { tema: l };
    });
  }
  console.log(cores.forte(`Lote com ${itens.length} carrossel(éis).`));
  const feitos = [];
  for (const [i, item] of itens.entries()) {
    console.log("");
    console.log(cores.forte(`[${i + 1}/${itens.length}] ${item.tema}`));
    try {
      const pasta = await cmdNovo(Object.assign({}, opts, {
        tema: item.tema,
        tipo: item.tipo || opts.tipo,
        slides: item.slides || opts.slides,
        cta: item.cta || opts.cta,
        saida: undefined
      }));
      feitos.push(pasta);
    } catch (e) {
      console.log(cores.erro(`falhou: ${e.message}`));
    }
  }
  console.log("");
  console.log(cores.ok(`${feitos.length}/${itens.length} carrosséis prontos.`));
}

async function cmdRoteiro(opts) {
  const ger = opcoesDeGeracao(opts);
  const pasta = pastaSaida(opts, ger.tema);
  const r = await gerarRoteiro(ger);
  fs.writeFileSync(path.join(pasta, "roteiro.json"), JSON.stringify(r, null, 2));
  const txt = [
    `GANCHO (0:00–0:03)`, r.gancho, "",
    ...(r.blocos || []).flatMap((b) => [`${b.tempo || ""}`, b.texto, ""]),
    "CTA", r.cta, "",
    `Duração estimada: ${r.duracaoEstimadaSegundos || "?"}s`, "",
    "LEGENDA", r.legenda || "", "", (r.hashtags || []).join(" ")
  ].join("\n");
  fs.writeFileSync(path.join(pasta, "roteiro.txt"), txt);
  console.log(cores.ok(`Roteiro em ${path.relative(process.cwd(), path.join(pasta, "roteiro.txt"))}`));
  console.log(cores.fraco(`~${r.duracaoEstimadaSegundos || "?"}s · ${(r.blocos || []).length} blocos`));
}

async function cmdDoctor(opts) {
  console.log(cores.forte("Diagnóstico\n"));
  console.log(`Design system   ${cores.ok("ok")} ${cores.fraco(`${Object.keys(brand.linhasEditoriais).length} linhas editoriais, ${layout.TIPOS.length} tipos de slide`)}`);

  const temCli = !!process.env.COPY_PROVIDER && process.env.COPY_PROVIDER === "anthropic";
  console.log(`Texto           provedor ${cores.forte(process.env.COPY_PROVIDER || "claude-cli")}` +
    (temCli ? (process.env.ANTHROPIC_API_KEY ? cores.ok("  chave presente") : cores.erro("  ANTHROPIC_API_KEY ausente")) : ""));

  try {
    const b = await abrirNavegador();
    const v = b.version();
    await b.close();
    console.log(`Navegador       ${cores.ok("ok")} ${cores.fraco("Chromium " + v)}`);
  } catch (e) {
    console.log(`Navegador       ${cores.erro("falhou")} ${cores.fraco(e.message.split("\n")[0])}`);
    console.log(cores.fraco("   rode: npx playwright install chromium"));
  }

  const provedor = String(opts.provedor || provedorAtual());
  if (provedor === "none") {
    console.log(`Imagem          ${cores.fraco("desligado (IMAGE_PROVIDER=none)")}`);
  } else {
    const chave = provedor === "kie" ? process.env.KIE_API_KEY : process.env.GEMINI_API_KEY;
    const nomeChave = provedor === "kie" ? "KIE_API_KEY" : "GEMINI_API_KEY";
    const temEnv = fs.existsSync(path.join(RAIZ, ".env"));
    if (!chave) {
      console.log(`Imagem          ${cores.erro("sem chave")} ${cores.fraco(nomeChave + " não está definida")}`);
      if (!temEnv) {
        console.log(cores.fraco(`   o arquivo .env ainda não existe na raiz do projeto. Crie assim:`));
        console.log(cores.fraco(`     cp .env.example .env`));
        console.log(cores.fraco(`   depois abra o .env e escreva a chave na linha ${nomeChave}= (sem aspas, sem espaço).`));
      } else {
        console.log(cores.fraco(`   o .env existe, mas a linha ${nomeChave}= está vazia. Preencha e rode de novo.`));
      }
      console.log(cores.fraco(`   a chave da Kie fica em kie.ai → sua conta → API Key.`));
    } else if (opts.rapido) {
      console.log(`Imagem          ${cores.fraco("chave presente (use `carrossel doctor` sem --rapido para gerar uma imagem de teste)")}`);
    } else {
      console.log(`Imagem          testando ${provedor} ${cores.fraco(provedor === "kie" ? process.env.KIE_MODEL || "google/nano-banana" : process.env.GEMINI_MODEL || "gemini-2.5-flash-image")}…`);
      const d = await diagnostico(provedor);
      if (d.ok) {
        const arq = path.join(garantirPasta(path.join(RAIZ, "out")), "doctor.png");
        fs.writeFileSync(arq, d.buffer);
        console.log(`                ${cores.ok("ok")} ${cores.fraco(`${Math.round(d.bytes / 1024)} KB em ${Math.round(d.ms / 1000)}s → ${path.relative(process.cwd(), arq)}`)}`);
      } else {
        console.log(`                ${cores.erro("falhou")} ${d.erro}`);
        console.log(cores.fraco("   confira KIE_MODEL/KIE_ASPECT_FIELD em docs.kie.ai — o identificador muda por modelo."));
      }
    }
  }
}

// ── despacho ─────────────────────────────────────────────────────────────────

async function principal() {
  const opts = parsear(process.argv.slice(2));
  const comando = opts._[0] || "ajuda";

  switch (comando) {
    case "novo": await cmdNovo(opts); break;
    case "texto": await cmdTexto(opts, {}); break;
    case "imagens": await cmdImagens(pastaDoAlvo(opts._[1]), opts); break;
    case "render": await cmdRender(pastaDoAlvo(opts._[1])); break;
    case "roteiro": await cmdRoteiro(opts); break;
    case "lote": await cmdLote(opts._[1], opts); break;
    case "doctor": await cmdDoctor(opts); break;
    case "lint": {
      const alvo = opts._[1];
      const c = alvo && alvo.endsWith(".json") && fs.existsSync(alvo)
        ? JSON.parse(fs.readFileSync(alvo, "utf8"))
        : lerCarrossel(pastaDoAlvo(alvo));
      process.exitCode = relatarLint(c) ? 1 : 0;
      break;
    }
    case "slide": {
      const pasta = pastaDoAlvo(opts._[1]);
      const n = Number(opts._[2]);
      if (!n) throw new Error("uso: carrossel slide <pasta> <numero> [--instrucao \"...\"]");
      const c = lerCarrossel(pasta);
      passo(`Regerando o slide ${n}…`);
      c.slides[n - 1] = await gerarSlide(c, n - 1, opts.instrucao ? String(opts.instrucao) : null, opts);
      salvarCarrossel(pasta, c);
      relatarLint(c);
      console.log(cores.ok(`Slide ${n} atualizado. Rode \`carrossel render ${path.relative(process.cwd(), pasta)}\`.`));
      break;
    }
    default: console.log(AJUDA);
  }
}

principal().catch((e) => {
  console.error(cores.erro("erro: ") + e.message);
  process.exitCode = 1;
});
