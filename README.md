# Carrossel No Controle

Pipeline de produção dos carrosséis e roteiros do **@profellyssonrocha**.
Um tema entra; saem os PNG 1080×1350 na ordem, a legenda e as hashtags.

## Clique e use

**Windows — uma vez só.** Abra o PowerShell na pasta do projeto e cole:

```powershell
powershell -ExecutionPolicy Bypass -File .\instalar-atalho.ps1
```

Ele cria o ícone **Carrossel No Controle** na área de trabalho e pergunta se você quer
que o app suba junto com o Windows. Daí em diante é dois cliques no ícone: ele instala o
que faltar, cria o `.env` se não existir, sobe o app e abre o navegador. Para parar,
feche a janela.

O atalho aponta para o `powershell.exe` com o `Abrir-Carrossel.ps1` — não depende de
associação de arquivo `.cmd` nem de política de execução, que é onde o duplo clique
costuma falhar no Windows.

**O app se atualiza sozinho.** Toda vez que você abre, ele busca a versão nova antes de
subir, e instala dependências novas se alguma tiver mudado. Você não precisa dar `git
pull` nem usar o GitHub Desktop. Se a internet estiver fora, ou se você tiver mexido em
algum arquivo do projeto, ele avisa e abre com a versão que já está no disco — atualizar
nunca impede de usar.

**Mac e Linux.** `./abrir-carrossel.sh` faz o mesmo.

**Pelo terminal**, se preferir: `npm start` (ou `npm start -- --rede`).

**Quando algo não abrir**, rode o diagnóstico e mande o arquivo que ele gera:

```powershell
powershell -ExecutionPolicy Bypass -File .\diagnostico.ps1
```

Na tela: escreve o tema, clica em **Escrever carrossel**, e a máquina faz o resto —
texto, imagens, PNG 1080×1350 — mostrando cada etapa. Revisa, corrige a frase que
quiser, e **Renderizar e abrir a pasta** deixa os arquivos prontos no Explorer.

### No celular

**Em casa, no mesmo Wi-Fi.** Clique em **Abrir no celular** na barra de cima: aparece um
QR code e o endereço (`http://192.168.x.x:4173`). Aponte a câmera e pronto — mesma tela,
mesmas imagens, mesmo botão de baixar. No Android/iPhone, "Adicionar à tela de início"
deixa um ícone que abre direto.

Para o ícone funcionar sempre que o PC estiver ligado, responda **s** à pergunta do
`instalar-atalho.ps1`: o app passa a subir minimizado no login.

**Fora de casa.** Aí o celular não alcança o seu PC, e a página publicada no claude.ai
não alcança a Kie. O caminho é a fila: escreva o carrossel no artifact e toque em
**Pedir imagens no PC**. Isso enfileira o pedido no banco do próprio artifact. Quando
voltar ao computador, abra o Claude Code na pasta do projeto e diga *"processa os pedidos
do celular"*: ele gera as imagens, renderiza os PNG e devolve o carrossel ao histórico do
app, pronto para baixar pelo celular.

### Kie ou Gemini, na hora

Tendo as duas chaves no `.env`, o app mostra um seletor de **gerador de imagem** e você
escolhe por carrossel: Kie.ai, Google Gemini ou nenhum (fundo sólido). Só uma chave, ele
usa aquela sem perguntar.

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

> **Google Flow não entra aqui**: é aplicativo interativo, sem API pública — não existe
> chave para automatizar. Do lado Google, quem tem API é a **Gemini** (chave do AI
> Studio, gratuita para começar), e ela já está implementada: preencha `GEMINI_API_KEY`
> e escolha Gemini no seletor do app.
>
> Se você quiser mesmo usar o Flow numa peça específica: o app mostra o prompt de cada
> imagem com um botão de copiar. Gere lá, baixe o arquivo e suba pelo campo de imagem do
> slide — no app local ele é gravado na pasta do carrossel e entra no PNG final.

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

## Imagem de fundo e slide são coisas diferentes

No editor de cada slide, **Imagem de fundo deste slide** traz o prompt em um campo
editável: troque o assunto, ajuste a luz, mande gerar de novo. Três ações ali:

- **Gerar esta imagem** — no app local, chama a Kie (ou o Gemini) na hora, só para este
  slide, e já refaz o PNG. No artifact publicado o botão não aparece: a página não
  alcança a Kie.
- **Copiar prompt** — para gerar onde você preferir, inclusive no Google Flow.
- **Enviar arquivo** — sobe uma imagem sua; no app local ela é gravada na pasta do
  carrossel e entra no PNG final.

O estilo da casa e a lista de negativos da marca entram sozinhos no prompt: no campo
vai só o assunto.

As duas etapas ficam em cartões diferentes, de propósito:

| Cartão | O que faz |
|---|---|
| **2 · Revisar** | texto, voz da marca e **as imagens de fundo** |
| **3 · Publicar** | **os slides**: gerar os PNG, baixar, copiar a legenda |

## A sua marca na capa

Deixe o arquivo do logo na raiz do projeto com o nome **`Logo.png`** (ou `logo.png`,
`.jpg`, `.svg`). Ao subir, o app move para `brand/logo.png` sozinho e passa a desenhar
a marca no **selo da capa**, ao lado do handle — no lugar do círculo com "NC".

O logo entra por `contain`, então marca redonda e marca deitada aparecem inteiras, sem
corte. Arquivo acima de 2 MB é ignorado, com aviso: salve uma versão menor.

O rodapé continua **sem logo**, como manda o design system: quem ancora a peça é o
handle `@profellyssonrocha`.

Para tirar, apague `brand/logo.png` — volta o selo de texto, configurável em
`brand.selo.texto`.

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
