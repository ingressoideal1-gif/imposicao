import { Recusa } from './sessao.ts';
import { operadorLocalPropostas } from './propostas.ts';
import { conferirPiloto } from './piloto_local.ts';
import { listarPiloto } from './piloto_catalogo.ts';
import { banco } from './banco.ts';
import { conferirPedidoPiloto } from './piloto_pedido.ts';

export async function conferirVinculoPiloto(operador: Record<string, unknown>, estacao: string,
  empresa: string | undefined, consultar = banco): Promise<Record<string, unknown>> {
  const id = operador.piloto_usuario_id;
  if (id === undefined) return operador; // Operadores existentes sem vínculo explícito.
  if (typeof id !== 'string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)
      || operador.piloto_estacao !== estacao || !empresa || operador.piloto_empresa !== empresa) {
    throw new Recusa(403, 'vinculo do piloto divergente');
  }
  let rows;
  try { rows = await consultar('GET', `imposition_user_permissions?user_id=eq.${id}&select=*&limit=2`); }
  catch { throw new Recusa(503, 'vinculo do piloto indisponivel'); }
  if (!Array.isArray(rows) || rows.length !== 1) throw new Recusa(403, 'responsavel do piloto indisponivel');
  const conta = rows[0];
  if (conta.user_id !== id || conta.perm_producao_view !== true || conta.perm_imprimir !== true) {
    throw new Recusa(403, 'responsavel sem permissao do piloto');
  }
  const empresaConta = conta.empresa_id ?? conta.id_empresa;
  const empresaOperador = operador.empresa_id ?? operador.id_empresa;
  if (empresaConta != null && empresaOperador != null && String(empresaConta) !== String(empresaOperador)) {
    throw new Recusa(403, 'empresa do responsavel divergente');
  }
  // Conserva as restrições locais; nunca amplia permissões a partir do perfil admin.
  return {...operador, ...(empresaConta != null ? {empresa_id:empresaConta} : {})};
}

export async function operarPilotoEstacao(acao: string, req: Request,
  autenticar: (req: Request) => Promise<void>) {
  await autenticar(req);
  const estacaoLegada = Deno.env.get('PILOTO_LOCAL_ESTACAO');
  const codigo = Deno.env.get('PILOTO_LOCAL_OPERADOR');
  if (!estacaoLegada || !codigo) throw new Recusa(503, 'coleta autonoma nao habilitada');
  const leitor = req.body?.getReader(), partes: Uint8Array[] = [];
  let tamanho = 0;
  if (leitor) try {
    while (true) {
      const {value,done} = await leitor.read();
      if (done) break;
      tamanho += value.length;
      if (tamanho > 262144) { await leitor.cancel(); throw new Recusa(413, 'solicitacao excede limite'); }
      partes.push(value);
    }
  } finally { leitor.releaseLock(); }
  const bytes = new Uint8Array(tamanho); let offset = 0;
  for (const parte of partes) { bytes.set(parte,offset); offset += parte.length; }
  let corpo;
  try { corpo = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new Recusa(422,'JSON invalido'); }
  const estacao = corpo?.estacao;
  const operadorEstacao = await operadorDaEstacaoPiloto(estacao, estacaoLegada, codigo);
  delete corpo.estacao;
  const operador = await conferirVinculoPiloto(operadorEstacao, estacao,
    Deno.env.get('PILOTO_LOCAL_EMPRESA'));
  if (acao === 'listar') return await listarPiloto(corpo, operador);
  if (acao === 'conferir-pedido') return await conferirPedidoPiloto(corpo, operador);
  if (acao === 'conferir') return await conferirPiloto(corpo, operador, banco, Deno.env.get('PILOTO_LOCAL_EMPRESA'), Deno.env.get('PILOTO_LOCAL_EMPRESA_ID'), true);
  throw new Recusa(404,'operacao inexistente');
}

/** Novas estacoes exigem um vinculo explicito, unico, ativo e revogavel no servidor.
 * A autenticacao do agente ocorre antes desta consulta. Nenhum codigo vai ao MSI.
 */
export async function operadorDaEstacaoPiloto(estacao: unknown, legada: string, codigo: string,
  consultar = banco): Promise<Record<string, unknown>> {
  if (typeof estacao !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(estacao)) {
    throw new Recusa(403, 'estacao fora do piloto');
  }
  if (estacao === legada) return await operadorLocalPropostas(codigo, consultar);
  let rows;
  try {
    rows = await consultar('GET', 'imposition_acessos_locais?ativo=eq.true'
      + `&permissoes->>piloto_estacao=eq.${encodeURIComponent(estacao)}`
      + '&permissoes->>piloto_instalacao_autorizada=eq.true&select=role,permissoes&limit=2');
  } catch { throw new Recusa(503, 'habilitacao da estacao indisponivel'); }
  if (!Array.isArray(rows) || rows.length !== 1) throw new Recusa(403, 'estacao fora do piloto');
  const p = rows[0].permissoes;
  if (!p || typeof p !== 'object' || Array.isArray(p) || p.piloto_instalacao_autorizada !== true
      || p.piloto_estacao !== estacao || typeof p.piloto_usuario_id !== 'string'
      || p.perm_producao_view !== true || p.perm_imprimir !== true) {
    throw new Recusa(403, 'vinculo da estacao invalido');
  }
  return {role:rows[0].role, ...p};
}
