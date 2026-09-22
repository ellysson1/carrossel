/* ──────────────────────────────────────────────────────────────────────────
   Motor de layout — funções puras, sem dependência.
   Roda no Node (CLI/Playwright) e dentro do artifact publicado.
   Marcação inline aceita nos textos:
     **palavra**  → retângulo amarelo atrás da palavra
     *palavra*    → negrito
   ────────────────────────────────────────────────────────────────────────── */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CarrosselLayout = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var TIPOS = ["capa", "texto", "imagem", "faixa", "lista", "passos", "metrica", "barras", "tese", "cta"];
  var FUNDOS = ["escuro", "claro", "medio", "creme"];

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /** Escapa e aplica a marcação inline da marca. */
  function rico(s) {
    return esc(s)
      .replace(/\*\*([^*]+)\*\*/g, '<span class="hl">$1</span>')
      .replace(/\*([^*]+)\*/g, '<span class="forte">$1</span>')
      .replace(/\n/g, "<br>");
  }

  /** Texto puro (sem marcação) — para contagem de palavras e lint. */
  function limpo(s) {
    return String(s == null ? "" : s).replace(/\*/g, "");
  }

  /**
   * Ritmo de fundos: nunca dois iguais em sequência.
   * Capa é sempre foto, tese é sempre creme, encerramento é sempre sólido escuro.
   */
  function planoDeFundos(slides) {
    var anterior = null;
    var giro = 0;
    return slides.map(function (s) {
      var fundo = s.fundo;
      if (!fundo) {
        if (s.tipo === "capa") fundo = "foto";
        else if (s.tipo === "tese") fundo = "creme";
        else if (s.tipo === "cta") fundo = anterior === "escuro" ? "medio" : "escuro";
        else {
          for (var i = 0; i < FUNDOS.length; i++) {
            var cand = FUNDOS[(giro + i) % FUNDOS.length];
            if (cand !== anterior) { fundo = cand; giro = (giro + i + 1) % FUNDOS.length; break; }
          }
        }
      }
      if (fundo === anterior && fundo !== "foto") {
        fundo = fundo === "escuro" ? "medio" : fundo === "medio" ? "escuro" : fundo === "claro" ? "creme" : "claro";
      }
      anterior = fundo;
      return fundo;
    });
  }

  /* Imagens entram como background-image: é o que renderiza igual no
     Playwright e na captura do artifact (object-fit não sobrevive à captura). */
  /* opcoes.enquadravel marca a foto que o app deixa arrastar; opcoes.enquadramento
     = {x, y, zoom} diz que ponto fica visível e quanto ampliar em torno dele. */
  function foto(src, classe, opcoes) {
    if (!src) return "";
    var o = opcoes || {};
    var limpa = String(src).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    var estilo = "background-image:url('" + limpa + "')";
    var e = o.enquadramento;
    if (e) {
      var x = numero(e.x, 50), y = numero(e.y, 50), z = Math.max(1, numero(e.zoom, 1));
      estilo += ";background-position:" + x + "% " + y + "%;transform:scale(" + z + ");transform-origin:" + x + "% " + y + "%";
    }
    return '<div class="' + classe + '"' + (o.enquadravel ? ' data-enquadravel="1"' : "") + ' style="' + estilo + '"></div>';
  }

  function numero(v, padrao) {
    var n = Number(v);
    return isFinite(n) ? n : padrao;
  }

  // ── cor e contraste ──────────────────────────────────────────────────────
  //
  // Toda cor que o autor escolhe passa por aqui. O texto nunca sai com menos
  // de 4,5:1 sobre o fundo (WCAG AA): se a escolha não alcança, o motor troca
  // pela tinta da marca que alcança. Por isso não existe "cinza sobre azul".

  var TINTAS = ["#FFFFFF", "#0D2B5E", "#2A1F00", "#000000"];

  function hexValido(h) {
    var m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(h || "").trim());
    if (!m) return null;
    var v = m[1].length === 3 ? m[1].replace(/(.)/g, "$1$1") : m[1];
    return "#" + v.toUpperCase();
  }

  function rgb(h) {
    var v = hexValido(h);
    if (!v) return null;
    return [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16)];
  }

  function luminancia(h) {
    var c = rgb(h);
    if (!c) return 0;
    var l = c.map(function (x) {
      x /= 255;
      return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
  }

  /** Razão de contraste WCAG entre duas cores (1 a 21). */
  function contraste(a, b) {
    var la = luminancia(a), lb = luminancia(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }

  /**
   * A tinta para o fundo: a da marca primeiro — marinho no claro, branco no
   * escuro — desde que passe de 4,5:1. Só se nenhuma passar, a de maior contraste.
   */
  function melhorTinta(fundo) {
    var ordem = luminancia(fundo) > 0.3 ? ["#0D2B5E", "#2A1F00", "#000000"] : ["#FFFFFF"];
    for (var i = 0; i < ordem.length; i++) if (contraste(ordem[i], fundo) >= 4.5) return ordem[i];
    return TINTAS.reduce(function (m, t) { return contraste(t, fundo) > contraste(m, fundo) ? t : m; }, TINTAS[0]);
  }

  /** A cor pedida, se ela se lê sobre o fundo; senão a melhor tinta. */
  function tintaLegivel(pedida, fundo, minimo) {
    var p = hexValido(pedida);
    return p && contraste(p, fundo) >= (minimo || 4.5) ? p : melhorTinta(fundo);
  }

  function rgba(h, a) {
    var c = rgb(h) || [13, 43, 94];
    return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")";
  }

  /**
   * Variáveis CSS do slide a partir de slide.cores = {fundo, texto, destaque}.
   * Só o que o autor mudou vira variável; o resto segue o ritmo da marca.
   * Devolve null quando o slide não tem cor própria.
   */
  function paletaDoSlide(slide, fundoBase) {
    var c = slide.cores || {};
    var fundo = hexValido(c.fundo), texto = hexValido(c.texto), destaque = hexValido(c.destaque);
    if (!fundo && !texto && !destaque) return null;
    var f = fundo || fundoBase;
    var v = {};
    if (fundo) v["--fundo"] = fundo;
    if (fundo || texto) v["--tinta"] = tintaLegivel(texto, f);
    if (destaque) {
      v["--amarelo"] = destaque;
      v["--tinta-destaque"] = melhorTinta(destaque);
      // o acento (label, bolinha da lista) usa o destaque só se ele se lê no fundo
      v["--acento"] = contraste(destaque, f) >= 3 ? destaque : v["--tinta"] || melhorTinta(f);
    } else if (fundo) {
      var amarelo = "#F5C842";
      v["--tinta-destaque"] = melhorTinta(amarelo);
      v["--acento"] = contraste(amarelo, f) >= 3 ? amarelo : v["--tinta"];
    }
    return v;
  }

  /** Hex de fundo padrão de cada nome do ritmo — para medir contraste. */
  var HEX_FUNDO = { escuro: "#0D2B5E", medio: "#1A4A9C", claro: "#F4F5F7", creme: "#FFF7E0", foto: "#0D2B5E" };

  var ALINHAMENTOS = ["esquerda", "justificado", "centro"];

  /** Deslocamento dos blocos arrastados: {chave: {x, y}} em px do slide. */
  function posicoesValidas(p) {
    if (!p || typeof p !== "object") return null;
    var fora = {}, algum = false;
    Object.keys(p).forEach(function (k) {
      var x = Math.round(numero(p[k] && p[k].x, 0)), y = Math.round(numero(p[k] && p[k].y, 0));
      if (x || y) { fora[k] = { x: x, y: y }; algum = true; }
    });
    return algum ? fora : null;
  }

  /**
   * Marcador do campo de origem: o app usa para editar direto no slide.
   * comMarcacao diz se o campo aceita **amarelo** e *negrito*.
   */
  function campo(nome, comMarcacao) {
    return ' data-campo="' + esc(nome) + '"' + (comMarcacao ? ' data-rico="1"' : "");
  }

  function label(s) {
    return s.label ? '<div class="label"' + campo("label") + ">" + esc(s.label) + "</div>" : "";
  }

  function fonteNota(s) {
    return s.fonte ? '<p class="fonte"' + campo("fonte", true) + ">" + rico(s.fonte) + "</p>" : "";
  }

  function corpoTexto(s) {
    return s.corpo ? '<p class="texto"' + campo("corpo", true) + ">" + rico(s.corpo) + "</p>" : "";
  }

  // Desenhados em SVG, não em caractere: a fonte do sistema não decide a forma.
  var ASTERISCO =
    '<svg viewBox="0 0 100 100" aria-hidden="true"><g fill="currentColor">' +
    [0, 45, 90, 135].map(function (a) {
      return '<rect x="44" y="14" width="12" height="72" rx="6" transform="rotate(' + a + ' 50 50)"/>';
    }).join("") + "</g></svg>";
  var VERIFICADO =
    '<svg class="verificado" viewBox="0 0 24 24" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="11" fill="var(--amarelo)"/>' +
    '<path d="M6.5 12.4l3.6 3.6 7.4-7.6" fill="none" stroke="var(--escuro)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  /** Gradiente da capa: foto limpa em cima, escuro só na base, na cor do fundo. */
  function veuDaCapa(cor) {
    return "background:linear-gradient(180deg," + rgba(cor, 0.55) + " 0%," + rgba(cor, 0) + " 16%," +
      rgba(cor, 0) + " 42%," + rgba(cor, 0.78) + " 66%," + rgba(cor, 0.96) + " 100%)";
  }

  // ── renderizadores por tipo ───────────────────────────────────────────────

  var RENDER = {
    capa: function (s, ctx) {
      var capa = ctx.imagem(s.imagem);
      // selo "asterisco": círculo âmbar com asterisco, como os selos de revista.
      // "logo" mantém a marca/foto do autor no círculo.
      var selo = s.selo && s.selo.foto
        ? foto(ctx.imagem({ arquivo: s.selo.foto }), "selo-foto")
        : ctx.seloEstilo !== "logo"
          ? '<div class="selo-asterisco">' + ASTERISCO + "</div>"
          : ctx.logo
            ? foto(ctx.logo, "selo-logo")
            : '<div class="selo-marca">' + esc(ctx.seloTexto || "NC") + "</div>";
      var veu = s.cores && hexValido(s.cores.fundo) ? ' style="' + veuDaCapa(s.cores.fundo) + '"' : "";
      return (
        foto(capa, "capa-img", { enquadravel: true, enquadramento: s.imagem && s.imagem.enquadramento }) +
        '<div class="capa-veu"' + veu + "></div>" +
        '<div class="corpo base">' +
          '<div class="selo">' + selo + '<span class="selo-nome">' + esc(ctx.handle) + VERIFICADO + "</span></div>" +
          '<h1 class="capa-titulo"' + campo("titulo", true) + ">" + rico(s.titulo) + "</h1>" +
          (s.gancho ? '<div class="gancho"' + campo("gancho", true) + ">" + rico(s.gancho) + "</div>" : "") +
          '<div class="arraste"' + campo("arraste") + ">" + esc(s.arraste || "Arraste para o lado ›››") + "</div>" +
        "</div>"
      );
    },

    texto: function (s) {
      return (
        '<div class="corpo">' +
          label(s) +
          (s.titulo ? '<h2 class="titulo"' + campo("titulo", true) + ">" + rico(s.titulo) + "</h2>" : "") +
          corpoTexto(s) +
          fonteNota(s) +
        "</div>"
      );
    },

    imagem: function (s, ctx) {
      var src = ctx.imagem(s.imagem);
      return (
        '<div class="corpo">' +
          label(s) +
          (s.titulo ? '<h2 class="titulo"' + campo("titulo", true) + ">" + rico(s.titulo) + "</h2>" : "") +
          (src
            ? '<figure class="figura' + (s.retrato ? " retrato" : "") + '">' +
                foto(src, "foto", { enquadravel: true, enquadramento: s.imagem && s.imagem.enquadramento }) +
                (s.credito ? "<figcaption" + campo("credito") + ">" + esc(s.credito) + "</figcaption>" : "") +
              "</figure>"
            : "") +
          corpoTexto(s) +
          fonteNota(s) +
        "</div>"
      );
    },

    faixa: function (s) {
      var itens = (s.itens || []).map(function (it, ix) { return "<li" + campo("itens." + ix, true) + ">" + rico(it) + "</li>"; }).join("");
      return (
        '<div class="corpo">' +
          (s.intro ? '<p class="texto"' + campo("intro", true) + ">" + rico(s.intro) + "</p>" : "") +
          (s.faixa ? '<div class="faixa"' + campo("faixa", true) + ">" + rico(s.faixa) + "</div>" : "") +
          (itens ? '<ul class="lista">' + itens + "</ul>" : "") +
          fonteNota(s) +
        "</div>"
      );
    },

    lista: function (s) {
      var itens = (s.itens || []).map(function (it, ix) { return "<li" + campo("itens." + ix, true) + ">" + rico(it) + "</li>"; }).join("");
      return (
        '<div class="corpo">' +
          label(s) +
          (s.titulo ? '<h2 class="titulo"' + campo("titulo", true) + ">" + rico(s.titulo) + "</h2>" : "") +
          (itens ? '<ul class="lista">' + itens + "</ul>" : "") +
          corpoTexto(s) +
          fonteNota(s) +
        "</div>"
      );
    },

    passos: function (s) {
      var itens = (s.passos || []).map(function (p, i) {
        return (
          "<li>" +
            '<span class="n">' + (i + 1) + "</span>" +
            "<div>" +
              '<div class="p-titulo"' + campo("passos." + i + ".titulo", true) + ">" + rico(p.titulo || p) + "</div>" +
              (p.texto ? '<div class="p-texto"' + campo("passos." + i + ".texto", true) + ">" + rico(p.texto) + "</div>" : "") +
            "</div>" +
          "</li>"
        );
      }).join("");
      return (
        '<div class="corpo">' +
          label(s) +
          (s.titulo ? '<h2 class="titulo"' + campo("titulo", true) + ">" + rico(s.titulo) + "</h2>" : "") +
          '<ol class="passos">' + itens + "</ol>" +
          fonteNota(s) +
        "</div>"
      );
    },

    metrica: function (s) {
      return (
        '<div class="corpo">' +
          label(s) +
          '<div class="metrica">' +
            '<div class="valor"' + campo("valor") + ">" + esc(s.valor) + "</div>" +
            (s.unidade ? '<div class="unidade"' + campo("unidade") + ">" + esc(s.unidade) + "</div>" : "") +
          "</div>" +
          (s.titulo ? '<h2 class="titulo"' + campo("titulo", true) + ">" + rico(s.titulo) + "</h2>" : "") +
          corpoTexto(s) +
          fonteNota(s) +
        "</div>"
      );
    },

    barras: function (s) {
      var dados = s.dados || [];
      var max = dados.reduce(function (m, d) { return Math.max(m, Number(d.valor) || 0); }, 0) || 1;
      var barras = dados.map(function (d, ix) {
        var pct = Math.max(2, Math.round(((Number(d.valor) || 0) / max) * 100));
        return (
          '<div class="barra' + (d.destaque ? " destaque" : "") + '">' +
            '<div class="barra-topo"><span' + campo("dados." + ix + ".rotulo") + ">" + esc(d.rotulo) + "</span>" +
            '<span class="barra-valor"' + campo("dados." + ix + ".exibicao") + ">" + esc(d.exibicao != null ? d.exibicao : d.valor) + "</span></div>" +
            '<div class="trilho"><div class="preenche" style="width:' + pct + '%"></div></div>' +
          "</div>"
        );
      }).join("");
      return (
        '<div class="corpo">' +
          label(s) +
          (s.titulo ? '<h2 class="titulo"' + campo("titulo", true) + ">" + rico(s.titulo) + "</h2>" : "") +
          '<div class="barras">' + barras + "</div>" +
          corpoTexto(s) +
          fonteNota(s) +
        "</div>"
      );
    },

    tese: function (s, ctx) {
      return (
        '<div class="corpo">' +
          '<p class="tese-texto"' + campo("texto", true) + ">" + rico(s.texto) + "</p>" +
          '<div class="assinatura"' + campo("assinatura") + ">" + esc(s.assinatura || ctx.handle) + "</div>" +
        "</div>"
      );
    },

    cta: function (s, ctx) {
      var retrato = ctx.imagem(s.imagem);
      return (
        (retrato ? '<div class="cta-foto">' + foto(retrato, "foto") + "</div>" : "") +
        '<div class="corpo">' +
          '<h2 class="cta-titulo">' +
            "<span" + campo("titulo", true) + ">" + rico(s.titulo) + "</span>" +
            (s.destaque ? '<span class="cta-caixa"' + campo("destaque", true) + ">" + rico(s.destaque) + "</span>" : "") +
          "</h2>" +
          corpoTexto(s) +
          (s.acao ? '<div class="cta-acao"' + campo("acao", true) + ">" + rico(s.acao) + "</div>" : "") +
        "</div>"
      );
    }
  };

  /** HTML de um slide inteiro, já com cabeçalho e rodapé fixos. */
  function renderSlide(slide, opcoes) {
    var o = opcoes || {};
    var ctx = {
      handle: o.handle || "@profellyssonrocha",
      logo: o.logo || null,
      seloTexto: o.seloTexto || "NC",
      seloEstilo: o.seloEstilo || "asterisco",
      imagem: o.imagem || function () { return null; }
    };
    var tipo = TIPOS.indexOf(slide.tipo) >= 0 ? slide.tipo : "texto";
    var fundo = slide.fundo || (tipo === "capa" ? "foto" : "escuro");
    var cab = o.cabecalho || {};
    var temFoto = tipo === "cta" && ctx.imagem(slide.imagem);
    // capa nasce centralizada (selo e título no eixo); o resto, à esquerda
    var alinha = ALINHAMENTOS.indexOf(slide.alinhamento) >= 0 ? slide.alinhamento : (tipo === "capa" ? "centro" : "esquerda");
    var classes = ["slide", "tipo-" + tipo, "fundo-" + fundo, "alinha-" + alinha].concat(temFoto ? ["tem-foto"] : []);

    var paleta = paletaDoSlide(slide, HEX_FUNDO[fundo] || HEX_FUNDO.escuro);
    var estilo = paleta ? ' style="' + Object.keys(paleta).map(function (k) { return k + ":" + paleta[k]; }).join(";") + '"' : "";
    var pos = posicoesValidas(slide.posicoes);
    var posAttr = pos ? " data-posicoes='" + esc(JSON.stringify(pos)).replace(/'/g, "&#39;") + "'" : "";

    var rodape = o.total
      ? '<footer class="ftr"><span class="traco"></span><span class="num">' +
        esc(o.indice) + " / " + esc(o.total) + "</span></footer>"
      : "";

    return (
      '<section lang="pt-BR" class="' + classes.join(" ") + '" data-indice="' + esc(o.indice || 1) + '"' + estilo + posAttr + ">" +
        '<header class="hdr"><span>' + esc(cab.esquerda || "") + "</span>" +
        "<span>" + esc(cab.centro || ctx.handle) + "</span>" +
        "<span>" + esc(cab.direita || "") + "</span></header>" +
        RENDER[tipo](slide, ctx) +
        rodape +
      "</section>"
    );
  }

  /** HTML de todos os slides, com o ritmo de fundos já aplicado. */
  function renderDeck(carrossel, opcoes) {
    var o = opcoes || {};
    var slides = carrossel.slides || [];
    var fundos = planoDeFundos(slides);
    return slides.map(function (s, i) {
      var comFundo = Object.assign({}, s, { fundo: s.fundo || fundos[i] });
      return renderSlide(comFundo, Object.assign({}, o, { indice: i + 1, total: slides.length }));
    }).join("\n");
  }

  /**
   * Auto-ajuste tipográfico: reduz --k até o conteúdo caber na moldura.
   * Roda no browser e dentro do Playwright — nenhum texto é cortado.
   */
  /**
   * Nomeia os blocos do corpo (filhos diretos de .corpo) com uma chave
   * estável — a classe do bloco, e um número se ela se repete — e aplica o
   * deslocamento que o autor arrastou. O deslocamento é transform: não mexe
   * no fluxo, então o auto-ajuste mede o mesmo texto com ou sem arrasto.
   */
  function posicionarBlocos(slideEl) {
    var corpo = slideEl.querySelector(".corpo");
    if (!corpo) return [];
    var pos = {};
    try { pos = JSON.parse(slideEl.getAttribute("data-posicoes") || "{}") || {}; } catch (e) { pos = {}; }
    var vistos = {};
    var chaves = [];
    for (var i = 0; i < corpo.children.length; i++) {
      var b = corpo.children[i];
      var base = (b.className && String(b.className).split(/\s+/)[0]) || b.tagName.toLowerCase();
      vistos[base] = (vistos[base] || 0) + 1;
      var chave = vistos[base] > 1 ? base + "-" + vistos[base] : base;
      b.setAttribute("data-bloco", chave);
      var p = pos[chave];
      b.style.transform = p ? "translate(" + numero(p.x, 0) + "px," + numero(p.y, 0) + "px)" : "";
      chaves.push(chave);
    }
    return chaves;
  }

  function ajustar(slideEl) {
    posicionarBlocos(slideEl);
    var corpo = slideEl.querySelector(".corpo");
    if (!corpo) return 1;
    var k = 1;
    slideEl.style.setProperty("--k", k);
    var guarda = 0;
    while (corpo.scrollHeight > corpo.clientHeight + 1 && k > 0.62 && guarda++ < 40) {
      k = Math.round((k - 0.02) * 100) / 100;
      slideEl.style.setProperty("--k", k);
    }
    return k;
  }

  function ajustarTodos(raiz) {
    var els = (raiz || document).querySelectorAll(".slide");
    for (var i = 0; i < els.length; i++) ajustar(els[i]);
  }

  return {
    TIPOS: TIPOS,
    FUNDOS: FUNDOS,
    esc: esc,
    rico: rico,
    limpo: limpo,
    planoDeFundos: planoDeFundos,
    renderSlide: renderSlide,
    renderDeck: renderDeck,
    ajustar: ajustar,
    ajustarTodos: ajustarTodos,
    posicionarBlocos: posicionarBlocos,
    contraste: contraste,
    melhorTinta: melhorTinta,
    tintaLegivel: tintaLegivel,
    hexValido: hexValido,
    HEX_FUNDO: HEX_FUNDO,
    ALINHAMENTOS: ALINHAMENTOS
  };
});
