/** Lista comercial independente dos PDFs preparados. Somente leitura. */
import { banco } from './banco.ts';
import { Recusa } from './sessao.ts';
import { operarPropostas } from './propostas.ts';
import { digestPiloto } from './piloto_local.ts';

export async function listaOffline(entrada:any, operador:any, consultar=banco,
  empresa=Deno.env.get('PILOTO_LOCAL_EMPRESA'), empresaId=Deno.env.get('PILOTO_LOCAL_EMPRESA_ID')) {
  if (!empresa || entrada?.empresa!==empresa || operador?.perm_producao_view!==true
      || operador?.perm_imprimir!==true || Object.keys(entrada).sort().join(',')!=='empresa,revisao'
      || typeof entrada.revisao!=='string' || entrada.revisao!=='' && !/^[a-f0-9]{64}$/.test(entrada.revisao)
      || ((operador.empresa_id??operador.id_empresa)!=null && String(operador.empresa_id??operador.id_empresa)!==empresaId))
    throw new Recusa(403,'lista nao autorizada');
  const ler:typeof banco=async (...args)=> {
    let rows;
    try { rows=await consultar(...args); } catch { throw new Recusa(503,'lista indisponivel'); }
    if (!Array.isArray(rows)) throw new Recusa(503,'lista incompleta');
    for (const r of rows) {
      const id=r.empresa_id??r.id_empresa;
      if (id!=null && String(id)!==empresaId) throw new Recusa(403,'empresa divergente');
    }
    return rows;
  };
  const pedidos:any[]=[];
  for (let offset=0;;offset+=500) {
    if (offset>=10000) throw new Recusa(413,'lista excede limite');
    const rows=await operarPropostas('consultar',{tipo:'status',
      status:['EM PRODUCAO','EM PRODUÇÃO','EM IMPRESSAO','EM IMPRESSÃO','EM ACABAMENTO'],offset,limite:500},operador,ler);
    pedidos.push(...rows);
    if (rows.length<500) break;
  }
  const ids=pedidos.map(p=>String(p.id_int));
  if (ids.some(id=>!/^\d+$/.test(id)) || new Set(ids).size!==ids.length) throw new Recusa(409,'pedidos ambiguos');
  async function lotes(tabela:string,campos:string,chave:string,numeros:string[]) {
    const rows:any[]=[];
    for(let i=0;i<numeros.length;i+=100) {
      for(let offset=0;;offset+=500) {
        if(offset>=10000) throw new Recusa(413,'lista excede limite');
        const pagina=await ler('GET',`${tabela}?select=${campos}&${chave}=in.(${numeros.slice(i,i+100).join(',')})&order=${tabela==='produtos'?'id_produto':'id'}&limit=500&offset=${offset}`);
        rows.push(...pagina);
        if(pagina.length<500) break;
      }
    }
    return rows;
  }
  const [origens,modelos,prazos,artes]=await Promise.all([
    lotes('produtos_proposta','id,id_int,id_produto,nome_produto,modelo_descri,qtd,created_at,updated_at,amostra_cor_id,amostra_num_id,amostra_status,amostra_obs,amostra_arte_base64,arte_url','id_int',ids),
    lotes('pedidos_modelos','id,id_int,id_produto_proposta_origem,status_arte,status_impressao,status_impressao_em,status_impressao_registrado_em,status_producao,quantidade,ordem,nome_modelo,amostra_num_id,amostra_arte_base64,arte_url','id_int',ids),
    lotes('propostas_os','id,id_int,data_termino,codigo_rastreamento','id_int',ids),
    lotes('pedidos_artes','id,id_int,status,nome_evento,designer_nome,designer_uid,entrega_dados','id_int',ids)
  ]);
  const produtosIds=[...new Set(origens.map(p=>String(p.id_produto)).filter(id=>/^\d+$/.test(id)))];
  const produtos=await lotes('produtos','id_produto,nomeReal,setor_pcp,is_estoque','id_produto',produtosIds);
  const lista={pedidos,origens,modelos,prazos,produtos,artes};
  const revisao=await digestPiloto(lista);
  return {empresa,revisao,sem_mudanca:entrada.revisao===revisao,
    ...(entrada.revisao===revisao?{}:{lista})};
}
