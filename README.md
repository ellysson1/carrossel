# Carrossel No Controle

Pipeline de produção dos carrosséis e roteiros do **@profellyssonrocha**.
Um tema entra; saem os PNG 1080×1350 na ordem, a legenda e as hashtags.

## O caminho principal: o app local

```bash
npm start
```

Abre `http://localhost:4173` no seu navegador: você escreve o tema, clica em **Escrever
carrossel** e a máquina faz o resto — texto, imagens pela Kie, PNG 1080×1350 — mostrando
cada etapa. Revisa na tela, corrige a frase que quiser, e **Renderizar e abrir a pasta**
deixa os arquivos prontos no Explorer.

Aqui não existe sandbox: a chave fica no `.env`, a Kie responde e baixar arquivo é um
link. É a única superfície onde o pipeline roda inteiro, do tema ao PNG, num clique.

`npm start -- --rede` também publica na sua rede local, para abrir pelo celular enquanto
o computador estiver ligado.

---

Tudo isto é a mesma máquina por baixo, em quatro superfícies:

| Superfície | Onde roda | Pipeline completo? |
|---|---|---|
| **App local** (`npm start`) | seu navegador, servido pela sua máquina | sim — texto, imagens e PNG |
| **CLI** (`bin/carrossel.js`) | terminal | sim, e é o caminho do lote |
| **Skill** (`.claude/skills/carrossel/`) | Cowork · Claude Code | sim, se o ambiente alcançar a Kie |
| **Artifact** (`artifact/`) | claude.ai, celular | texto, edição e export — imagem entra por upload |

O app local e o artifact são **o mesmo arquivo**: `artifact/index.html`. A página
descobre sozinha onde está — se o servidor local responder, usa a máquina; se estiver
publicada no claude.ai, usa as capabilities.

O que é regra da marca — paleta, tipografia, estrutura dos slides, voz, proibições —
mora em cinco arquivos que todas as camadas leem: `brand/brand.json`,
`src/layout/slides.css`, `src/layout/engine.cjs`, `src/copy/prompt.cjs` e `src/copy/lint.cjs`.
Mudou a regra num lugar, mudou em todas.

---

## Começando

```bash
npm install
npx playwright install chromium     # só na primeira vez
cp .env.example .env                # e preencha a chave de imagem
node bin/carrossel.js doctor        # confere chave, modelo e navegador
```

O texto sai pela CLI do Claude Code (`COPY_PROVIDER=claude-cli`), que usa o login
que você já tem — sem chave nova. Se preferir a API, use `COPY_PROVIDER=anthropic`
e `ANTHROPIC_API_KEY`.

## Um carrossel inteiro

```bash
node bin/carrossel.js novo \
  --tema "Por que a sua taxa de acerto cai na semana da prova" \
  --tipo metodo --slides 9 --cta CONTROLE
```

Sai em `out/<data>-<tema>/`:

```
png/01.png … 09.png   slides na ordem de publicação
legenda.txt           legenda + hashtags
carrossel.json        o texto, para editar e renderizar de novo
preview.html          prévia no navegador, offline
img/                  as imagens geradas (cache por prompt)
```

### Com material de apoio

Acórdão, edital, números do aluno — tudo que for número na peça deve vir daqui:

```bash
node bin/carrossel.js novo --tipo tcu --cta TCU \
  --tema "O que o acórdão sobre dispensa de licitação muda na sua prova" \
  --contexto ~/notas/acordao-1234.md
```

### Lote

`temas.txt`, uma linha por carrossel, com `linha | tema`:

```
metodo | Horas líquidas não aprovam. Questões sim.
tcu    | O que a fiscalização de obras paradas ensina sobre controle
edital | Os pesos do edital dizem por onde começar
```

```bash
node bin/carrossel.js lote temas.txt
```

## Comandos

| Comando | O que faz |
|---|---|
| `app` | sobe o app local (`--porta`, `--rede`) |
| `novo` | pipeline completo: texto → imagens → PNG |
| `texto` | só o `carrossel.json` |
| `imagens <pasta>` | gera as imagens que faltam (não refaz o que está em cache) |
| `render <pasta>` | regera os PNG depois de você editar o JSON |
| `slide <pasta> <n> --instrucao "..."` | reescreve um slide só |
| `lint <pasta>` | passa o texto pelas regras de voz da marca |
| `roteiro --tema "..."` | roteiro de Reels cronometrado |
| `lote <arquivo>` | vários de uma vez |
| `doctor` | testa chave, modelo, navegador e gera uma imagem de prova |

Opções: `--tipo`, `--slides`, `--cta`, `--contexto`, `--saida`, `--modelo`,
`--provedor`, `--sem-imagem`, `--sem-png`, `--forcar`.

## Imagens

`IMAGE_PROVIDER=kie` (padrão) ou `gemini`, ou `none` para pular.

- **Kie.ai** — API unificada de jobs: `POST /jobs/createTask` com `{model, input}`,
  e `GET /jobs/recordInfo?taskId=…` até `state=success`. Verificado contra a API viva
  com os valores padrão do `.env.example` (`google/nano-banana` + `aspect_ratio`):
  cerca de 60 s e 1,2 MB por imagem. O identificador do modelo e o nome do campo de
  proporção mudam de modelo para modelo — ao trocar de modelo, confira os dois na
  página dele em docs.kie.ai e ajuste `KIE_MODEL` e `KIE_ASPECT_FIELD`.
- **Gemini (AI Studio)** — `generateContent` no `gemini-2.5-flash-image`; a imagem
  volta em base64 na resposta. Se a versão do modelo recusar `imageConfig`, o adapter
  repete a chamada sem ele e põe a proporção no texto do prompt.

O prompt de cada imagem é escrito pelo Claude junto com o slide, em inglês, e recebe
o estilo da casa e a lista de negativos de `brand.imagem` antes de sair. Nada de texto,
número ou gráfico dentro da imagem: dado é slide, não foto.

Se uma imagem falhar, o slide renderiza sem ela — fundo sólido, que é identidade da
marca, não remendo.

> **Google Flow não entra aqui**: é aplicativo interativo, sem API pública. O caminho
> automatizável do lado Google é a Gemini API.

## Skill — usar sem digitar comando

`.claude/skills/carrossel/SKILL.md` ensina o Claude a operar tudo isto por conta
própria. No Claude Code, basta abrir esta pasta. No Cowork, envie a pasta da skill nas
suas skills do claude.ai, como as outras que você já usa.

A partir daí é conversa:

> gera um carrossel sobre por que a taxa de acerto cai na semana da prova

> carrossel do TCU sobre o acórdão que eu te mandei, e manda pro app

> os temas da semana: [três linhas] — roda tudo

## Levar um carrossel da CLI para o app

```bash
node scripts/preparar-app.js out/<pasta> --listar
# suba as imagens listadas para o acervo do artifact, guarde as urls /_blob/…
node scripts/preparar-app.js out/<pasta> --urls '{"img/slide-01-ab.png":"/_blob/…"}'
# grave out/<pasta>/app-doc.json na coleção "carrosseis" da base do artifact
```

A Skill faz esses três passos sozinha. O histórico da página lê essa coleção.

## Artifact (celular)

```bash
npm run build:artifact    # monta artifact/index.html com brand + motor + prompt + lint
```

Publicado no claude.ai, a página usa as *runtime capabilities*: `sample` escreve o
carrossel, `db` guarda o histórico, `assets` guarda as imagens, `downloads` entrega o
ZIP com os PNG, a legenda e o JSON.

A página **não chama a Kie**: o sandbox do artifact bloqueia rede para fora, e uma
chave dentro de página publicada vaza para quem abrir o link. O fluxo no celular é:
a página escreve o prompt da imagem → você gera na Kie (ou onde preferir) → sobe o
arquivo no slide. Em lote, quem gera é a CLI.

Sem a capability de geração, a página continua servindo como diagramador puro: cole o
`carrossel.json` e exporte.

## Estrutura dos slides

`capa · faixa · texto · imagem · lista · passos · metrica · barras · tese · cta`

Ritmo de fundos automático (nunca dois iguais em sequência), `**palavra**` põe o
retângulo amarelo atrás dela, `*palavra*` deixa em negrito, e o auto-ajuste
tipográfico encolhe o corpo do slide até o texto caber — nenhum PNG sai cortado.

## Voz da marca

`src/copy/lint.cjs` reprova emoji, pergunta retórica genérica, "não é X, é Y",
adjetivo de venda, gerúndio de preenchimento, conclusão genérica, caixa alta em
título, terceira pessoa e CTA sem a palavra-chave. Na CLI, o que o lint reprova
volta para o Claude corrigir antes de o arquivo ser salvo.
