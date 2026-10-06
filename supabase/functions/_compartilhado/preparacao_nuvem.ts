import { banco } from "./banco.ts";
import { hashCodigo } from "./hash.ts";
import { conteudoDoIngresso, planejar, PlanoModelo, POOL_BYTES, POOL_OBJETO, POOL_SHA256, POOL_V2_OBJETO, POOL_V2_SHA256 } from "./preparacao_codigos.ts";

const basesEmMemoria = new Map<number, Promise<Uint8Array>>();
export async function basePrivada(versao = 1): Promise<Uint8Array> {
  if (![1,2].includes(versao)) throw new Error("Base privada incompatível.");
  if (!basesEmMemoria.has(versao)) basesEmMemoria.set(versao, (async () => {
    const chave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const objeto = versao === 2 ? POOL_V2_OBJETO : POOL_OBJETO;
    const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/storage/v1/object/authenticated/${objeto}`, {
      headers: { Authorization: `Bearer ${chave}`, apikey: chave || "" },
    });
    if (!r.ok) throw new Error("Base privada de ingressos indisponível. Tente novamente.");
    const bytes = new Uint8Array(await r.arrayBuffer());
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map(x => x.toString(16).padStart(2,"0")).join("");
    if (bytes.length !== POOL_BYTES || hash !== (versao === 2 ? POOL_V2_SHA256 : POOL_SHA256)) throw new Error("Integridade da base privada não confirmada.");
    return bytes;
  })().catch(e => { basesEmMemoria.delete(versao); throw e; }));
  return basesEmMemoria.get(versao)!;
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
      if (!estado.plano && plano.some(m => m.tipo === "QR_IDEAL")) {
        const contratos = await banco("POST", "rpc/producao_acesso_qr_contratos_obter", { p_pedido: p.pedido_id_int });
        for (const m of plano.filter(m => m.tipo === "QR_IDEAL")) {
          const c = contratos.find((c: any) => c.modelo === m.modelo);
          if (!c || c.inicio !== m.inicio || c.passo !== m.passo || c.posicao !== m.posicao || c.quantidade !== m.quantidade) {
            throw new Error("Plano QR diverge do contrato de emissão. Confira na gráfica.");
          }
          m.qr_contrato = c;
        }
      }
      const esperado = plano.reduce((s,m) => s+m.quantidade,0);
      if (!trabalhou) {
        trabalhou = true;
        if (!estado.plano) estado = await rpc({ p_fonte_hash: estado.fonte_hash, p_plano: plano });
        const pool = plano.some(m=>m.tipo === "QR_IDEAL" && m.qr_contrato?.versao !== 2) ? await basePrivada() : null;
        const poolV2 = plano.some(m=>m.tipo === "QR_IDEAL" && m.qr_contrato?.versao === 2) ? await basePrivada(2) : null;
        const itens = [];
        let base = 0;
        for (const m of plano) {
          for (let i=Math.max(0,estado.prontos-base); i<m.quantidade && itens.length<100; i++) {
            itens.push({ modelo:m.modelo,numero:i+1,hash:await hashCodigo(conteudoDoIngresso(m.qr_contrato?.versao === 2 ? poolV2 : pool,p.pedido_id_int,m,i),estado.sal) });
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
