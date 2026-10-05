/** Uma revisao por pedido; sem consultas por modelo nem escrita comercial. */
import { banco } from './banco.ts';
import { Recusa } from './sessao.ts';
import { digestPiloto, fontesPiloto } from './piloto_local.ts';

const normal = (v: unknown) => String(v ?? '').trim().toUpperCase();
const aprovados = new Set(['APROVADO','APROVADA','APROVADA_CLIENTE','LIBERADA','ARTE_APROVADA','ARTE APROVADA']);
export async function conferirPedidoPiloto(entrada: any, permissoes: any, consultar = banco,
  empresa = Deno.env.get('PILOTO_LOCAL_EMPRESA'), empresaId = Deno.env.get('PILOTO_LOCAL_EMPRESA_ID'),
  host = new URL(Deno.env.get('SUPABASE_URL') || 'https://invalido.invalid').host) {
  if (!empresa || permissoes?.perm_producao_view !== true || permissoes?.perm_imprimir !== true)
    throw new Recusa(403,'piloto sem empresa ou permissoes');
  const vinculo = permissoes.empresa_id ?? permissoes.id_empresa;
  if (vinculo != null && String(vinculo) !== empresaId) throw new Recusa(403,'empresa divergente');
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)
    || Object.keys(entrada).sort().join(',') !== 'empresa,pedido,revisao' || entrada.empresa !== empresa
    || typeof entrada.pedido !== 'string' || !/^[1-9][0-9]{0,9}$/.test(entrada.pedido)
    || Number(entrada.pedido)>2147483647 || typeof entrada.revisao !== 'string'
    || entrada.revisao !== '' && !/^[a-f0-9]{64}$/.test(entrada.revisao)) throw new Recusa(422,'pedido invalido');
  let resposta;
  try { resposta = await consultar('POST','rpc/piloto_snapshot_pedido',{
    p_pedido:entrada.pedido,p_empresa_id:empresaId || '',p_host:host,p_revisao:entrada.revisao}); }
  catch { throw new Recusa(503,'revisao do pedido indisponivel'); }
  if (!resposta || resposta.pedido !== entrada.pedido || !/^[a-f0-9]{64}$/.test(resposta.revisao)
    || typeof resposta.sem_mudanca !== 'boolean' || resposta.sem_mudanca !== (resposta.revisao === entrada.revisao))
    throw new Recusa(503,'revisao incompleta');
  const recibo = {empresa,pedido:entrada.pedido,revisao:resposta.revisao,sem_mudanca:resposta.sem_mudanca,
    conferido_em:new Date().toISOString(),execucao_offline:false};
  if (resposta.sem_mudanca) return recibo;
  const d = resposta.snapshot;
  if (!d || ['modelos','numeracoes','origens','produtos','pedidos','prazos','recursos'].some(k=>!Array.isArray(d[k]))
    || d.modelos.length>128 || d.pedidos.length !== 1) throw new Recusa(409,'pedido incompleto');
  for (const row of [...d.modelos,...d.numeracoes,...d.origens,...d.produtos]) {
    const id = row.empresa_id ?? row.id_empresa;
    if (id != null && String(id) !== empresaId) throw new Recusa(403,'empresa divergente');
  }
  const itens = [];
  const vistos = new Set<string>();
  for (const m of d.modelos) {
    const id = String(m.id);
    if (!/^[1-9][0-9]*$/.test(id) || !Number.isSafeInteger(Number(id)) || vistos.has(id)
      || String(m.id_int) !== entrada.pedido) throw new Recusa(409,'modelo divergente');
    vistos.add(id);
    const impresso = normal(m.status_impressao || m.status_producao)==='IMPRESSO';
    if (!aprovados.has(normal(m.status_arte)) || !impresso && !['','AGUARDANDO','PENDENTE'].includes(normal(m.status_impressao || m.status_producao))) continue;
    if (!impresso && !['EM PRODUCAO','EM PRODUÇÃO','EM IMPRESSAO','EM IMPRESSÃO','EM ACABAMENTO'].includes(normal(d.pedidos[0].status_interno))) continue;
    const numId = m.amostra_num_id || m.numeracao_id;
    const nums = numId ? d.numeracoes.filter((n:any)=>String(n.id)===String(numId)) : [];
    if (numId && nums.length !== 1) throw new Recusa(409,'numeracao incompleta');
    let produtoId = m.id_produto;
    if (!/^[1-9][0-9]*$/.test(String(produtoId))) {
      const origens = d.origens.filter((p:any)=>String(p.id)===String(m.id_produto_proposta_origem) && String(p.id_int)===entrada.pedido);
      produtoId = origens.length === 1 ? origens[0].id_produto : null;
    }
    const produtos = d.produtos.filter((p:any)=>String(p.id_produto)===String(produtoId));
    const produto = produtos.length === 1 ? produtos[0] : null;
    if (produto?.is_estoque === true) continue;
    const fontes = fontesPiloto(m,nums);
    if (!fontes.frente) continue;
    const versoes_fontes:Record<string,any> = {};
    for (const [nome,url] of Object.entries(fontes)) {
      const registros = d.recursos.filter((r:any)=>r.url===url);
      const objeto = registros.length===1 ? registros[0].objeto : null;
      // Ausencia de versionamento exige HTTP; nunca ganha dispensa por URL.
      versoes_fontes[nome] = objeto?.version && objeto?.metadata?.eTag
        ? {revisao:await digestPiloto(objeto),etag:String(objeto.metadata.eTag)} : null;
    }
    itens.push({empresa,modelo:id,pedido:entrada.pedido,fontes,versoes_fontes,
      setor:String(produto?.setor_pcp || ''),prazo_erp:d.prazos[0]?.data_termino || null,
      observacao:{digest:await digestPiloto([m,nums]),aprovacao:normal(m.status_arte)}});
  }
  return {...recibo,itens};
}
