/* ──────────────────────────────────────────────────────────────────────────
   Validação de schema + lint da voz da marca.
   Compartilhado pela CLI e pelo artifact: o texto gerado passa pelas mesmas
   regras nos dois lugares, e a CLI ainda manda os erros de volta ao Claude.
   ────────────────────────────────────────────────────────────────────────── */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CarrosselLint = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var OBRIGATORIOS = {
    capa: ["titulo"],
    faixa: ["faixa"],
    texto: ["titulo", "corpo"],
    imagem: ["titulo"],
    lista: ["titulo", "itens"],
    passos: ["titulo", "passos"],
    metrica: ["valor"],
    barras: ["titulo", "dados"],
    tese: ["texto"],
    cta: ["titulo", "acao"]
  };

  var EMOJI = /[\u203C-\u3299\u{1F000}-\u{1FAFF}\u{FE0F}]/u;

  var PADROES = [
    { re: /voc[êe] j[áa] (se perguntou|parou para pensar|reparou que)/i, regra: "abertura com pergunta retórica genérica", sev: "erro" },
    { re: /n[ãa]o [ée] [^.,;!?]{3,40}, [ée] /i, regra: 'construção "não é X, é Y"', sev: "erro" },
    { re: /\b(incr[íi]vel|poderos[oa]|revolucion[áa]ri[oa]|impression[ao]nte|simplesmente|indispens[áa]vel)\b/i, regra: "adjetivo de venda vazio", sev: "erro" },
    { re: /\b(buscando|visando|objetivando|procurando)\s+\w+r\b/i, regra: "gerúndio de preenchimento", sev: "erro" },
    { re: /\b(no fim das contas|ao final do dia|o que realmente importa [ée])\b/i, regra: "conclusão genérica", sev: "erro" },
    { re: /\bo candidato\b/i, regra: "terceira pessoa (use 'você')", sev: "erro" },
    { re: /\bn[óo]s (te|lhe) (ajudamos|ensinamos)\b/i, regra: "primeira pessoa do plural institucional", sev: "erro" },
    { re: /\b(desvende|destrave|domine de uma vez|segredo que ningu[ée]m conta)\b/i, regra: "clichê de infoproduto", sev: "erro" },
    { re: /\bcinza\b.*\bazul\b/i, regra: "menção a texto cinza sobre azul", sev: "aviso" }
  ];

  var CAMPOS_TEXTO = ["titulo", "corpo", "texto", "intro", "faixa", "gancho", "acao", "destaque", "label", "fonte", "credito", "unidade", "assinatura"];

  function textosDoSlide(s) {
    var out = [];
    CAMPOS_TEXTO.forEach(function (c) { if (typeof s[c] === "string" && s[c]) out.push([c, s[c]]); });
    (s.itens || []).forEach(function (i, n) { if (typeof i === "string") out.push(["itens[" + n + "]", i]); });
    (s.passos || []).forEach(function (p, n) {
      if (p && p.titulo) out.push(["passos[" + n + "].titulo", p.titulo]);
      if (p && p.texto) out.push(["passos[" + n + "].texto", p.texto]);
    });
    (s.dados || []).forEach(function (d, n) { if (d && d.rotulo) out.push(["dados[" + n + "].rotulo", d.rotulo]); });
    return out;
  }

  function palavras(s) {
    return String(s || "").replace(/\*/g, "").trim().split(/\s+/).filter(Boolean).length;
  }

  function validarSchema(c) {
    var erros = [];
    if (!c || typeof c !== "object") return [{ severidade: "erro", regra: "resposta não é um objeto JSON" }];
    if (!Array.isArray(c.slides) || !c.slides.length) erros.push({ severidade: "erro", regra: "campo slides ausente ou vazio" });
    (c.slides || []).forEach(function (s, i) {
      var pos = i + 1;
      if (!s || !s.tipo) { erros.push({ slide: pos, severidade: "erro", regra: "slide sem campo tipo" }); return; }
      var req = OBRIGATORIOS[s.tipo];
      if (!req) { erros.push({ slide: pos, severidade: "erro", regra: "tipo desconhecido: " + s.tipo }); return; }
      req.forEach(function (campo) {
        var v = s[campo];
        var vazio = v == null || v === "" || (Array.isArray(v) && !v.length);
        if (vazio) erros.push({ slide: pos, campo: campo, severidade: "erro", regra: "campo obrigatório ausente no tipo " + s.tipo });
      });
    });
    if ((c.slides || [])[0] && c.slides[0].tipo !== "capa") erros.push({ slide: 1, severidade: "erro", regra: "o primeiro slide precisa ser a capa" });
    var ult = (c.slides || [])[(c.slides || []).length - 1];
    if (ult && ult.tipo !== "cta") erros.push({ slide: (c.slides || []).length, severidade: "erro", regra: "o último slide precisa ser o CTA" });
    if (!c.legenda) erros.push({ severidade: "aviso", regra: "legenda ausente" });
    if (!Array.isArray(c.hashtags) || c.hashtags.length < 4) erros.push({ severidade: "aviso", regra: "menos de 4 hashtags" });
    return erros;
  }

  function lint(c, brand) {
    var achados = validarSchema(c);
    var b = brand || {};
    var travessoesTotais = 0;

    (c.slides || []).forEach(function (s, i) {
      var pos = i + 1;
      var marcas = 0;

      textosDoSlide(s).forEach(function (par) {
        var campo = par[0], txt = par[1];
        if (EMOJI.test(txt)) achados.push({ slide: pos, campo: campo, severidade: "erro", regra: "emoji", trecho: txt.slice(0, 60) });
        PADROES.forEach(function (p) {
          if (p.re.test(txt)) achados.push({ slide: pos, campo: campo, severidade: p.sev, regra: p.regra, trecho: txt.slice(0, 80) });
        });
        if (/^[^a-z\u00e0-\u00fa]{8,}$/.test(txt.replace(/\*/g, "")) && campo !== "label" && campo !== "unidade") {
          achados.push({ slide: pos, campo: campo, severidade: "erro", regra: "texto em caixa alta fora de label", trecho: txt.slice(0, 60) });
        }
        if (/^#{1,6}\s|^\s*[-•]\s/.test(txt)) achados.push({ slide: pos, campo: campo, severidade: "erro", regra: "markdown cru no texto", trecho: txt.slice(0, 60) });
        marcas += (txt.match(/\*\*[^*]+\*\*/g) || []).length;
        travessoesTotais += (txt.match(/—/g) || []).length;
      });

      if (marcas > 1) achados.push({ slide: pos, severidade: "aviso", regra: "mais de um destaque amarelo no mesmo slide (" + marcas + ")" });
      if (s.tipo === "capa" && palavras(s.titulo) > 9) achados.push({ slide: pos, campo: "titulo", severidade: "aviso", regra: "título de capa com mais de 8 palavras" });
      if (s.corpo && palavras(s.corpo) > 85) achados.push({ slide: pos, campo: "corpo", severidade: "aviso", regra: "slide com mais de 85 palavras (alvo: 40 a 70)" });
      if (Array.isArray(s.itens) && s.itens.length === 3) achados.push({ slide: pos, severidade: "aviso", regra: "lista de exatamente três itens (vício de escrita gerada)" });
      if (s.tipo === "cta") {
        var chave = (c.meta || {}).palavraCta;
        if (chave && s.acao && s.acao.toUpperCase().indexOf(String(chave).toUpperCase()) < 0) {
          achados.push({ slide: pos, campo: "acao", severidade: "erro", regra: "o CTA não pede o comentário com a palavra " + chave });
        }
      }
      if ((s.tipo === "capa" || s.tipo === "imagem") && !(s.imagem && (s.imagem.prompt || s.imagem.arquivo || s.imagem.url))) {
        achados.push({ slide: pos, campo: "imagem", severidade: "aviso", regra: "slide de imagem sem prompt nem arquivo" });
      }
    });

    if (travessoesTotais > 2) achados.push({ severidade: "aviso", regra: "travessão usado " + travessoesTotais + " vezes como pausa dramática" });

    if (Array.isArray(c.hashtags)) {
      c.hashtags.forEach(function (h) {
        if (/[A-Z\u00c0-\u00da]/.test(h)) achados.push({ campo: "hashtags", severidade: "aviso", regra: "hashtag com maiúscula: " + h });
      });
      var raizes = {};
      c.hashtags.forEach(function (h) {
        var r = String(h).replace(/^#/, "").slice(0, 6).toLowerCase();
        raizes[r] = (raizes[r] || 0) + 1;
        if (raizes[r] === 2) achados.push({ campo: "hashtags", severidade: "aviso", regra: "hashtags com a mesma raiz: " + h });
      });
    }
    if (c.legenda && EMOJI.test(c.legenda)) achados.push({ campo: "legenda", severidade: "erro", regra: "emoji na legenda" });

    void b;
    return achados;
  }

  function erros(achados) { return (achados || []).filter(function (a) { return a.severidade === "erro"; }); }

  function formatar(achados) {
    return (achados || []).map(function (a) {
      return (a.severidade === "erro" ? "ERRO " : "aviso") +
        " · " + (a.slide ? "slide " + a.slide : "carrossel") +
        (a.campo ? " · " + a.campo : "") +
        " · " + a.regra + (a.trecho ? ' · "' + a.trecho + '"' : "");
    }).join("\n");
  }

  return { lint: lint, validarSchema: validarSchema, erros: erros, formatar: formatar, OBRIGATORIOS: OBRIGATORIOS };
});
