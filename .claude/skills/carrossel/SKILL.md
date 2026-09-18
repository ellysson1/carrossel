---
name: carrossel
description: Produz carrosséis e roteiros de Reels do @profellyssonrocha (marca No Controle) do tema ao PNG pronto para publicar - texto pelo Claude na voz da marca, imagens pela Kie ou Gemini, PNG 1080x1350 pelo Chromium - e leva o resultado para o app no celular. Use sempre que o usuario disser "gera um carrossel", "carrossel sobre X", "faz um post sobre", "carrossel do TCU", "carrossel do edital", "roteiro de reels", "roteiro pro reels", "manda pro app", "sobe pro artifact", "os temas da semana", "carrosseis da semana", "regera o slide N", "troca a imagem do slide", ou pedir para revisar/renderizar de novo um carrossel ja gerado - mesmo sem citar "No Controle" ou "Instagram", se o contexto for producao de conteudo para concurso.
---

# Carrossel No Controle

Pipeline de produção do @profellyssonrocha. Você opera a CLI do repositório
`carrossel`; o usuário não digita comando nenhum.

## Antes de tudo

1. O repositório precisa estar na máquina. Se não estiver, clone:
   `git clone -b claude/wonderful-goodall-gpb4va https://github.com/ellysson1/carrossel`
2. Rode todos os comandos **de dentro da pasta do repositório**.
3. Primeira vez na máquina: `npm install` e `npx playwright install chromium`.
4. Confira o ambiente com `node bin/carrossel.js doctor`. Se ele acusar falta de
   chave, peça ao usuário para preencher `KIE_API_KEY` no `.env` (crie com
   `cp .env.example .env`) — **nunca peça a chave no chat**.

O `.env` é local e está no `.gitignore`. Não o leia, não o imprima, não o commite.

## Decidir o que o usuário quer

| O que ele diz | O que rodar |
|---|---|
| "gera um carrossel sobre X" | pipeline completo |
| "carrossel do TCU sobre X" / cita acórdão, fiscalização | pipeline com `--tipo tcu --cta TCU` |
| "carrossel do edital de X" | `--tipo edital --cta EDITAL` |
| "case de aluno", "aprovação", "antes e depois" | `--tipo prova-social` ou `--tipo autoridade` |
| "roteiro de reels sobre X" | `node bin/carrossel.js roteiro --tema "X"` |
| lista de temas, "os temas da semana" | escreva um `.txt` (uma linha `tipo \| tema`) e rode `lote` |
| "muda o slide 4", "regera o slide 4" | `node bin/carrossel.js slide <pasta> 4 --instrucao "..."` |
| "renderiza de novo", depois de editar texto | `node bin/carrossel.js render <pasta>` |

Linhas editoriais disponíveis: `metodo`, `plataforma`, `autoridade`, `prova-social`,
`tcu`, `edital`. Na dúvida entre duas, pergunte — é uma pergunta, não um formulário.

**Material de apoio.** Todo número que entra na peça precisa vir de fonte real. Se o
tema envolve acórdão, edital, fiscalização ou resultado de aluno e o usuário não anexou
nada, pergunte se ele tem o material antes de gerar. Tendo: salve num arquivo e passe
`--contexto <arquivo>`. Não tendo: gere assim mesmo, mas avise que a peça vai ficar no
terreno do método, sem número.

## Pipeline completo

```
node bin/carrossel.js novo --tema "<tema>" --tipo <linha> --slides 9 --cta <PALAVRA> [--contexto <arquivo>]
```

Leva de 4 a 6 minutos: o texto demora ~2 min, cada imagem ~60 s (duas em paralelo),
o render ~20 s. Não interrompa achando que travou. Diga ao usuário o que está
acontecendo em cada etapa, em uma linha — não cole a saída crua do terminal.

A saída fica em `out/<data>-<tema>/`: `png/` (os slides na ordem), `legenda.txt`,
`carrossel.json`, `preview.html`, `img/`.

Quando terminar:

1. Entregue os PNG ao usuário com a ferramenta de enviar arquivos, na ordem, mais a
   legenda em texto no chat.
2. Leve para o app (abaixo), a menos que ele peça para não levar.
3. Se o comando avisar "Texto apertado em: slide N", diga qual slide ficou apertado e
   ofereça encurtar aquele slide — não deixe passar calado.
4. Se alguma imagem falhar, diga quais slides ficaram sem foto e ofereça rodar
   `node bin/carrossel.js imagens <pasta>` de novo. O carrossel continua publicável:
   fundo sólido é identidade da marca.

## Levar para o app do celular

O app é o artifact **Carrossel No Controle**. Descubra a URL dele listando os artifacts
do usuário (procure por esse título) e confirme com ele na primeira vez.

```
node scripts/preparar-app.js out/<pasta> --listar
```

Isso devolve `docId` e a lista de imagens. Então:

1. Suba as imagens para o acervo do artifact — uma chamada só da ferramenta de
   artifact, com `asset: true` e os caminhos em `file_paths`. Guarde a url `/_blob/…`
   que cada uma recebe.
2. Monte o documento:
   ```
   node scripts/preparar-app.js out/<pasta> --urls '{"img/slide-01-ab.png":"/_blob/…"}'
   ```
   As chaves são os caminhos relativos que o `--listar` imprimiu.
3. Grave na base do artifact com a ferramenta de dados: ação `set`, coleção
   `carrosseis`, `doc_id` o que o script devolveu, `file_path` o `app-doc.json`.

Pronto: o carrossel aparece no **Histórico** da página, com as fotos, para ele revisar,
editar qualquer frase e exportar o `.zip` pelo celular.

Nunca grave na base um carrossel de teste, e nunca apague documento que você não criou
nesta conversa.

## Regras da marca

Elas já estão dentro da ferramenta — `brand/brand.json` para paleta e voz,
`src/copy/lint.cjs` para as proibições — e o lint realimenta o Claude até o texto passar.
Você não precisa repeti-las no prompt. Mas confira três coisas antes de entregar:

- **Fonte no slide** quando houver dado externo. Sem fonte, peça o material ou tire o número.
- **Processo em curso do TCU não vira post.** Só decisão publicada e informação pública.
  Se o tema roçar em processo em andamento, diga isso ao usuário e proponha recortar
  para a tese jurídica já pacificada.
- **A palavra do CTA** tem que fazer sentido com a oferta (mentoria → CONTROLE;
  isca de material → CICLO ou EDITAL).

## Quando algo falha

- `KIE_API_KEY não está definida` → o `.env` não existe ou está vazio; oriente a criar.
- `Kie createTask 401` → chave inválida ou com espaço; peça para conferir o `.env`.
- `model not found` (ou 400/422 citando o modelo) → o identificador mudou; diga ao
  usuário para conferir o modelo em docs.kie.ai e ajuste `KIE_MODEL` e, se preciso,
  `KIE_ASPECT_FIELD` no `.env`.
- Erro de rede em `api.kie.ai` em ambiente de nuvem → esse ambiente não alcança a Kie.
  Rode com `--sem-imagem` e explique que as imagens saem na máquina dele.
- Playwright reclamando de navegador → `npx playwright install chromium`.

Nunca invente número, nome de autoridade, cargo ou número de acórdão para preencher um
slide. Faltou dado, o slide sai sem ele.
