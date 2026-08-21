/**
 * O peso por setor da conferencia de acabamento.
 *
 * ## Por que isto existe do lado do servidor
 *
 * O peso mora em `propostas_os_setores.peso_real_kg`, que e tabela do PARCEIRO
 * e tem RLS: as quatro politicas sao de `authenticated`. Na estacao da grafica o
 * operador entra pelo codigo local, SEM sessao do Supabase -- e ali a chave
 * anonima le a tabela e recebe `[]` com HTTP 200. Vazia, sem erro nenhum.
 *
 * Medido em 21/08/2026 com a chave publica que esta no codigo-fonte de toda
 * pagina. Nao e um caso de borda: o usuario decidiu no mesmo dia que a digitacao
 * do peso e a escolha dos drops seriam feitas justamente pelo acesso local do
 * agente. Sem este caminho, o operador digitaria o peso, veria o campo aceitar,
 * e nada teria sido gravado.
 *
 * A saida e a mesma do catalogo de fontes: a estacao apresenta o
 * `ACESSO_AGENTE_SEGREDO` a `acesso-estacao`, e a escrita acontece aqui com a
 * `service_role`, que nunca vai para as estacoes.
 *
 * ## O que este modulo NAO pode fazer
 *
 * Escrever em tabela do parceiro e excecao a regra de ouro do
 * `docs/REGRAS_BANCO.md`, e ela so continua legitima enquanto for ESTREITA.
 * O que este modulo toca, e nada alem disso:
 *
 *   `propostas_os_setores` -- `peso_real_kg`, `status_producao`,
 *   `status_producao_em` e `updated_at`, mais `id_int`, `setor` e `id_os` ao
 *   criar a linha;
 *   `propostas` -- `status_interno`, e so para o valor `EXPEDICAO`.
 *
 * `prazo`, `hora`, `qtd_volumes`, `tipo_volume` e `responsavel_conferencia` sao
 * do ERP e ficam onde estao. A lista esta repetida no teste de proposito: e la
 * que ela e cobrada.
 *
 * O `status_producao` entrou em 21/08/2026, junto com o botao EXPEDICAO, e o
 * usuario abriu a excecao no mesmo dia. Antes dele a lista de intocaveis
 * incluia essa coluna -- se alguem estranhar o historico, e por isso.
 */
import { banco } from "./banco.ts";
import { Recusa } from "./sessao.ts";

const TABELA = "propostas_os_setores";

/**
 * Os quatro que o banco aceita: `propostas_os_setores_setor_check`.
 *
 * Mandar um quinto volta 23514 do Postgres, e o operador veria "erro interno"
 * onde a verdade e "esse setor nao existe na ficha de expedicao".
 */
export const SETORES = ["FLEXO", "PVC", "TEXTIL", "LASER"];

function setorValido(bruto: unknown): string {
  const s = String(bruto ?? "").trim().toUpperCase();
  if (SETORES.indexOf(s) === -1) {
    throw new Recusa(422, `setor invalido: ${s || "(vazio)"}. Use um de ${SETORES.join(", ")}.`);
  }
  return s;
}

/**
 * O peso, ou nulo para apagar.
 *
 * Virgula e ponto valem o mesmo: a balanca da grafica mostra `4,16` e e isso que
 * o operador digita. Peso negativo nao existe, e texto que nao e numero e recusa
 * -- gravar `NaN` deixaria a ficha de expedicao com um valor que ninguem
 * consegue explicar depois.
 */
function pesoValido(bruto: unknown): number | null {
  if (bruto === null || bruto === undefined) return null;
  const texto = String(bruto).trim().replace(",", ".");
  if (!texto) return null;
  const n = Number(texto);
  if (!isFinite(n) || n < 0) {
    throw new Recusa(422, `peso invalido: ${texto}. Use so numeros, como 4,16.`);
  }
  return Math.round(n * 1000) / 1000;
}

/** As linhas de um pedido, so com o que a tela usa. */
export async function lerPesos(pedidoIdInt: number): Promise<unknown[]> {
  const linhas = (await banco(
    "GET",
    `${TABELA}?id_int=eq.${pedidoIdInt}&select=setor,peso_real_kg,status_producao`,
  )) ?? [];
  return linhas;
}

/**
 * Grava o peso de UM setor.
 *
 * `UPDATE` primeiro, `INSERT` so quando nao ha linha. E o caminho que menos mexe
 * na tabela do parceiro, e e o caso comum: em 21/08/2026, 729 dos 758 pares
 * (pedido, setor) ainda nao tinham linha, porque o ERP as cria na expedicao.
 *
 * `UNIQUE (id_int, setor)` cuida da corrida entre duas estacoes no mesmo pedido:
 * o segundo INSERT volta 23505 e vira atualizacao. As duas estao gravando a
 * mesma coluna, entao a ultima a chegar e a que vale -- que e o que o operador
 * espera de um campo de peso.
 */
export async function gravarPeso(
  pedidoIdInt: number,
  setorBruto: unknown,
  pesoBruto: unknown,
): Promise<{ setor: string; peso_real_kg: number | null; criou: boolean }> {
  const setor = setorValido(setorBruto);
  const peso = pesoValido(pesoBruto);
  const agora = new Date().toISOString();
  const filtro = `${TABELA}?id_int=eq.${pedidoIdInt}&setor=eq.${setor}`;

  const mexidas = (await banco(
    "PATCH",
    filtro,
    { peso_real_kg: peso, updated_at: agora },
    "return=representation",
  )) ?? [];
  if (mexidas.length) return { setor, peso_real_kg: peso, criou: false };

  // Linha nova. `id_os` sai preenchido quando o ERP ja abriu a OS do pedido;
  // sem OS ele fica nulo, como as duas linhas que o proprio ERP ja tem assim.
  const os = (await banco(
    "GET",
    `propostas_os?id_int=eq.${pedidoIdInt}&select=id&limit=1`,
  )) ?? [];
  const linha: Record<string, unknown> = {
    id_int: pedidoIdInt,
    setor,
    peso_real_kg: peso,
    updated_at: agora,
  };
  if (os.length && os[0].id) linha.id_os = os[0].id;

  try {
    await banco("POST", TABELA, linha);
    return { setor, peso_real_kg: peso, criou: true };
  } catch (e) {
    const texto = String(e);
    if (!texto.includes("23505") && !texto.toLowerCase().includes("duplicate key")) throw e;
    // Outra estacao criou a linha entre o PATCH e o POST.
    await banco("PATCH", filtro, { peso_real_kg: peso, updated_at: agora });
    return { setor, peso_real_kg: peso, criou: false };
  }
}

/**
 * O estagio de producao que o setor ganha quando termina, e o que ele volta a
 * ser quando alguem desmarca um modelo.
 *
 * Os dois estao na lista do `propostas_os_setores_status_producao_check`:
 * EM PRODUCAO, EM IMPRESSAO, EM IMPRESSAO / PENDENTE, EM ACABAMENTO,
 * EM ACABAMENTO / PENDENTE, CONCLUIDO.
 */
const CONCLUIDO = "CONCLUIDO";
const DE_VOLTA_A_MESA = "EM ACABAMENTO";

/**
 * Carimba (ou descarimba) o setor de um pedido.
 *
 * Pedido do usuario em 21/08/2026: quando o ULTIMO modelo de um setor vira
 * "Pronto", a linha daquele setor recebe CONCLUIDO -- mesmo que os outros
 * setores ainda estejam trabalhando. Quem decide se o setor terminou e a tela,
 * que conhece os modelos; aqui so se grava.
 *
 * ## Por que o `false` existe, e por que ele e estreito
 *
 * Se o operador marcar "Pronto" por engano e corrigir, deixar o CONCLUIDO de pe
 * faria a ficha do ERP mentir sobre material que voltou para a mesa. Mas
 * `status_producao` e coluna do PARCEIRO, e ele escreve nela pela tela dele.
 *
 * Por isso o descarimbo so acontece quando o valor atual e EXATAMENTE
 * "CONCLUIDO": qualquer outra coisa ali foi o ERP quem pos, e nao se toca. E o
 * valor de volta e "EM ACABAMENTO", que descreve a verdade -- o material esta
 * na mesa de novo -- em vez de apagar o campo.
 */
export async function concluirSetor(
  pedidoIdInt: number,
  setorBruto: unknown,
  concluido: boolean,
): Promise<{ setor: string; status_producao: string | null; mudou: boolean }> {
  const setor = setorValido(setorBruto);
  const filtro = `${TABELA}?id_int=eq.${pedidoIdInt}&setor=eq.${setor}`;

  const atual = ((await banco("GET", `${filtro}&select=status_producao`)) ?? [])[0];
  if (!atual) {
    // Sem linha nao ha o que carimbar. Nao e erro: o peso pode nunca ter sido
    // digitado, e o ERP so cria a linha na expedicao.
    if (!concluido) return { setor, status_producao: null, mudou: false };
    await gravarPeso(pedidoIdInt, setor, null);
    await banco("PATCH", filtro, {
      status_producao: CONCLUIDO,
      status_producao_em: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    return { setor, status_producao: CONCLUIDO, mudou: true };
  }

  const antes = atual.status_producao ?? null;
  if (concluido) {
    if (antes === CONCLUIDO) return { setor, status_producao: antes, mudou: false };
  } else {
    // So desfaz o que foi carimbado aqui.
    if (antes !== CONCLUIDO) return { setor, status_producao: antes, mudou: false };
  }

  const novo = concluido ? CONCLUIDO : DE_VOLTA_A_MESA;
  const agora = new Date().toISOString();
  await banco("PATCH", filtro, {
    status_producao: novo,
    status_producao_em: agora,
    updated_at: agora,
  });
  return { setor, status_producao: novo, mudou: true };
}

/**
 * Manda o pedido para a expedicao.
 *
 * Pedido do usuario em 21/08/2026, com todos os modelos de todos os setores
 * marcados como "Pronto". `EXPEDICAO` e um estado que o ERP ja usa -- havia sete
 * pedidos nele no dia -- e o painel ja escrevia `status_interno` no botao de
 * liberar para producao, entao o caminho nao e novo.
 *
 * Quem confere se o pedido esta pronto e a TELA, que conhece os modelos. Aqui
 * fica a garantia de que o pedido existe: mandar para expedicao um numero que
 * nao e pedido criaria linha nenhuma, mas tambem nao diria nada a quem clicou.
 */
export async function enviarParaExpedicao(
  pedidoIdInt: number,
): Promise<{ id_int: number; status_interno: string }> {
  const linhas = (await banco(
    "PATCH",
    `propostas?id_int=eq.${pedidoIdInt}`,
    { status_interno: "EXPEDICAO" },
    "return=representation",
  )) ?? [];
  if (!linhas.length) {
    throw new Recusa(404, `pedido ${pedidoIdInt} nao encontrado`);
  }
  return { id_int: pedidoIdInt, status_interno: "EXPEDICAO" };
}
