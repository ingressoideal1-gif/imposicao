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
