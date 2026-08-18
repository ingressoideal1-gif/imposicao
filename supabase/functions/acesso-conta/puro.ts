/**
 * As pecas da tela do cliente que nao tocam em rede nem em banco.
 *
 * Arquivo separado pelo mesmo motivo das outras funcoes: o `index.ts` chama
 * `Deno.serve()` no topo, entao importa-lo liga um servidor.
 */

/** O caminho depois do nome da funcao, em pedacos. Ver `acesso-interno/puro.ts`
 * para o porque de o prefixo sair por regex e nao por contagem de segmentos. */
export function pedacosDaRota(pathname: string): string[] {
  return pathname
    .replace(/^.*\/acesso-conta\/?/, "")
    .split("/")
    .filter((p) => p !== "")
    .map(decodeURIComponent);
}

/**
 * A traducao das recusas do QR do Pedido para o cliente.
 *
 * As mensagens do modulo de assinatura sao tecnicas de proposito: elas vao para
 * log e para teste. Quem le ESTA resposta e o cliente, no celular dele, e
 * "token malformado" nao e frase para ninguem que nao escreva software.
 *
 * A traducao mora aqui, e nao la, para o modulo de criptografia continuar
 * dizendo exatamente o que houve.
 */
const HUMANO: Record<string, string> = {
  "token malformado":
    "Este endereco nao parece um QR do controle de acesso. " +
    "Leia o QR de novo com a camera.",
  "assinatura invalida": "Este QR nao e valido. Peca um novo a quem o enviou.",
  "token vencido": "Este QR venceu. Peca um novo a quem o enviou.",
};

export function recusaHumana(motivo: string): string {
  return HUMANO[motivo] ?? "Nao consegui abrir este QR.";
}

/**
 * Os tipos de elemento que a portaria consegue ler.
 *
 * Duplicado de `acesso-interno/puro.ts` de proposito? NAO -- este arquivo
 * importa de la seria uma dependencia entre duas funcoes que se publicam
 * separadas, e o Supabase empacota cada uma com suas dependencias. O que as
 * duas dividem mora em `_compartilhado/`. Aqui nao ha nada a dividir: a tela do
 * cliente nao decide o que sobe, ela so LE os setores que ja existem.
 */

/** O nome padrao de um evento criado a partir de um pedido. */
export function nomeDoEvento(nomePedido: string, pedido: number): string {
  return String(nomePedido ?? "").trim() || `Evento do pedido ${pedido}`;
}

/**
 * De quem e o evento.
 *
 * Duas portas, e basta uma: a conta que o criou (`dono_auth_id`, o que valia
 * ate 17/08/2026 e continua valendo para os eventos antigos) ou qualquer conta
 * ligada ao mesmo cliente do ERP (`id_cliente`). Decisao do usuario: duas
 * pessoas do mesmo cliente veem e configuram os mesmos eventos.
 */
export function pertenceAConta(
  evento: { dono_auth_id?: string | null; id_cliente?: number | null },
  userId: string,
  clientes: number[],
): boolean {
  if (evento?.dono_auth_id && String(evento.dono_auth_id) === String(userId)) return true;
  const c = Number(evento?.id_cliente);
  return Boolean(c) && clientes.includes(c);
}

export function nomeDaFicha(ficha: any, pedido: number): string {
  const nome = String(ficha?.nome_evento ?? "").trim();
  return nome || `Pedido ${pedido}`;
}

/**
 * O que entra em "Meus Pedidos". Decisao do usuario: SO os ja impressos.
 *
 *   1. nao cancelado no ERP (`status_interno`, o unico estado que importa la);
 *   2. com pelo menos um modelo legivel (QR Ideal, QR, barras);
 *   3. com pelo menos uma credencial publicada -- a grafica imprimiu. E a
 *      contagem de credenciais, NAO `publicado_em`: gerar QR e reimprimir a
 *      zeram, e ela esta nula em todos os pedidos de hoje;
 *   4. ainda nao carregado (sem `evento_id`).
 *
 * Puro: quem busca as cinco listas e o `meusPedidos` do index.ts.
 */
export function montarMeusPedidos(entrada: {
  propostas: any[];
  legiveisPorPedido: Record<string, any[]>;
  credenciaisPorPedidoModelo: Record<string, number>;
  fichasPorPedido: Record<string, any>;
  carregados: number[];
}): any[] {
  const carregados = new Set((entrada.carregados ?? []).map(Number));
  const saida: any[] = [];
  for (const p of entrada.propostas ?? []) {
    const pedido = Number(p.id_int);
    if (!pedido || carregados.has(pedido)) continue;
    if (String(p.status_interno ?? "").trim().toUpperCase() === "CANCELADO") continue;
    const legiveis = entrada.legiveisPorPedido?.[String(pedido)] ?? [];
    if (!legiveis.length) continue;
    const setores = legiveis.map((m: any) => ({
      modelo_id: Number(m.modelo_id),
      nome: m.nome,
      quantidade: Number(m.quantidade ?? 0),
      impresso: Number(entrada.credenciaisPorPedidoModelo?.[`${pedido}:${m.modelo_id}`] ?? 0) > 0,
    }));
    if (!setores.some((s: any) => s.impresso)) continue;
    const ficha = entrada.fichasPorPedido?.[String(pedido)] ?? null;
    saida.push({
      pedido,
      id_cliente: Number(p.id_cliente),
      data: String(p.created_at ?? "").slice(0, 10),
      criado_em: String(p.created_at ?? ""),
      nome_evento: nomeDaFicha(ficha, pedido),
      data_evento: ficha?.data_evento ?? null,
      local_evento: String(ficha?.local_evento ?? "").trim() || null,
      setores,
    });
  }
  saida.sort((a, b) => (a.criado_em < b.criado_em ? 1 : a.criado_em > b.criado_em ? -1 : 0));
  return saida.map(({ criado_em: _c, ...resto }) => resto);
}

/**
 * A senha ainda e obrigatoria nesta chamada?
 *
 * Decisao de 18/08/2026 ("entrar libera 15 minutos"): quem acabou de entrar na
 * conta ja provou quem e, e a mesma prova vale por 15 minutos para carregar um
 * pedido e para abrir a configuracao de um evento. A elevacao DE CONTA e o
 * bilhete assinado que carrega essa prova; ver `ELEVACAO_DE_CONTA` no
 * `index.ts`.
 *
 * Duas coisas que a regra NAO faz, e sao o motivo de ela caber numa funcao
 * propria em vez de virar um `if` solto no meio de duas rotas:
 *
 *   - senha DIGITADA continua sendo conferida, mesmo com o bilhete valido. Uma
 *     senha errada nao pode passar calada so porque havia uma liberacao aberta:
 *     quem digitou espera que o que digitou tenha sido olhado, e o contrario
 *     esconderia da pessoa que ela esta errando a senha da propria conta;
 *   - ela nao substitui elevacao NENHUMA nas rotas de escrita. O que o bilhete
 *     de conta dispensa e a DIGITACAO da senha nestas duas portas; a escrita
 *     continua exigindo o bilhete do EVENTO, que so sai depois de passar por
 *     aqui.
 */
export function precisaDeSenha(senha: string, temElevacaoDeConta: boolean): boolean {
  if (String(senha ?? "")) return true;
  return !temElevacaoDeConta;
}
