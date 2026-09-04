/**
 * Desfazer e refazer o vinculo entre um pedido e o evento dele.
 *
 * As duas unicas situacoes em que, ate 04/09/2026, a resposta era "a grafica
 * mexe no banco a mao". Regra deste projeto: toda trava tem de dizer, na
 * propria tela, como se sai dela.
 *
 * ## Desvincular
 *
 * O cliente carrega o pedido no evento errado, ou junta dois que nao deviam
 * ficar juntos. O `carregar` recusa com "este pedido ja esta num evento" e nao
 * existia caminho de volta em tela nenhuma -- nem na do cliente, nem na da
 * grafica.
 *
 * ## Sincronizar
 *
 * Os setores sao gravados UMA VEZ, no momento do carregar. Se depois disso um
 * modelo ganhar uma numeracao com codigo -- que e exatamente o conserto quando
 * a grafica errou a numeracao --, o setor dele nunca aparece. O pedido fica
 * com um setor a menos para sempre, e o sintoma e o pior desta casa: ninguem
 * procura um setor que nunca existiu.
 *
 * ## A trava que as duas respeitam
 *
 * NENHUMA das duas mexe em setor que ja teve leitura. Depois que gente passou
 * pela porta, aquele setor e historico: apagar a linha levaria junto a resposta
 * de "quem entrou naquela noite", e o relatorio do evento e o que o cliente
 * pagou para ter.
 */
import { banco, contar } from "./banco.ts";
import { Recusa } from "./sessao.ts";
import { modelosLegiveis } from "./pedidos.ts";

/** Os setores ATIVOS que aquele pedido criou naquele evento. */
async function setoresDoPedido(
  pedidoIdInt: number,
  eventoId: string,
): Promise<any[]> {
  return (await banco(
    "GET",
    `producao_acesso_setores?evento_id=eq.${eventoId}` +
      `&pedido_id_int=eq.${pedidoIdInt}&status=eq.ativo` +
      "&select=id,nome,modelo_id,quantidade&order=nome.asc",
  )) ?? [];
}

/**
 * Quantas leituras existem nestes setores.
 *
 * Uma consulta com `in.(...)`, e nao uma por setor: um pedido pode ter dez
 * modelos, e esta pergunta e feita antes de QUALQUER escrita -- ela nao pode
 * ser a parte cara da operacao.
 */
async function leiturasNesses(setores: any[]): Promise<number> {
  if (!setores.length) return 0;
  const ids = setores.map((s: any) => `"${s.id}"`).join(",");
  return await contar(`producao_acesso_leituras?setor_id=in.(${ids})`);
}

/**
 * Solta o pedido do evento: descarimba as credenciais, desliga os setores que
 * ele criou e apaga o vinculo.
 *
 * A ordem e proposital e vale ser lida de tras para frente: o `evento_id` do
 * PEDIDO sai por ULTIMO. Enquanto ele estiver la, o pedido continua se
 * declarando carregado, e uma falha no meio deixa a operacao pela metade mas
 * repetivel -- chamar de novo termina o servico. Invertida, uma falha depois de
 * soltar o pedido deixaria setores vivos apontando para um evento que o pedido
 * ja nao conhece, e nenhuma tela mostraria isso.
 *
 * As credenciais NAO sao apagadas: elas sao o que foi impresso, e continuam
 * validas para o dia em que o pedido for carregado no evento certo. O que sai e
 * o carimbo (`evento_id`/`setor_id`), que e justamente o que estava errado.
 */
export async function desvincularPedido(
  pedidoIdInt: number,
  eventoId: string,
): Promise<any> {
  const setores = await setoresDoPedido(pedidoIdInt, eventoId);
  const leituras = await leiturasNesses(setores);
  if (leituras > 0) {
    throw new Recusa(
      409,
      "este pedido ja teve " + leituras + " leitura" + (leituras === 1 ? "" : "s") +
        " na portaria deste evento. Desfazer o vinculo perderia de que setor " +
        "cada pessoa entrou, e o relatorio da noite nao teria como ser refeito. " +
        "Se o pedido esta mesmo no evento errado, fale com a grafica.",
    );
  }

  await banco(
    "PATCH",
    `producao_acesso_credenciais?pedido_id_int=eq.${pedidoIdInt}` +
      `&evento_id=eq.${eventoId}`,
    { evento_id: null, setor_id: null },
    "return=minimal",
  );
  for (const s of setores) {
    // `excluido`, e nao DELETE: o vinculo do aparelho com o setor
    // (`producao_acesso_dispositivo_setores`) aponta para esta linha, e apagar
    // a linha derrubaria a configuracao de um portao por causa de um pedido que
    // saiu. Desligado, ele some da carga -- que so leva `status=ativo`.
    await banco(
      "PATCH",
      `producao_acesso_setores?id=eq.${s.id}`,
      { status: "excluido" },
      "return=minimal",
    );
  }
  await banco(
    "PATCH",
    `producao_acesso_pedidos?pedido_id_int=eq.${pedidoIdInt}`,
    { evento_id: null },
    "return=minimal",
  );

  return {
    pedido: pedidoIdInt,
    setores_desligados: setores.length,
    nomes: setores.map((s: any) => s.nome),
  };
}

/**
 * Confere os setores do pedido contra o ERP e cria os que faltam.
 *
 * Tres coisas podem estar diferentes do dia do carregar, e as tres tem conserto
 * aqui:
 *
 *   - um modelo GANHOU codigo depois (numeracao trocada, reimpressao): vira
 *     setor agora, e as credenciais dele sao carimbadas na mesma passada;
 *   - um modelo mudou de nome ou de quantidade no ERP: o setor continua como
 *     esta. O nome e do CLIENTE -- ele renomeia o setor para o que o porteiro
 *     precisa ler, e sobrescrever isso apagaria o trabalho dele. A quantidade,
 *     sim, e atualizada: ela E a lotacao contratada, e um numero velho ali faria
 *     o contador da portaria comparar com o contrato errado;
 *   - um modelo PERDEU o codigo: o setor so e desligado se estiver vazio --
 *     nenhuma credencial e nenhuma leitura. E o caso dos oito setores orfaos
 *     criados antes de o filtro de legibilidade existir. Com credencial dentro,
 *     ele fica, e a tela mostra o aviso: desligar um setor que tem ingresso
 *     impresso e decisao de gente, nao de rotina.
 */
export async function sincronizarSetores(
  pedidoIdInt: number,
  eventoId: string,
): Promise<any> {
  const legiveis = await modelosLegiveis(pedidoIdInt);
  const existentes = await setoresDoPedido(pedidoIdInt, eventoId);
  const porModelo: Record<string, any> = {};
  for (const s of existentes) {
    if (s.modelo_id !== null && s.modelo_id !== undefined) {
      porModelo[String(s.modelo_id)] = s;
    }
  }

  const criados: string[] = [];
  const atualizados: string[] = [];
  for (const m of legiveis) {
    const ja = porModelo[String(m.modelo_id)];
    if (!ja) {
      const criado = await banco("POST", "producao_acesso_setores", {
        evento_id: eventoId,
        pedido_id_int: pedidoIdInt,
        modelo_id: m.modelo_id,
        nome: m.nome,
        quantidade: m.quantidade,
      });
      // O mesmo carimbo do `carregar`: as credenciais que ja foram publicadas
      // passam a pertencer a este setor. Sem ele, o modelo vira setor e os
      // ingressos dele continuam orfaos -- a portaria nao saberia de que setor
      // sao, e o bloqueio por faixa, que e por setor, nao alcancaria nenhum.
      await banco(
        "PATCH",
        `producao_acesso_credenciais?pedido_id_int=eq.${pedidoIdInt}` +
          `&modelo_id=eq.${m.modelo_id}`,
        { evento_id: eventoId, setor_id: criado[0].id },
        "return=minimal",
      );
      criados.push(m.nome);
      continue;
    }
    if (Number(ja.quantidade ?? 0) !== Number(m.quantidade ?? 0)) {
      await banco(
        "PATCH",
        `producao_acesso_setores?id=eq.${ja.id}`,
        { quantidade: m.quantidade },
        "return=minimal",
      );
      atualizados.push(ja.nome);
    }
  }

  // Os que sobraram: setor cujo modelo nao e mais legivel (ou nunca foi).
  const legiveisIds = new Set(legiveis.map((m) => String(m.modelo_id)));
  const desligados: string[] = [];
  const mantidos: string[] = [];
  for (const s of existentes) {
    if (s.modelo_id === null || s.modelo_id === undefined) continue;
    if (legiveisIds.has(String(s.modelo_id))) continue;
    const credenciais = await contar(
      `producao_acesso_credenciais?setor_id=eq.${s.id}`,
    );
    const leituras = await contar(`producao_acesso_leituras?setor_id=eq.${s.id}`);
    if (credenciais === 0 && leituras === 0) {
      await banco(
        "PATCH",
        `producao_acesso_setores?id=eq.${s.id}`,
        { status: "excluido" },
        "return=minimal",
      );
      desligados.push(s.nome);
    } else {
      mantidos.push(s.nome);
    }
  }

  return {
    pedido: pedidoIdInt,
    criados,
    atualizados,
    desligados,
    // Setor que perdeu o codigo mas tem ingresso dentro. A tela avisa; a
    // decisao e de gente.
    mantidos_com_ingresso: mantidos,
  };
}
