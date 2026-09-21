/* Busca de imagem em bancos públicos.

   Para conteúdo sobre órgão público (sede da CGU, brasão, sessão do TCU) a foto
   quase sempre já existe com licença livre. O que não pode faltar é a licença
   viajando junto: quem publica precisa saber se deve creditar.

   Fontes:
   - Wikimedia Commons — API estável, sem chave, e onde estão as fotos de prédio
     público, brasão e logotipo de órgão brasileiro. Traz a licença no extmetadata.
   - Openverse — agregador de conteúdo Creative Commons; anônimo é limitado por IP.

   Nenhuma das duas precisa de chave. Ambas vivem fora do artifact publicado:
   quem chama é o servidor local. */

const CABECALHO = {
  // a política do Wikimedia pede identificação de quem chama
  "user-agent": "CarrosselNoControle/1.0 (gerador de carrossel; contato pelo GitHub ellysson1/carrossel)",
  accept: "application/json"
};

function texto(valor) {
  return String(valor == null ? "" : valor)
    .replace(/<[^>]*>/g, " ")          // o Commons devolve HTML em Artist/Credit
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Licenças que dispensam crédito. O resto exige, e a interface avisa. */
function exigeCredito(licenca) {
  return !/^(cc0|public domain|pd|domínio público|dominio publico)/i.test(String(licenca || "").trim());
}

function creditoDe({ autor, licenca, fonte }) {
  const partes = [autor && `Foto: ${autor}`, fonte, licenca].filter(Boolean);
  return partes.join(" · ");
}

// ── Wikimedia Commons ────────────────────────────────────────────────────────

async function commons(termo, limite, sinal) {
  const url = "https://commons.wikimedia.org/w/api.php?" + new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    generator: "search",
    gsrsearch: `${termo} filetype:bitmap`,
    gsrnamespace: "6",
    gsrlimit: String(limite),
    prop: "imageinfo",
    iiprop: "url|size|extmetadata",
    iiurlwidth: "420"
  });

  const r = await fetch(url, { headers: CABECALHO, signal: sinal });
  if (!r.ok) throw new Error(`Wikimedia Commons respondeu ${r.status}`);
  const j = await r.json();
  const paginas = j?.query?.pages || [];

  return (Array.isArray(paginas) ? paginas : Object.values(paginas))
    .map((p) => {
      const i = (p.imageinfo || [])[0];
      if (!i || !i.url) return null;
      const m = i.extmetadata || {};
      const licenca = texto(m.LicenseShortName?.value) || texto(m.UsageTerms?.value) || "licença não informada";
      const autor = texto(m.Artist?.value) || texto(m.Credit?.value);
      return {
        fonte: "Wikimedia Commons",
        titulo: String(p.title || "").replace(/^File:/, "").replace(/\.[a-z0-9]+$/i, ""),
        url: i.url,
        thumb: i.thumburl || i.url,
        largura: i.width,
        altura: i.height,
        licenca,
        autor,
        pagina: i.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title || "")}`,
        exigeCredito: exigeCredito(licenca)
      };
    })
    .filter(Boolean);
}

// ── Openverse ────────────────────────────────────────────────────────────────

async function openverse(termo, limite, sinal) {
  const url = "https://api.openverse.org/v1/images/?" + new URLSearchParams({
    q: termo,
    page_size: String(limite),
    license_type: "all"
  });

  const r = await fetch(url, { headers: CABECALHO, signal: sinal });
  if (!r.ok) throw new Error(`Openverse respondeu ${r.status}${r.status === 429 ? " (limite de uso anônimo; tente daqui a pouco)" : ""}`);
  const j = await r.json();

  return (j.results || []).map((x) => {
    const licenca = [x.license, x.license_version].filter(Boolean).join(" ").toUpperCase();
    return {
      fonte: x.source || "Openverse",
      titulo: x.title || "sem título",
      url: x.url,
      thumb: x.thumbnail || x.url,
      largura: x.width,
      altura: x.height,
      licenca: licenca || "licença não informada",
      autor: x.creator || "",
      pagina: x.foreign_landing_url || "",
      exigeCredito: exigeCredito(licenca)
    };
  }).filter((x) => x.url);
}

const FONTES = { commons, openverse };

/**
 * Procura em uma fonte ou em todas. Uma fonte que falhar não derruba a busca:
 * volta em `avisos` e o resto aparece.
 */
export async function buscar(termo, { fonte = "todas", limite = 24, sinal } = {}) {
  const alvo = String(termo || "").trim();
  if (!alvo) throw new Error("diga o que procurar");

  const nomes = fonte === "todas" ? Object.keys(FONTES) : [fonte];
  const desconhecida = nomes.find((n) => !FONTES[n]);
  if (desconhecida) throw new Error(`fonte desconhecida: ${desconhecida}`);

  const avisos = [];
  const listas = await Promise.all(nomes.map(async (n) => {
    try {
      return await FONTES[n](alvo, Math.ceil(limite / nomes.length), sinal);
    } catch (e) {
      avisos.push(`${n}: ${e.message}`);
      return [];
    }
  }));

  // intercala as fontes para nenhuma dominar a primeira linha de resultados
  const resultados = [];
  for (let i = 0; resultados.length < limite; i++) {
    const antes = resultados.length;
    for (const l of listas) if (l[i]) resultados.push(l[i]);
    if (resultados.length === antes) break;
  }
  return { resultados, avisos };
}

/** Baixa a imagem escolhida. Devolve {buffer, tipo}. */
export async function baixar(url, { sinal, limiteBytes = 25 * 1024 * 1024 } = {}) {
  if (!/^https:\/\//i.test(String(url))) throw new Error("só baixo de endereço https");
  const r = await fetch(url, { headers: CABECALHO, signal: sinal, redirect: "follow" });
  if (!r.ok) throw new Error(`o download respondeu ${r.status}`);

  const tipo = (r.headers.get("content-type") || "").split(";")[0].trim();
  if (!/^image\/(png|jpeg|webp|gif)$/.test(tipo)) throw new Error(`isso não é imagem (${tipo || "tipo desconhecido"})`);

  const tamanho = Number(r.headers.get("content-length") || 0);
  if (tamanho > limiteBytes) throw new Error(`imagem grande demais (${Math.round(tamanho / 1e6)} MB)`);

  const buffer = Buffer.from(await r.arrayBuffer());
  if (buffer.length > limiteBytes) throw new Error("imagem grande demais");
  return { buffer, tipo, extensao: { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" }[tipo] };
}

export { creditoDe, exigeCredito };
