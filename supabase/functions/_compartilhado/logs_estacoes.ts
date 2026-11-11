import { banco } from './banco.ts';
import { Recusa } from './sessao.ts';

const tabela = 'imposition_logs_estacoes';
const arquivoValido = /^agent\.log(?:\.[1-5])?$/;
const estacaoValida = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/;
function exigir(ok: unknown): asserts ok { if (!ok) throw new Recusa(422, 'logs invalidos'); }

export function linhaSegura(linha: string) {
  const prefixo = linha.match(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d,\d{3} /)?.[0] || '';
  let corpo = linha.slice(prefixo.length);
  corpo = corpo.replace(/^\[\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\] /, '');
  if (/^RuntimeError: (Entrega interrompida: conexao encerrada\.|Envio do lote nao confirmado; geracao interrompida\.)$/.test(corpo)) return prefixo + corpo;
  if (/^\[integridade\] job=[a-f0-9-]{36} modelos=\['[0-9]+'(?:, '[0-9]+')*\] etapa=uploads_confirmados$/.test(corpo)) return prefixo + corpo;
  if (!/^(\[(print|impose|DIAG impose(?: stream)?)\]|\[engine\] (total_sheets=|strict_assembly:|sheet |loop done|save done|entrega por bloco:|Gerado:|Falha ao baixar arte))/.test(corpo))
    return prefixo + '[linha omitida da consulta remota]';
  if (/password|senha|secret|segredo|token|apikey|authorization|codigo_acesso|pdf_content|csv_data|font_data/i.test(corpo))
    return prefixo + '[conteudo sensivel omitido]';
  corpo = corpo.replace(/https?:\/\/\S+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REMOVIDO]')
    .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, '[EMAIL]')
    .replace(/[a-z]:[\\/][^\r\n]*|\\\\[^\r\n]*/gi, '[CAMINHO]')
    .replace(/\b[A-Za-z0-9_/-]{40,}\b/g, '[VALOR OMITIDO]');
  return (prefixo + corpo).slice(0, 2000);
}

export async function receberLogs(c: any, empresa: string, consultar = banco) {
  exigir(c && typeof c.estacao === 'string' && estacaoValida.test(c.estacao));
  exigir(typeof c.arquivo === 'string' && arquivoValido.test(c.arquivo));
  exigir(typeof c.resumo === 'string' && /^[a-f0-9]{64}$/.test(c.resumo));
  exigir(typeof c.coletado_em === 'string' && c.coletado_em.length <= 40 && Number.isFinite(Date.parse(c.coletado_em)));
  exigir(['ausente','disponivel'].includes(c.estado) && typeof c.parcial === 'boolean');
  exigir(Number.isSafeInteger(c.tamanho) && c.tamanho >= 0);
  exigir(Array.isArray(c.linhas) && c.linhas.length <= 300);
  exigir(c.linhas.every((l: unknown) => typeof l === 'string' && l.length <= 2000 && !/[\r\n]/.test(l)));
  exigir(new TextEncoder().encode(JSON.stringify(c.linhas)).length <= 65536);
  exigir(c.estado !== 'ausente' || (c.linhas.length === 0 && c.tamanho === 0 && !c.parcial));
  const row = {empresa, estacao:c.estacao.toUpperCase(), arquivo:c.arquivo, coletado_em:c.coletado_em,
    recebido_em:new Date().toISOString(), estado:c.estado, tamanho:c.tamanho, parcial:c.parcial,
    linhas:c.linhas.map(linhaSegura)};
  await consultar('POST', tabela + '?on_conflict=empresa,estacao,arquivo', row,
    'resolution=merge-duplicates,return=minimal');
  return {confirmado:c.resumo};
}

export async function consultarLogs(c: any, empresa: string, consultar = banco) {
  exigir(c && typeof c.estacao === 'string' && estacaoValida.test(c.estacao));
  const rows = await consultar('GET', tabela + '?empresa=eq.' + encodeURIComponent(empresa)
    + '&estacao=eq.' + encodeURIComponent(c.estacao.toUpperCase()) + '&select=*&order=arquivo.asc&limit=6');
  if (!Array.isArray(rows)) throw new Recusa(503, 'logs indisponiveis');
  return {estacao:c.estacao.toUpperCase(), arquivos:rows, consultado_em:new Date().toISOString(), limite_linhas:300, limite_bytes:65536};
}
