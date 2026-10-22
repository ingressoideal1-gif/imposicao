/** Entrega privada exclusivamente ao agente já autenticado e vinculado. */
import { Recusa } from './sessao.ts';
import { basePrivada } from './preparacao_nuvem.ts';
import { POOL_BYTES, POOL_V2_SHA256 } from './preparacao_codigos.ts';

export async function fornecerBaseQrV2(entrada: any, operador: any, estacao: string,
  carregar = basePrivada): Promise<Response> {
  const empresa = Deno.env.get('PILOTO_LOCAL_EMPRESA');
  const empresaId = Deno.env.get('PILOTO_LOCAL_EMPRESA_ID');
  const permitidas = (Deno.env.get('NEWPROD_QR_V2_ESTACOES') || '').split(',').map(s => s.trim().toUpperCase());
  // Sem configuração explícita, inclusive '*' não habilita estação alguma.
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(estacao) || !permitidas.includes(estacao.toUpperCase()))
    throw new Recusa(403, 'provisionamento QR nao autorizado');
  if (!empresa || operador?.perm_producao_view !== true || operador?.perm_imprimir !== true)
    throw new Recusa(403, 'provisionamento QR nao autorizado');
  const vinculo = operador.empresa_id ?? operador.id_empresa;
  if (vinculo != null && String(vinculo) !== empresaId)
    throw new Recusa(403, 'empresa divergente');
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)
    || Object.keys(entrada).sort().join(',') !== 'empresa,revisao'
    || entrada.empresa !== empresa || entrada.revisao !== 'ideal-qr12-1')
    throw new Recusa(422, 'solicitacao QR invalida');
  // A origem e a revisão são fixas. Não aceitar bucket, URL, arquivo ou versão do cliente.
  const bytes = await carregar(2);
  if (bytes.length !== POOL_BYTES) throw new Recusa(503, 'base QR indisponivel');
  return new Response(bytes as BodyInit, {headers: {
    'Content-Type': 'application/octet-stream', 'Content-Length': String(POOL_BYTES),
    'Cache-Control': 'private, no-store, max-age=0', 'Pragma': 'no-cache',
    'X-Content-Type-Options': 'nosniff', 'X-NewProd-QR-Revisao': 'ideal-qr12-1',
    'X-NewProd-QR-SHA256': POOL_V2_SHA256,
  }});
}
