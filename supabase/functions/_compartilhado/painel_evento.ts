import { banco, contar } from "./banco.ts";

export async function setoresDoEvento(eventoId: string): Promise<any[]> {
  const setores = (await banco(
    "GET",
    `producao_acesso_setores?evento_id=eq.${eventoId}&status=eq.ativo` +
      "&select=id,nome,quantidade,tipo_uso,abre_em,fecha_em,pedido_id_int,modelo_id," +
      "bloqueado,bloqueado_motivo" +
      "&order=nome.asc",
  )) ?? [];

  // `status=eq.ativo` porque bloqueio liberado e historico, nao configuracao.
  // Mostra-lo faria o dono liberar de novo o que ja esta liberado.
  const bloqueios = (await banco(
    "GET",
    `producao_acesso_bloqueios?evento_id=eq.${eventoId}&status=eq.ativo` +
      "&select=id,setor_id,de,ate,motivo&order=de.asc",
  )) ?? [];
  for (const s of setores) {
    s.bloqueios = bloqueios.filter((b: any) => String(b.setor_id) === String(s.id));
  }
  return setores;
}

export async function painel(eventoId: string): Promise<any> {
  const evento = ((await banco(
    "GET",
    `producao_acesso_eventos?id=eq.${eventoId}` +
      "&select=id,nome_evento,data_evento,local_evento,status",
  )) ?? [])[0] ?? null;

  const setores = await setoresDoEvento(eventoId);

  // A faixa IMPRESSA em cada setor vem do ERP, e nao de um MIN/MAX sobre as
  // credenciais publicadas: uma faixa deduzida do que ja foi impresso encolhe
  // quando metade dos modelos ainda nao passou pela impressora. E agregacao
  // esta desligada neste PostgREST.
  const modelos = [...new Set<number>(
    setores.filter((s: any) => s.modelo_id !== null && s.modelo_id !== undefined)
      .map((s: any) => Number(s.modelo_id)),
  )].sort((a, b) => a - b);
  const faixas: Record<number, any> = {};
  if (modelos.length) {
    for (
      const m of (await banco(
        "GET",
        `pedidos_modelos?id=in.(${modelos.join(",")})` +
          "&select=id,numeracao_inicio,numeracao_fim",
      )) ?? []
    ) {
      faixas[Number(m.id)] = m;
    }
  }
  for (const s of setores) {
    const f = s.modelo_id !== null && s.modelo_id !== undefined
      ? faixas[Number(s.modelo_id)]
      : null;
    // Ausente e nao zero: o modelo pode nao ter faixa cadastrada, e um
    // "de 0000 a 0000" na tela do dono seria pior que linha nenhuma.
    s.numero_de = f?.numeracao_inicio ?? null;
    s.numero_ate = f?.numeracao_fim ?? null;
  }

  const aparelhos = (await banco(
    "GET",
    `producao_acesso_dispositivos?evento_id=eq.${eventoId}` +
      "&select=id,nome,status,ultimo_visto&order=nome.asc",
  )) ?? [];
  // Escopado aos aparelhos ja buscados: sem o `in.(...)`, esta consulta trazia
  // os vinculos de TODOS os eventos do sistema a cada abertura do painel.
  const idsAparelhos = aparelhos.map((a: any) => String(a.id));
  const vinculos = idsAparelhos.length
    ? ((await banco(
      "GET",
      `producao_acesso_dispositivo_setores?dispositivo_id=in.(${idsAparelhos.join(",")})` +
        "&select=dispositivo_id,setor_id",
    )) ?? [])
    : [];
  for (const a of aparelhos) {
    a.setores = vinculos
      .filter((v: any) => String(v.dispositivo_id) === String(a.id))
      .map((v: any) => v.setor_id);
  }

  const pedidos = (await banco(
    "GET",
    `producao_acesso_pedidos?evento_id=eq.${eventoId}` +
      "&select=pedido_id_int,publicado_em,total_credenciais&order=pedido_id_int.asc",
  )) ?? [];

  // A contagem por setor so acontece quando o evento tem ALGUM codigo de
  // cliente. Sem esta guarda, um evento comum -- que e a maioria, e nunca
  // carregou codigo nenhum -- pagaria uma ida ao banco por setor a cada
  // abertura da tela para receber zero em todas.
  const codigos = await contar(
    `producao_acesso_credenciais?evento_id=eq.${eventoId}&origem=eq.cliente`,
  );
  for (const s of setores) {
    s.codigos_cliente = codigos
      ? await contar(
        `producao_acesso_credenciais?setor_id=eq.${s.id}&origem=eq.cliente`,
      )
      : 0;
  }

  return { evento, setores, aparelhos, pedidos, codigos_cliente: codigos };
}
