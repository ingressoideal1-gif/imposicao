/**
 * O catalogo de fontes compartilhado -- a escrita, que e o que precisa de dono.
 *
 * ## Por que existe compartilhado entre duas funcoes
 *
 * Quem cadastra fonte sao DOIS: o navegador do painel (pela `painel`, com
 * sessao) e o `NewProd.exe` da estacao (pela `acesso-estacao`, com o segredo do
 * agente). As duas gravam na MESMA tabela e precisam tratar duplicata do MESMO
 * jeito -- duas copias divergiriam no dia em que uma fosse ajustada, e o
 * sintoma seria uma fonte que some quando cadastrada de um lado e fica quando
 * cadastrada do outro.
 *
 * ## Por que a escrita saiu da chave publica
 *
 * Ate 16/08/2026, `catalogo_fontes` aceitava INSERT, UPDATE e DELETE da chave
 * anonima -- a que esta no codigo-fonte de toda pagina. Medido naquele dia:
 * `PATCH` numa linha de verdade voltou a linha alterada. Qualquer pessoa
 * apagava o catalogo inteiro.
 *
 * Nao vaza segredo; estraga producao, e estraga para TODO MUNDO: o catalogo e
 * compartilhado por decisao de 15/08/2026, entao ele desenha a pagina do
 * cliente, o Criador de Arte e as onze estacoes.
 *
 * A LEITURA continua publica de proposito. `cliente.html` e a tela de quem
 * comprou, sem login nenhum, e ela precisa das fontes para desenhar a arte.
 * Nomes de fonte e URLs de Storage nao sao segredo.
 */
import { banco } from "./banco.ts";
import { Recusa } from "./sessao.ts";

const TABELA = "catalogo_fontes";

/** A fonte com este nome, se ja houver. */
async function porNome(nome: string): Promise<unknown | null> {
  const limpo = (nome ?? "").trim();
  if (!limpo) return null;
  const linhas = (await banco(
    "GET",
    `${TABELA}?nome=eq.${encodeURIComponent(limpo)}&select=*&limit=1`,
  )) ?? [];
  return linhas[0] ?? null;
}

/**
 * Grava uma fonte no catalogo. Porte de `db.save_catalogo_fonte`.
 *
 * Nome duplicado NAO vira erro: fica a que ja estava, e ela e devolvida. E
 * regra de negocio, e nao conveniencia -- trocar o binario de uma fonte ja
 * usada em arte aprovada mudaria, sem aviso, o desenho de material que o
 * cliente aprovou. O indice unico da tabela e a garantia de verdade para o caso
 * de duas estacoes subirem a mesma fonte no mesmo instante.
 */
export async function salvarFonte(dados: unknown): Promise<unknown> {
  const registro = { ...((dados ?? {}) as Record<string, unknown>) };
  const nome = String(registro.nome ?? "").trim();
  if (!nome) throw new Recusa(400, "a fonte precisa de nome");
  if (!registro.id) registro.id = crypto.randomUUID();

  try {
    const linhas = await banco("POST", TABELA, registro, "return=representation");
    if (linhas && linhas.length) return linhas[0];
  } catch (e) {
    const texto = String(e);
    // 23505 e a violacao de chave unica do Postgres.
    if (!texto.includes("23505") && !texto.toLowerCase().includes("duplicate key")) {
      throw e;
    }
  }

  const existente = await porNome(nome);
  if (existente) return existente;
  throw new Recusa(503, "nao consegui gravar a fonte no catalogo");
}

/**
 * Remove uma fonte do catalogo. Porte de `db.delete_catalogo_fonte`.
 *
 * O binario no Storage continua onde esta, de proposito: apaga-lo quebraria
 * qualquer arte antiga que ainda aponte para aquela URL, e guardar o arquivo e
 * barato.
 */
export async function excluirFonte(id: string): Promise<void> {
  await banco("DELETE", `${TABELA}?id=eq.${encodeURIComponent(id)}`);
}
