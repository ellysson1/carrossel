# Decisões de arquitetura

As seis decisões que o documento de necessidades deixou em aberto, mais as três que
apareceram na implementação.

## 1. Como empacotar as instruções a cada geração, sem memória entre chamadas

`src/copy/prompt.cjs` monta o pacote a partir de `brand/brand.json` — voz, público,
tese, proibições, linha editorial, contrato de campos por tipo de slide, regras de
prompt de imagem e formato de saída. É um arquivo só, em UMD, lido pela CLI via
`require` e injetado no artifact pelo `scripts/build-artifact.js`.

Consequência prática: a regra de marca é editada em `brand.json`, e tanto a CLI quanto
a página publicada passam a obedecê-la na geração seguinte. Não existe cópia da voz da
marca escrita à mão dentro da página.

## 2. Uma chamada por carrossel ou uma por slide

**Uma por carrossel**, com regeneração granular por slide.

Um carrossel é uma narrativa: contexto, virada, evidência, ressalva, tese. Gerado slide
a slide, cada chamada repetiria o argumento do anterior — e custaria 9 requisições em
vez de 1. Então a geração inicial é uma chamada única (`prompt.carrossel`), e o conserto
é pontual (`prompt.slide`), que recebe o mapa do carrossel inteiro para não repetir o
que os vizinhos já dizem.

## 3. Histórico e rascunhos

Coleção `carrosseis` no `db` do artifact: `{tema, tipo, atualizadoEm, carrossel}`, com
`onSnapshot` ordenando por `atualizadoEm`. Salva depois de gerar, depois de regerar um
slide e depois de trocar uma imagem — nunca no carregamento da página.

Na CLI o histórico é o sistema de arquivos: uma pasta por carrossel em `out/`, com o
JSON como fonte. Editar o JSON e rodar `render` de novo é o caminho de correção.

## 4. Captura do PNG, com a fonte certa

Duas estratégias, pela mesma folha de estilo:

- **CLI** — Chromium pelo Playwright, viewport 1080×1350, `deviceScaleFactor: 1`,
  screenshot por elemento. A Nunito vai **embutida em base64** no HTML da prévia: a
  renderização não depende de rede, então o PNG nunca sai com a fonte trocada porque
  o Google Fonts demorou. Antes de capturar: `document.fonts.ready`, imagens carregadas
  e auto-ajuste tipográfico rodado.
- **Artifact** — `html2canvas` sobre um palco fora da tela em tamanho real (não sobre a
  prévia escalada, que é `transform: scale()` e a captura leria errado), depois de
  `document.fonts.ready`. O ZIP sai pelo `JSZip` e é entregue pela capability
  `downloads` — a página nunca baixa nada sozinha.

Por isso as imagens entram como `background-image` e não como `<img>`: `object-fit`
não sobrevive à captura do `html2canvas`, `background-size: cover` sobrevive. A mesma
marcação serve aos dois renderizadores.

## 5. Degradação quando a geração não está disponível

A página checa `claude.use("sample")` e, com `null` ou consentimento negado, troca o
selo para **Modo diagramador**, desliga os botões de escrita e mantém o caminho manual:
colar o `carrossel.json`, editar na prévia e exportar. Cada capability é verificada por
si — sem `assets`, a imagem vira `dataURL` local; sem `downloads`, a página explica em
vez de quebrar; sem `db`, some o histórico e o resto continua.

## 6. Versão em Claude Code para lote

Sim, e é a superfície principal: `carrossel lote temas.txt` roda o pipeline inteiro por
tema, em sequência, com cache de imagem por hash de prompt. É também o único lugar onde
a chave da Kie/Gemini existe.

---

## 7. Onde a chave de imagem pode morar (decidido pela plataforma, não por gosto)

Página publicada no claude.ai não tem rede para fora: o sandbox libera as capabilities
e os CDNs da lista, e nada mais. Some-se a isso que chave em página publicada vaza para
quem abrir o link. Logo, geração de imagem é trabalho da CLI, na máquina do autor. A
ponte entre as duas superfícies é o prompt: a página escreve e oferece o prompt pronto
para copiar; a CLI gera em lote.

## 8. Lint como parte da geração, não como relatório

O lint roda dentro do laço de geração da CLI: achou erro, o carrossel volta ao Claude
com a lista de violações e o pedido de corrigir só aquilo, até três vezes. O que chega
ao disco já passou pelas regras. No artifact o mesmo lint roda depois da geração e
aponta na tela — lá quem corrige é você, editando o campo.

## 9. Auto-ajuste tipográfico em vez de contagem de caracteres

Limitar o texto por número de caracteres erra nos dois sentidos: corta frase boa e
deixa passar frase que estoura. O motor usa um multiplicador (`--k`) aplicado a todas
as fontes do corpo do slide e o reduz de 2% em 2% até o conteúdo caber na moldura de
1080×1350. `carrossel render` avisa quais slides precisaram encolher mais de 15%, que
é o sinal de que o texto ficou longo demais para a peça.
