import { banco } from './banco.ts';
import { Recusa } from './sessao.ts';
import { conferirPedidoPiloto } from './piloto_pedido.ts';

export async function catalogosOffline(entrada:any, operador:any, consultar=banco,
  empresa=Deno.env.get('PILOTO_LOCAL_EMPRESA'), empresaId=Deno.env.get('PILOTO_LOCAL_EMPRESA_ID')) {
  if (!empresa || entrada?.empresa !== empresa || Object.keys(entrada).join(',') !== 'empresa'
      || operador?.perm_producao_view !== true || operador?.perm_imprimir !== true
      || ((operador.empresa_id ?? operador.id_empresa) != null && String(operador.empresa_id ?? operador.id_empresa)!==empresaId)) throw new Recusa(403,'acesso recusado');
  const resultado:any={empresa};
  for (const nome of ['formatos','saidas','cores','modelos_imposicao']) {
    const linhas:any[]=[];
    const campos=nome==='cores'?'id,empresa_id,name,hex,pdf_url,pdf_filename,created_at,updated_at,formato_id,width_mm,height_mm,id_modelo_cor_num,name_verso,frente_verso,cor_referencia,margem_esquerda_mm,margem_direita_mm,margem_superior_mm,margem_inferior_mm':'*';
    for (let offset=0;offset<10000;offset+=500) {
      const pagina=await consultar('GET',`producao_${nome}?select=${campos}&order=id&limit=500&offset=${offset}`);
      if (!Array.isArray(pagina)) throw new Recusa(503,'catalogo incompleto');
      linhas.push(...pagina.filter((r:any)=> {
        const id=r.empresa_id??r.id_empresa;
        return id==null || String(id)===empresaId;
      }));
      if (pagina.length<500) { resultado[nome]=linhas;break; }
    }
    if (!resultado[nome]) throw new Recusa(413,'catalogo excede limite');
  }
  return resultado;
}

export async function confirmarOffline(entrada:any, operador:any, consultar=banco,
  conferir=conferirPedidoPiloto) {
  if (!entrada || Object.keys(entrada).sort().join(',')!=='empresa,id,modelos,operador,pedido,revisao'
      || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(entrada.id)
      || !Array.isArray(entrada.modelos) || !entrada.modelos.length || entrada.modelos.length>128
      || entrada.modelos.some((m:any)=>typeof m!=='string'|| !/^[1-9][0-9]{0,14}$/.test(m))
      || new Set(entrada.modelos).size!==entrada.modelos.length
      || typeof entrada.operador!=='string' || entrada.operador.length>200) throw new Recusa(422,'confirmacao invalida');
  // A consulta validada confere empresa, estacao e permissao antes de escrever.
  const r:any=await conferir({empresa:entrada.empresa,pedido:entrada.pedido,revisao:''},operador,
    consultar,undefined,undefined,undefined,true);
  const modelos=r.snapshot?.modelos?.filter((m:any)=>entrada.modelos.includes(String(m.id)));
  if (!modelos || modelos.length!==entrada.modelos.length) throw new Recusa(409,'modelo ausente');
  // Repetir a entrega depois de perder a resposta nao altera quantidades nem reimprime.
  if (modelos.every((m:any)=>String(m.status_impressao).toUpperCase()==='IMPRESSO'))
    return {id:entrada.id,estado:'sincronizado'};
  if (r.revisao!==entrada.revisao) return {id:entrada.id,estado:'conflito'};
  const elegiveis = new Set((r.itens || []).map((m:any)=>String(m.modelo)));
  if (modelos.some((m:any)=>String(m.status_impressao).toUpperCase()!=='IMPRESSO' && !elegiveis.has(String(m.id))))
    return {id:entrada.id,estado:'conflito'};
  // Filtro por pedido + IDs e estado observado: nao sobrescreve uma alteracao concorrente.
  for (const m of modelos) {
    if (String(m.status_impressao).toUpperCase()==='IMPRESSO') continue;
    const status=m.status_impressao==null?'is.null':'eq.'+encodeURIComponent(m.status_impressao);
    const atualizado=m.updated_at==null?'is.null':'eq.'+encodeURIComponent(m.updated_at);
    const rows=await consultar('PATCH',`pedidos_modelos?id=eq.${m.id}&id_int=eq.${entrada.pedido}&status_impressao=${status}&updated_at=${atualizado}`,
      {status_impressao:'IMPRESSO'});
    if (!Array.isArray(rows)||rows.length!==1) return {id:entrada.id,estado:'conflito'};
  }
  const verificado=await consultar('GET',`pedidos_modelos?id=in.(${entrada.modelos.join(',')})&id_int=eq.${entrada.pedido}&select=id,status_impressao`);
  if (!Array.isArray(verificado)||verificado.length!==modelos.length||verificado.some((m:any)=>m.status_impressao!=='IMPRESSO'))
    throw new Recusa(503,'persistencia nao confirmada');
  return {id:entrada.id,estado:'sincronizado'};
}
