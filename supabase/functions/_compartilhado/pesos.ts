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
 * Escrever em `propostas_os_setores` e a UNICA excecao a regra de ouro do
 * `docs/REGRAS_BANCO.md` -- nao alterar tabela do parceiro --, e ela so continua
 * legitima enquanto for ESTREITA. Este modulo toca `peso_real_kg` e
 * `updated_at`, mais `id_int`, `setor` e `id_os` ao criar a linha. E nada mais.
 *
 * `prazo`, `hora`, `status_producao`, `status_producao_em`, `qtd_volumes`,
 * `tipo_volume` e `responsavel_conferencia` sao do ERP e ficam onde estao. A
 * lista esta repetida no teste de proposito: e la que ela e cobrada.
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
    `${TABELA}?id_int=eq.${pedidoIdInt}&select=setor,peso_real_kg`,
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
