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
  function foto(src, classe) {
    if (!src) return "";
    var limpa = String(src).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    return '<div class="' + classe + '" style="background-image:url(\'' + limpa + '\')"></div>';
  }

  function label(s) {
    return s.label ? '<div class="label">' + esc(s.label) + "</div>" : "";
  }

  function fonteNota(s) {
    return s.fonte ? '<p class="fonte">' + rico(s.fonte) + "</p>" : "";
  }

  function corpoTexto(s) {
    return s.corpo ? '<p class="texto">' + rico(s.corpo) + "</p>" : "";
  }

  // ── renderizadores por tipo ───────────────────────────────────────────────

  var RENDER = {
    capa: function (s, ctx) {
      var capa = ctx.imagem(s.imagem);
      var selo = s.selo && s.selo.foto
        ? foto(ctx.imagem({ arquivo: s.selo.foto }), "selo-foto")
        : ctx.logo
          ? foto(ctx.logo, "selo-logo")
          : '<div class="selo-marca">' + esc(ctx.seloTexto || "NC") + "</div>";
      return (
        foto(capa, "capa-img") +
        '<div class="capa-veu"></div>' +
        '<div class="corpo base">' +
          '<div class="selo">' + selo + '<span class="selo-nome">' + esc(ctx.handle) + "</span></div>" +
          '<h1 class="capa-titulo">' + rico(s.titulo) + "</h1>" +
          (s.gancho ? '<div class="gancho">' + rico(s.gancho) + "</div>" : "") +
          '<div class="arraste">' + esc(s.arraste || "Arraste para o lado ›››") + "</div>" +
        "</div>"
      );
    },

    texto: function (s) {
      return (
        '<div class="corpo">' +
          label(s) +
          (s.titulo ? '<h2 class="titulo">' + rico(s.titulo) + "</h2>" : "") +
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
          (s.titulo ? '<h2 class="titulo">' + rico(s.titulo) + "</h2>" : "") +
          (src
            ? '<figure class="figura' + (s.retrato ? " retrato" : "") + '">' +
                foto(src, "foto") +
                (s.credito ? "<figcaption>" + esc(s.credito) + "</figcaption>" : "") +
              "</figure>"
            : "") +
          corpoTexto(s) +
          fonteNota(s) +
        "</div>"
      );
    },

    faixa: function (s) {
      var itens = (s.itens || []).map(function (i) { return "<li>" + rico(i) + "</li>"; }).join("");
      return (
        '<div class="corpo">' +
          (s.intro ? '<p class="texto">' + rico(s.intro) + "</p>" : "") +
          (s.faixa ? '<div class="faixa">' + rico(s.faixa) + "</div>" : "") +
          (itens ? '<ul class="lista">' + itens + "</ul>" : "") +
          fonteNota(s) +
        "</div>"
      );
    },

    lista: function (s) {
      var itens = (s.itens || []).map(function (i) { return "<li>" + rico(i) + "</li>"; }).join("");
      return (
        '<div class="corpo">' +
          label(s) +
          (s.titulo ? '<h2 class="titulo">' + rico(s.titulo) + "</h2>" : "") +
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
              '<div class="p-titulo">' + rico(p.titulo || p) + "</div>" +
              (p.texto ? '<div class="p-texto">' + rico(p.texto) + "</div>" : "") +
            "</div>" +
          "</li>"
        );
      }).join("");
      return (
        '<div class="corpo">' +
          label(s) +
          (s.titulo ? '<h2 class="titulo">' + rico(s.titulo) + "</h2>" : "") +
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
            '<div class="valor">' + esc(s.valor) + "</div>" +
            (s.unidade ? '<div class="unidade">' + esc(s.unidade) + "</div>" : "") +
          "</div>" +
          (s.titulo ? '<h2 class="titulo">' + rico(s.titulo) + "</h2>" : "") +
          corpoTexto(s) +
          fonteNota(s) +
        "</div>"
      );
    },

    barras: function (s) {
      var dados = s.dados || [];
      var max = dados.reduce(function (m, d) { return Math.max(m, Number(d.valor) || 0); }, 0) || 1;
      var barras = dados.map(function (d) {
        var pct = Math.max(2, Math.round(((Number(d.valor) || 0) / max) * 100));
        return (
          '<div class="barra' + (d.destaque ? " destaque" : "") + '">' +
            '<div class="barra-topo"><span>' + esc(d.rotulo) + '</span>' +
            '<span class="barra-valor">' + esc(d.exibicao != null ? d.exibicao : d.valor) + "</span></div>" +
            '<div class="trilho"><div class="preenche" style="width:' + pct + '%"></div></div>' +
          "</div>"
        );
      }).join("");
      return (
        '<div class="corpo">' +
          label(s) +
          (s.titulo ? '<h2 class="titulo">' + rico(s.titulo) + "</h2>" : "") +
          '<div class="barras">' + barras + "</div>" +
          corpoTexto(s) +
          fonteNota(s) +
        "</div>"
      );
    },

    tese: function (s, ctx) {
      return (
        '<div class="corpo">' +
          '<p class="tese-texto">' + rico(s.texto) + "</p>" +
          '<div class="assinatura">' + esc(s.assinatura || ctx.handle) + "</div>" +
        "</div>"
      );
    },

    cta: function (s, ctx) {
      var retrato = ctx.imagem(s.imagem);
      return (
        (retrato ? '<div class="cta-foto">' + foto(retrato, "foto") + "</div>" : "") +
        '<div class="corpo">' +
          '<h2 class="cta-titulo">' +
            "<span>" + rico(s.titulo) + "</span>" +
            (s.destaque ? '<span class="cta-caixa">' + rico(s.destaque) + "</span>" : "") +
          "</h2>" +
          corpoTexto(s) +
          (s.acao ? '<div class="cta-acao">' + rico(s.acao) + "</div>" : "") +
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
      imagem: o.imagem || function () { return null; }
    };
    var tipo = TIPOS.indexOf(slide.tipo) >= 0 ? slide.tipo : "texto";
    var fundo = slide.fundo || (tipo === "capa" ? "foto" : "escuro");
    var cab = o.cabecalho || {};
    var temFoto = tipo === "cta" && ctx.imagem(slide.imagem);
    var classes = ["slide", "tipo-" + tipo, "fundo-" + fundo].concat(temFoto ? ["tem-foto"] : []);

    var rodape = o.total
      ? '<footer class="ftr"><span class="traco"></span><span class="num">' +
        esc(o.indice) + " / " + esc(o.total) + "</span></footer>"
      : "";

    return (
      '<section class="' + classes.join(" ") + '" data-indice="' + esc(o.indice || 1) + '">' +
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
  function ajustar(slideEl) {
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
    ajustarTodos: ajustarTodos
  };
});
