import { banco } from "./banco.ts";
import { hashCodigo } from "./hash.ts";
import { conteudoDoIngresso, planejar, PlanoModelo, POOL_BYTES, POOL_OBJETO, POOL_SHA256 } from "./preparacao_codigos.ts";

let baseEmMemoria: Promise<Uint8Array> | null = null;
async function basePrivada(): Promise<Uint8Array> {
  if (!baseEmMemoria) baseEmMemoria = (async () => {
    const chave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/storage/v1/object/authenticated/${POOL_OBJETO}`, {
      headers: { Authorization: `Bearer ${chave}`, apikey: chave || "" },
    });
    if (!r.ok) throw new Error("Base privada de ingressos indisponível. Tente novamente.");
    const bytes = new Uint8Array(await r.arrayBuffer());
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map(x => x.toString(16).padStart(2,"0")).join("");
    if (bytes.length !== POOL_BYTES || hash !== POOL_SHA256) throw new Error("Integridade da base privada não confirmada.");
    return bytes;
  })().catch(e => { baseEmMemoria = null; throw e; });
  return baseEmMemoria;
}

// O chamador já validou o QR ou o token do aparelho. O cliente nunca escolhe
// pedido/modelo/faixa, nunca fornece hashes e nunca recebe o pool ou o plano.
export async function prepararEvento(evento: string): Promise<{ concluida: boolean; prontos: number; total: number }> {
  const pedidos = await banco("GET", `producao_acesso_pedidos?evento_id=eq.${evento}&select=pedido_id_int&order=pedido_id_int.asc`);
  if (!pedidos?.length) throw new Error("Evento sem pedido vinculado.");
  let prontos = 0, total = 0, trabalhou = false, concluida = true;
  for (const p of pedidos) {
    const argumentos = { p_evento: evento, p_pedido: p.pedido_id_int };
    const rpc = (dados: any = {}) => banco("POST", "rpc/producao_acesso_preparar_lote", { ...argumentos, ...dados });
    let estado = await rpc();
    if (!estado.concluida) {
      concluida = false;
      const plano: PlanoModelo[] = estado.plano || planejar(estado.fonte);
      const esperado = plano.reduce((s,m) => s+m.quantidade,0);
      if (!trabalhou) {
        trabalhou = true;
        if (!estado.plano) estado = await rpc({ p_fonte_hash: estado.fonte_hash, p_plano: plano });
        const pool = plano.some(m=>m.tipo === "QR_IDEAL") ? await basePrivada() : null;
        const itens = [];
        let base = 0;
        for (const m of plano) {
          for (let i=Math.max(0,estado.prontos-base); i<m.quantidade && itens.length<100; i++) {
            itens.push({ modelo:m.modelo,numero:i+1,hash:await hashCodigo(conteudoDoIngresso(pool,p.pedido_id_int,m,i),estado.sal) });
          }
          base += m.quantidade;
          if (itens.length===100) break;
        }
        if (itens.length) estado = await rpc({ p_fonte_hash:estado.fonte_hash,p_offset:estado.prontos,p_itens:itens });
      }
      prontos += estado.prontos;
      total += esperado;
    } else {
      prontos += estado.prontos; total += estado.total;
    }
  }
  // Na última rodada, confirmar a publicação em nova leitura. Nunca informar
  // que terminou por contagem parcial ou pelo número de linhas de uma página.
  return { concluida, prontos, total };
}
