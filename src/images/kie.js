/* Adapter Kie.ai — API unificada de jobs.
   POST {base}/jobs/createTask  {model, input:{...}}     → data.taskId
   GET  {base}/jobs/recordInfo?taskId=…                  → data.state / data.resultJson
   Estados: waiting | queuing | generating | success | fail
   O identificador do modelo e o nome do campo de proporção mudam por modelo;
   ambos vêm do .env (KIE_MODEL, KIE_ASPECT_FIELD) para não travar em um só. */

const ESPERA_MS = 3000;
const LIMITE_MS = 6 * 60 * 1000;

function base() {
  return (process.env.KIE_BASE_URL || "https://api.kie.ai/api/v1").replace(/\/$/, "");
}

function cabecalhos() {
  const chave = process.env.KIE_API_KEY;
  if (!chave) throw new Error("KIE_API_KEY não definida no .env");
  return { authorization: `Bearer ${chave}`, "content-type": "application/json" };
}

function urlsDoResultado(data) {
  if (!data) return [];
  let r = data.resultJson ?? data.result ?? data.response ?? data;
  if (typeof r === "string") { try { r = JSON.parse(r); } catch { return []; } }
  const cand = r.resultUrls || r.resultUrl || r.urls || r.imageUrls || r.images || [];
  return (Array.isArray(cand) ? cand : [cand]).filter((u) => typeof u === "string" && /^https?:/.test(u));
}

export async function criarTarefa({ prompt, aspect, extra = {}, sinal }) {
  const campoAspecto = process.env.KIE_ASPECT_FIELD || "aspect_ratio";
  const input = Object.assign({ prompt, output_format: "png" }, aspect ? { [campoAspecto]: aspect } : {}, extra);
  const corpo = { model: process.env.KIE_MODEL || "google/nano-banana", input };
  const r = await fetch(`${base()}/jobs/createTask`, {
    method: "POST", headers: cabecalhos(), body: JSON.stringify(corpo), signal: sinal
  });
  const txt = await r.text();
  let j; try { j = JSON.parse(txt); } catch { throw new Error(`Kie createTask devolveu resposta não-JSON (${r.status}): ${txt.slice(0, 300)}`); }
  if (!r.ok || (j.code && j.code !== 200)) {
    throw new Error(`Kie createTask ${r.status}/${j.code}: ${j.msg || j.message || txt.slice(0, 300)}`);
  }
  const taskId = j.data?.taskId || j.data?.task_id || j.taskId;
  if (!taskId) throw new Error(`Kie createTask sem taskId: ${txt.slice(0, 300)}`);
  return taskId;
}

export async function esperarTarefa(taskId, { sinal, aoProgredir } = {}) {
  const inicio = Date.now();
  let ultimoEstado = "";
  while (Date.now() - inicio < LIMITE_MS) {
    const r = await fetch(`${base()}/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
      headers: cabecalhos(), signal: sinal
    });
    const txt = await r.text();
    let j; try { j = JSON.parse(txt); } catch { throw new Error(`Kie recordInfo não-JSON (${r.status}): ${txt.slice(0, 300)}`); }
    const d = j.data || {};
    const estado = String(d.state || d.status || "").toLowerCase();
    if (estado && estado !== ultimoEstado) { ultimoEstado = estado; aoProgredir?.(estado); }
    if (estado === "success" || estado === "succeeded" || estado === "completed") {
      const urls = urlsDoResultado(d);
      if (!urls.length) throw new Error(`Kie concluiu sem URL de imagem: ${txt.slice(0, 400)}`);
      return urls;
    }
    if (estado === "fail" || estado === "failed" || estado === "error") {
      throw new Error(`Kie falhou (${d.failCode || ""}): ${d.failMsg || d.errorMessage || txt.slice(0, 300)}`);
    }
    await new Promise((s) => setTimeout(s, ESPERA_MS));
  }
  throw new Error(`Kie: tempo esgotado esperando a tarefa ${taskId}`);
}

/** Gera uma imagem e devolve o Buffer do PNG. */
export async function gerar({ prompt, aspect, extra, sinal, aoProgredir }) {
  const taskId = await criarTarefa({ prompt, aspect, extra, sinal });
  aoProgredir?.(`tarefa ${taskId}`);
  const urls = await esperarTarefa(taskId, { sinal, aoProgredir });
  const r = await fetch(urls[0], { signal: sinal });
  if (!r.ok) throw new Error(`Kie: download da imagem falhou (${r.status})`);
  return Buffer.from(await r.arrayBuffer());
}

export const nome = "kie";
