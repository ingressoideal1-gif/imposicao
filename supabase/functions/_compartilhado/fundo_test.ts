import { operarFundo } from "./fundo.ts";
import { Recusa } from "./sessao.ts";
const admin = { perm_admin_edit: true };
const entrada = { arquivo: "fundo-pwa/1788796800000.jpg", versao: "1788796800000", veu: 0.45, enquadramento: "centro" };
function igual(a: unknown, b: unknown) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error("resultado diferente"); }
const semBanco = () => { throw new Error("chamada indevida ao banco"); };
async function recusa(status: number, f: () => Promise<unknown>) {
  try { await f(); } catch (e) { if (e instanceof Recusa) { igual(e.status, status); return; } throw e; }
  throw new Error("deveria recusar");
}
Deno.test("fundo: anon, leitor e papel admin sem permissao explicita nao escrevem", async () => {
  for (const p of [null, {}, { role: "admin" }, { role: "admin", perm_admin_edit: false }]) {
    for (const a of ["publicar", "remover"]) await recusa(403, () => operarFundo(a, {}, p, "teste", semBanco));
  }
});
Deno.test("fundo: publicacao usa parametros permitidos e autor do servidor", async () => {
  const chamadas: unknown[] = [];
  igual(await operarFundo("publicar", entrada, admin, "admin-sintetico", async (...args) => { chamadas.push(args); return {}; }), { ok: true });
  igual(chamadas, [["POST", "rpc/publicar_fundo_do_pwa", { p_arquivo: entrada.arquivo, p_veu: .45,
    p_enquadramento: "centro", p_versao: entrada.versao, p_por: "admin-sintetico" }]]);
});
Deno.test("fundo: remove exclusivamente pela RPC prevista", async () => {
  igual(await operarFundo("remover", {}, admin, "teste", async (metodo, caminho, corpo) => {
    igual([metodo, caminho, corpo], ["POST", "rpc/remover_fundo_do_pwa", {}]); return null;
  }), { ok: true });
});
Deno.test("fundo: recusa autoria forjada, caminhos arbitrarios e limites invalidos", async () => {
  for (const patch of [{ p_por: "outro" }, { arquivo: "../outro.jpg" }, { arquivo: "https://exemplo.invalid/imagem.jpg" },
    { veu: -1 }, { veu: 1.01 }, { veu: "0.5" }, { versao: "errada" }, { enquadramento: ["topo"] }]) {
    await recusa(422, () => operarFundo("publicar", { ...entrada, ...patch }, admin, "teste", semBanco));
  }
  await recusa(422, () => operarFundo("remover", { id: 1 }, admin, "teste", semBanco));
  await recusa(422, () => operarFundo("remover", null, admin, "teste", semBanco));
});
Deno.test("fundo: falha remota nao revela detalhes nem informa sucesso", async () => {
  try { await operarFundo("remover", {}, admin, "teste", async () => { throw new Error("segredo-sintetico"); }); }
  catch (e) { if (!(e instanceof Recusa) || e.status !== 503 || e.message.includes("segredo")) throw e; return; }
  throw new Error("deveria falhar");
});
