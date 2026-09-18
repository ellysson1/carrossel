/* Adapter Google Gemini (AI Studio) — geração de imagem síncrona.
   POST {base}/models/{modelo}:generateContent
   A imagem volta em candidates[0].content.parts[].inlineData.data (base64).
   Se a versão do modelo não aceitar imageConfig, refaz a chamada sem ele. */

const BASE = "https://generativelanguage.googleapis.com/v1beta";

function chave() {
  const k = process.env.GEMINI_API_KEY;
  if (!k) throw new Error("GEMINI_API_KEY não definida no .env");
  return k;
}

function primeiraImagem(j) {
  for (const c of j.candidates || []) {
    for (const p of c.content?.parts || []) {
      const d = p.inlineData || p.inline_data;
      if (d?.data) return Buffer.from(d.data, "base64");
    }
  }
  return null;
}

async function chamar(corpo, sinal) {
  const modelo = process.env.GEMINI_MODEL || "gemini-2.5-flash-image";
  const r = await fetch(`${BASE}/models/${modelo}:generateContent`, {
    method: "POST",
    signal: sinal,
    headers: { "content-type": "application/json", "x-goog-api-key": chave() },
    body: JSON.stringify(corpo)
  });
  const txt = await r.text();
  let j; try { j = JSON.parse(txt); } catch { throw new Error(`Gemini devolveu resposta não-JSON (${r.status}): ${txt.slice(0, 300)}`); }
  return { ok: r.ok, status: r.status, j, txt };
}

/** Gera uma imagem e devolve o Buffer do PNG. */
export async function gerar({ prompt, aspect, sinal, aoProgredir }) {
  const conteudo = { contents: [{ role: "user", parts: [{ text: prompt }] }] };
  aoProgredir?.("gerando");

  let res = await chamar(
    Object.assign({}, conteudo, aspect ? { generationConfig: { imageConfig: { aspectRatio: aspect } } } : {}),
    sinal
  );
  if (!res.ok && res.status === 400 && aspect) {
    aoProgredir?.("sem imageConfig");
    res = await chamar(Object.assign({}, conteudo, { contents: [{ role: "user", parts: [{ text: `${prompt}. Framing: ${aspect} aspect ratio.` }] }] }), sinal);
  }
  if (!res.ok) {
    const msg = res.j?.error?.message || res.txt.slice(0, 300);
    throw new Error(`Gemini ${res.status}: ${msg}`);
  }
  const buf = primeiraImagem(res.j);
  if (!buf) {
    const motivo = res.j.candidates?.[0]?.finishReason || res.j.promptFeedback?.blockReason || "sem inlineData";
    throw new Error(`Gemini não devolveu imagem (${motivo})`);
  }
  return buf;
}

export const nome = "gemini";
