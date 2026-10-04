/** Descoberta paginada somente leitura. Conferência final ocorre na admissão. */
import { banco } from './banco.ts';
import { Recusa } from './sessao.ts';
import { digestPiloto, fontesPiloto, produtoPiloto } from './piloto_local.ts';

export async function listarPiloto(entrada: any, permissoes: any, consultar = banco,
  empresa = Deno.env.get('PILOTO_LOCAL_EMPRESA'), empresaId = Deno.env.get('PILOTO_LOCAL_EMPRESA_ID')) {
  if (!empresa || permissoes?.perm_producao_view !== true || permissoes?.perm_imprimir !== true) {
    throw new Recusa(403, 'piloto sem empresa ou permissoes');
  }
  const vinculo = permissoes.empresa_id ?? permissoes.id_empresa;
  if (vinculo != null && String(vinculo) !== empresaId) throw new Recusa(403, 'empresa divergente');
  if (!entrada || entrada.empresa !== empresa || !Number.isSafeInteger(entrada.cursor) || entrada.cursor < 0
      || Object.keys(entrada).some(k => !['empresa','cursor','pedido'].includes(k))) throw new Recusa(422, 'cursor invalido');
  const pedido = entrada.pedido;
  if (pedido !== undefined && (typeof pedido !== 'string' || !/^[1-9][0-9]{0,14}$/.test(pedido))) throw new Recusa(422, 'pedido invalido');
  const ler = async (query: string) => {
    let rows;
    try { rows = await consultar('GET', query); } catch { throw new Recusa(503, 'catalogo indisponivel'); }
    if (!Array.isArray(rows)) throw new Recusa(503, 'catalogo incompleto');
    for (const r of rows) {
      const id = r.empresa_id ?? r.id_empresa;
      if (id != null && String(id) !== empresaId) throw new Recusa(403, 'empresa divergente');
    }
    return rows;
  };
  // Busca limitada e cursor por chave, sem OFFSET que pula linhas em fila mutável.
  const modelos = await ler('pedidos_modelos?select=*&order=id.asc&limit=16&id=gt.' + entrada.cursor
    + '&status_arte=in.(APROVADO,APROVADA,APROVADA_CLIENTE,LIBERADA,ARTE_APROVADA,ARTE%20APROVADA)'
    + (pedido ? '&id_int=eq.' + pedido + '&or=(status_impressao.is.null,status_impressao.eq.,status_impressao.in.(Aguardando,AGUARDANDO,PENDENTE,Impresso,IMPRESSO))'
      : '&or=(status_impressao.is.null,status_impressao.eq.,status_impressao.in.(Aguardando,AGUARDANDO,PENDENTE))'));
  if (modelos.length > 16) throw new Recusa(503, 'pagina excedente');
  const itens = [];
  let cursor = entrada.cursor;
  for (const m of modelos) {
    const id = Number(m.id);
    if (!Number.isSafeInteger(id) || id <= cursor) throw new Recusa(503, 'pagina fora de ordem');
    cursor = id;
    if (pedido && String(m.id_int) !== pedido) throw new Recusa(503, 'pedido divergente');
    const impresso = pedido && String(m.status_impressao || m.status_producao || '').trim().toUpperCase() === 'IMPRESSO';
    if (!impresso && !['','AGUARDANDO','PENDENTE'].includes(String(m.status_impressao || m.status_producao || '').trim().toUpperCase())) continue;
    if (!/^[1-9][0-9]*$/.test(String(m.id_int))) continue;
    const pedidos = await ler(`propostas?id_int=eq.${m.id_int}&select=*&limit=2`);
    if (pedidos.length !== 1 || !impresso && !['EM PRODUCAO','EM PRODUÇÃO','EM IMPRESSAO','EM IMPRESSÃO','EM ACABAMENTO'].includes(String(pedidos[0].status_interno).trim().toUpperCase())) continue;
    const numero = m.amostra_num_id || m.numeracao_id;
    if (numero && !/^[a-zA-Z0-9-]+$/.test(String(numero))) continue;
    const nums = numero ? await ler(`producao_numeracoes?id=eq.${numero}&select=*&limit=2`) : [];
    if (numero && nums.length !== 1) continue;
    const fontes = fontesPiloto(m, nums);
    if (!Object.keys(fontes).length) continue;
    const prazos = await ler(`propostas_os?id_int=eq.${m.id_int}&select=*&order=data_termino.asc&limit=2`);
    const produto = await produtoPiloto(m, ler);
    if (produto?.is_estoque === true) continue;
    const setor = String(produto?.setor_pcp || '');
    itens.push({empresa, modelo:String(m.id), pedido:String(m.id_int), fontes, setor,
      prazo_erp:prazos[0]?.data_termino || null,
      observacao:{digest:await digestPiloto([m,nums]),aprovacao:String(m.status_arte).trim().toUpperCase()}});
  }
  return {itens, proximo:modelos.length === 16 ? cursor : 0, fim:modelos.length < 16};
}
