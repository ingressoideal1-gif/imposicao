import { banco } from './banco.ts';
import { Recusa } from './sessao.ts';

const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const numero = /^[1-9][0-9]{0,15}$/;
const estacaoValida = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/;
const tabela = 'imposition_historico_impressao';
function exigir(ok: unknown, mensagem = 'historico invalido'): asserts ok {
  if (!ok) throw new Recusa(422, mensagem);
}

export function empresaHistorico(permissoes: any, empresa: string | undefined, empresaId: string | undefined) {
  if (!empresa || !empresaId) throw new Recusa(503, 'empresa do historico nao configurada');
  const id = permissoes?.empresa_id ?? permissoes?.id_empresa;
  if (id != null && String(id) !== empresaId) throw new Recusa(403, 'empresa divergente');
  return empresaId;
}

export async function receberHistorico(corpo: any, empresa: string, consultar = banco) {
  exigir(corpo && uuid.test(corpo.instalacao) && estacaoValida.test(corpo.estacao));
  exigir(Number.isSafeInteger(corpo.cursor) && corpo.cursor > 0);
  exigir(Array.isArray(corpo.eventos) && corpo.eventos.length > 0 && corpo.eventos.length <= 30);
  let anterior = 0;
  const rows = corpo.eventos.map((e: any) => {
    exigir(Number.isSafeInteger(e.seq) && e.seq > anterior && e.seq <= corpo.cursor);
    anterior = e.seq;
    exigir(uuid.test(e.trabalho) && typeof e.quando === 'string' && e.quando.length <= 40 && Number.isFinite(Date.parse(e.quando)));
    exigir(typeof e.codigo === 'string' && /^(trabalho_(preparado|envio_iniciado|enviado|na_fila|imprimindo|erro_fila|pausado|incerto|conferido|cancelado|falha|simulado|consumido_rip)|conferencia_operador|hotfolder_arquivo_(presente|ausente))$/.test(e.codigo));
    exigir(['info', 'erro'].includes(e.nivel));
    const c = e.contexto;
    exigir(c && Array.isArray(c.alvos) && c.alvos.length <= 128);
    exigir(['capa','contracapa','miolo','nao_identificado'].includes(c.tipo));
    exigir(['modelo','selecao','sem_identificacao'].includes(c.escopo));
    exigir(c.lote == null || uuid.test(c.lote));
    const alvos = c.alvos.map((a: any) => {
      exigir(a && typeof a.pedido === 'string' && numero.test(a.pedido) && typeof a.modelo === 'string' && numero.test(a.modelo));
      return {pedido:a.pedido, modelo:a.modelo};
    });
    const dados: Record<string, unknown> = {};
    for (const k of ['estado','operador','spool_id','tipo','motivo']) {
      const v = e.dados?.[k];
      if (v != null) { exigir(['string','number','boolean'].includes(typeof v) && String(v).length <= (k === 'motivo' ? 2000 : 100)); dados[k] = v; }
    }
    exigir(e.impressora == null || typeof e.impressora === 'string' && e.impressora.length <= 256);
    exigir(e.spool_id == null || Number.isSafeInteger(e.spool_id) && e.spool_id >= 0);
    return {empresa, estacao:corpo.estacao, instalacao:corpo.instalacao, seq:e.seq, trabalho:e.trabalho,
      quando:e.quando, codigo:e.codigo, nivel:e.nivel, impressora:e.impressora, spool_id:e.spool_id,
      contexto:{alvos, tipo:c.tipo, escopo:c.escopo, lote:c.lote || null, reimpressao:c.reimpressao === true}, dados};
  });
  // Transacao unica do PostgREST; retransmissao apos timeout nao duplica eventos.
  await consultar('POST', tabela + '?on_conflict=empresa,estacao,instalacao,seq,quando', rows,
    'resolution=ignore-duplicates,return=minimal');
  return {confirmado:corpo.cursor, instalacao:corpo.instalacao};
}

export async function consultarHistorico(corpo: any, empresa: string, consultar = banco) {
  exigir(corpo && typeof corpo === 'object' && !Array.isArray(corpo));
  const dias = corpo.dias ?? 7;
  exigir(Number.isInteger(dias) && dias >= 1 && dias <= 90);
  let caminho = tabela + '?empresa=eq.' + encodeURIComponent(empresa)
    + '&select=*&order=id.desc&limit=101'
    + '&quando=gte.' + encodeURIComponent(new Date(Date.now() - dias * 86400000).toISOString());
  if (corpo.antes != null) { exigir(numero.test(String(corpo.antes))); caminho += '&id=lt.' + corpo.antes; }
  if (corpo.estacao) { exigir(estacaoValida.test(corpo.estacao)); caminho += '&estacao=eq.' + encodeURIComponent(corpo.estacao); }
  const alvo: Record<string,string> = {};
  for (const k of ['pedido','modelo']) if (corpo[k]) { exigir(numero.test(corpo[k])); alvo[k] = corpo[k]; }
  if (Object.keys(alvo).length) caminho += '&contexto=cs.' + encodeURIComponent(JSON.stringify({alvos:[alvo]}));
  const rows = await consultar('GET', caminho);
  if (!Array.isArray(rows)) throw new Recusa(503, 'historico indisponivel');
  return {eventos:rows.slice(0,100), proximo:rows.length > 100 ? rows[99].id : null,
    consultado_em:new Date().toISOString(), impressao_fisica:'exige conferencia'};
}
