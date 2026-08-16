/**
 * Quais modelos do ERP a portaria TEM COMO LER.
 *
 * Porte de `acesso_publicacao.numeracao_do_modelo`. Mora no compartilhado
 * porque as DUAS telas precisam: a interna marca quais modelos sobem, e a do
 * cliente usa a mesma regra para decidir quais viram setor ao reivindicar um
 * pedido.
 *
 * Duas definicoes de "tem codigo" divergiriam no dia em que uma delas mudasse,
 * e o sintoma seria uma ponta esperando o que a outra nunca manda. E a mesma
 * razao pela qual o Python importa `acesso_publicacao` dos dois lugares em vez
 * de repetir a regra.
 *
 * Nao e otimizacao: e o que impede o sistema de mentir. Sem o filtro, um modelo
 * so de texto vira um setor com cinquenta lugares que nunca serao preenchidos, e
 * o pedido se declara eternamente incompleto -- mandando reimprimir papel que
 * esta do jeito que foi contratado. Regra do usuario, 15/08/2026, sobre o modelo
 * 1000283 do pedido 20508.
 */

/**
 * Ordem de preferencia: o seguro primeiro. QR e BARCODE imprimem o mesmo texto,
 * entao entre os dois a escolha e indiferente -- mas a ordem tem de ser FIXA
 * para o resultado nao depender da ordem em que os elementos foram salvos.
 */
const TIPOS_DE_CODIGO = ["QR_IDEAL", "QR", "BARCODE"];

/**
 * O elemento que a portaria vai ler, ou `null` se nao houver.
 *
 * Porte de `acesso_publicacao.numeracao_do_modelo`. Aqui ele serve so para
 * dizer se o modelo SOBE ao controle -- a tela precisa mostrar o modelo que
 * NAO sobe tanto quanto os que sobem, senao o atendente conta os setores,
 * acha que falta um, e abre chamado sobre um ingresso que simplesmente nao tem
 * codigo impresso.
 *
 * Recusa o elemento alimentado por coluna do CSV (`source: "database"`): ali o
 * conteudo vem da linha, e nao do numero do item. E recusa o de valor fixo, que
 * e o mesmo em todos os ingressos e nao identifica nada.
 */
export function numeracaoDoModelo(elements: unknown): Record<string, unknown> | null {
  const porTipo: Record<string, Record<string, unknown>> = {};
  for (const el of (elements as any[]) ?? []) {
    if (!el || typeof el !== "object" || Array.isArray(el)) continue;
    const t = el.type;
    if (!TIPOS_DE_CODIGO.includes(t) || t in porTipo) continue;
    if (el.source === "database") continue;
    if (el.fixed) continue;
    porTipo[t] = {
      tipo: t,
      prefix: String(el.prefix ?? ""),
      pad: Number(el.pad ?? 0) || 0,
      suffix: String(el.suffix ?? ""),
    };
  }
  for (const t of TIPOS_DE_CODIGO) {
    if (t in porTipo) return porTipo[t];
  }
  return null;
}

