/** Confirma descarte de cache. Nunca altera pedidos, modelos ou impressão. */
import { banco } from './banco.ts';
import { Recusa } from './sessao.ts';

export async function estadoCache(entrada:any, operador:any, consultar=banco,
  empresa=Deno.env.get('PILOTO_LOCAL_EMPRESA'), empresaId=Deno.env.get('PILOTO_LOCAL_EMPRESA_ID')) {
  if (!empresa || entrada?.empresa!==empresa || operador?.perm_producao_view!==true
      || operador?.perm_imprimir!==true || Object.keys(entrada).sort().join(',')!=='empresa,pedidos'
      || !Array.isArray(entrada.pedidos) || entrada.pedidos.length<1 || entrada.pedidos.length>32
      || entrada.pedidos.some((p:any)=>typeof p!=='string' || !/^[1-9][0-9]{0,9}$/.test(p) || Number(p)>2147483647)
      || new Set(entrada.pedidos).size!==entrada.pedidos.length
      || ((operador.empresa_id??operador.id_empresa)!=null && String(operador.empresa_id??operador.id_empresa)!==empresaId))
    throw new Recusa(403,'consulta de cache nao autorizada');
  const ler=async(path:string)=> {
    let rows;
    try { rows=await consultar('GET',path); } catch { throw new Recusa(503,'estado de cache indisponivel'); }
    if (!Array.isArray(rows)) throw new Recusa(503,'estado de cache incompleto');
    for (const r of rows) {
      const id=r.empresa_id??r.id_empresa;
      if (id!=null && String(id)!==empresaId) throw new Recusa(403,'empresa divergente');
    }
    return rows;
  };
  const pedidos=[];
  for (const pedido of entrada.pedidos) {
    const proposta=await ler(`propostas?id_int=eq.${pedido}&select=*&limit=2`);
    if (proposta.length!==1 || String(proposta[0].id_int)!==pedido) {
      pedidos.push({pedido,impresso:false,modelos:[]}); continue;
    }
    // Paginação explícita: nenhuma resposta truncada pode autorizar descarte.
    const modelos:any[]=[];
    let cursor=0;
    for (;;) {
      const pagina=await ler(`pedidos_modelos?id_int=eq.${pedido}&id=gt.${cursor}&select=id,id_int,status_impressao&order=id.asc&limit=500`);
      if (pagina.length>500 || modelos.length+pagina.length>10000) throw new Recusa(413,'modelos excedem limite');
      for (const m of pagina) {
        if (String(m.id_int)!==pedido || !Number.isSafeInteger(Number(m.id)) || Number(m.id)<=cursor)
          throw new Recusa(409,'modelo divergente');
        cursor=Number(m.id); modelos.push(m);
      }
      if (pagina.length<500) break;
    }
    pedidos.push({pedido,impresso:modelos.length>0 && modelos.every(m=>String(m.status_impressao??'').trim().toUpperCase()==='IMPRESSO'),
      modelos:modelos.map(m=>String(m.id))});
  }
  return {empresa,pedidos,conferido_em:new Date().toISOString()};
}
