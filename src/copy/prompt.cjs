/* ──────────────────────────────────────────────────────────────────────────
   Pacote de instruções enviado ao Claude a cada geração.
   Não existe memória entre chamadas: tudo o que a voz da marca precisa vai
   aqui dentro, montado a partir de brand/brand.json. Arquivo compartilhado
   pela CLI e pelo artifact publicado — regra escrita uma vez só.
   ────────────────────────────────────────────────────────────────────────── */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CarrosselPrompt = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var CONTRATO_SLIDES = [
    '{"tipo":"capa","titulo":"até 8 palavras, sentence case, com **palavra** marcada","gancho":"pergunta-gancho curta da caixa amarela","imagem":{"prompt":"prompt de imagem em inglês"}}',
    '{"tipo":"faixa","intro":"parágrafo de abertura","faixa":"título curto da seção, até 4 palavras","itens":["bullet","bullet"]}',
    '{"tipo":"texto","label":"LABEL OPCIONAL","titulo":"título do slide","corpo":"parágrafo de 40 a 70 palavras","fonte":"Fonte: veículo/documento (opcional)"}',
    '{"tipo":"imagem","titulo":"título","imagem":{"prompt":"prompt de imagem em inglês"},"corpo":"parágrafo de apoio","credito":"legenda curta opcional"}',
    '{"tipo":"lista","titulo":"título","itens":["item","item","item","item"]}',
    '{"tipo":"passos","titulo":"título","passos":[{"titulo":"passo","texto":"uma linha"}]}',
    '{"tipo":"metrica","valor":"745.368","unidade":"MENÇÕES EM 7 DIAS","titulo":"o que o número significa","corpo":"parágrafo curto","fonte":"Fonte: ..."}',
    '{"tipo":"barras","titulo":"título","dados":[{"rotulo":"Item","valor":40,"exibicao":"40%","destaque":true}],"fonte":"Fonte: ..."}',
    '{"tipo":"tese","texto":"frase-tese de uma ou duas linhas, com **palavra** marcada"}',
    '{"tipo":"cta","titulo":"primeira linha","destaque":"segunda linha (vai dentro da caixa amarela)","corpo":"duas linhas de contexto","acao":"Comenta **PALAVRA** que eu te mando ... na DM."}'
  ];

  function esqueleto(n) {
    var meio = Math.max(1, n - 5);
    return [
      "1. capa",
      "2. faixa — contexto do problema, com a faixa amarela nomeando a seção",
      "3 a " + (2 + meio) + ". desenvolvimento (" + meio + " slides): alterne entre texto, imagem, lista, passos, metrica e barras. " +
        "Inclua pelo menos 1 slide com imagem e pelo menos 1 slide de dado (metrica ou barras).",
      (3 + meio) + ". ressalva — o limite do argumento, o que o dado não prova, o que ainda pode mudar",
      (4 + meio) + ". tese — a lição para quem estuda, em uma frase",
      n + ". cta"
    ].join("\n");
  }

  function regrasImagem(brand) {
    var im = brand.imagem || {};
    return [
      "Prompts de imagem (campo imagem.prompt), escritos em inglês, 25 a 45 palavras:",
      "- Estilo obrigatório em todo prompt: " + (im.estilo || ""),
      "- Nunca peça: " + (im.negativo || ""),
      "- A imagem ilustra o assunto por objeto, ambiente ou gesto — mesa de trabalho, corredor institucional, papel, mãos, sala de sessão, cronômetro. Nunca peça gráfico, número ou palavra dentro da imagem: dado é slide, não imagem.",
      "- Nunca descreva pessoa pública real, brasão oficial ou logotipo.",
      "- Capa em " + (im.proporcaoCapa || "4:5") + "; slides internos em " + (im.proporcaoInterna || "16:9") + "."
    ].join("\n");
  }

  /** Instruções de voz, público e proibições — o núcleo que nunca muda. */
  function base(brand) {
    var v = brand.voz || {};
    return [
      "Você escreve carrosséis de Instagram para " + brand.marca + " (" + brand.handle + ").",
      "Autor: " + brand.autor + ".",
      "Público: " + brand.publico,
      "Tese central da marca: " + brand.tese,
      "",
      "VOZ",
      "- Idioma: " + v.idioma + ". Pessoa: " + v.pessoa,
      "- Tom: " + v.tom,
      "- Registro de referência: " + (v.registro || []).join(" / "),
      "- " + v.casing + ".",
      "- " + v.tamanhoSlide + ".",
      "- Toda afirmação forte vem com número, nome, cargo ou documento. Sem número inventado: se não souber o dado, escreva o slide sem ele.",
      "",
      "PROIBIDO (o texto não pode soar gerado):",
      (brand.proibicoes || []).map(function (p) { return "- " + p; }).join("\n"),
      "",
      "MARCAÇÃO INLINE",
      "- **palavra** coloca o retângulo amarelo atrás da palavra. Use no máximo uma vez por slide, na ideia-chave.",
      "- *palavra* deixa em negrito. Use com parcimônia.",
      "- Nada de markdown além desses dois. Sem emoji em nenhum campo."
    ].join("\n");
  }

  /**
   * Prompt de um carrossel inteiro.
   * opts: {tema, tipo, nSlides, palavraCta, contexto, fonte}
   */
  function carrossel(brand, opts) {
    var o = opts || {};
    var n = Math.min(10, Math.max(6, Number(o.nSlides) || 9));
    var linha = (brand.linhasEditoriais || {})[o.tipo] || {};
    return [
      base(brand),
      "",
      "LINHA EDITORIAL: " + (linha.nome || o.tipo),
      linha.descricao ? "- " + linha.descricao : "",
      o.tipo === "tcu"
        ? "- Use somente decisão publicada e informação pública, sempre com fonte no slide. Não comente processo em curso nem atribua intenção a pessoa."
        : "",
      "",
      "TEMA: " + o.tema,
      o.contexto ? "\nCONTEXTO FORNECIDO PELO AUTOR (use como matéria-prima, é verdade verificada):\n" + o.contexto : "",
      "",
      "ESTRUTURA — exatamente " + n + " slides, nesta ordem:",
      esqueleto(n),
      "",
      "TIPOS DE SLIDE DISPONÍVEIS (use os campos exatamente como abaixo):",
      CONTRATO_SLIDES.join("\n"),
      "",
      regrasImagem(brand),
      "",
      "PALAVRA-CHAVE DO CTA: " + (o.palavraCta || (brand.palavrasChaveCta || ["CONTROLE"])[0]) +
        ". O último slide sempre termina pedindo o comentário com essa palavra.",
      "",
      "LEGENDA: 3 a 5 parágrafos curtos, repetindo a tese e o dado central, terminando em pergunta aberta para o leitor. Sem emoji.",
      "HASHTAGS: 6 a 10, minúsculas, separadas por espaço, sem repetir a mesma raiz.",
      "",
      "SAÍDA — responda com um único objeto JSON válido, sem cercas de código, sem comentário, sem texto antes ou depois:",
      '{"meta":{"tema":"","tipo":"' + (o.tipo || "") + '","linha":"' + (linha.nome || "") + '","palavraCta":"' +
        (o.palavraCta || "CONTROLE") + '"},"slides":[...],"legenda":"","hashtags":["#..."]}'
    ].filter(Boolean).join("\n");
  }

  /** Prompt para regerar um slide só, mantendo o resto do carrossel intacto. */
  function slide(brand, carrosselAtual, indice, instrucao) {
    var s = (carrosselAtual.slides || [])[indice] || {};
    var vizinhos = (carrosselAtual.slides || []).map(function (x, i) {
      return (i + 1) + ". [" + x.tipo + "] " + (x.titulo || x.texto || x.faixa || x.intro || "").slice(0, 90);
    }).join("\n");
    return [
      base(brand),
      "",
      "Este é o carrossel atual, tema \"" + ((carrosselAtual.meta || {}).tema || "") + "\":",
      vizinhos,
      "",
      "Reescreva SOMENTE o slide " + (indice + 1) + ", do tipo \"" + (s.tipo || "texto") + "\".",
      "Ele não pode repetir o que os outros slides já dizem, e precisa continuar encaixando entre o anterior e o seguinte.",
      instrucao ? "Instrução do autor: " + instrucao : "",
      "",
      "Slide atual:",
      JSON.stringify(s),
      "",
      regrasImagem(brand),
      "",
      "SAÍDA — responda com um único objeto JSON do slide, com os mesmos campos do tipo, sem cercas de código e sem texto em volta."
    ].filter(Boolean).join("\n");
  }

  /** Prompt do roteiro de Reels (30 a 45 segundos). */
  function roteiro(brand, opts) {
    var o = opts || {};
    return [
      base(brand),
      "",
      "Escreva um roteiro de Reels de 30 a 45 segundos sobre: " + o.tema,
      o.contexto ? "Contexto fornecido pelo autor:\n" + o.contexto : "",
      "Fale em voz alta, para ser lido em teleprompter: frases curtas, nada de subordinada longa.",
      "Estime o tempo a 150 palavras por minuto.",
      "",
      "SAÍDA — um único objeto JSON, sem cercas de código:",
      '{"gancho":"3 segundos, no máximo 12 palavras","blocos":[{"tempo":"0:03","texto":"..."}],',
      '"cta":"fechamento falado","legenda":"legenda do post","hashtags":["#..."],"duracaoEstimadaSegundos":38}'
    ].filter(Boolean).join("\n");
  }

  return { base: base, carrossel: carrossel, slide: slide, roteiro: roteiro, esqueleto: esqueleto };
});
