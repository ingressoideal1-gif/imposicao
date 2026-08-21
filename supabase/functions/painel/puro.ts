/**
 * As pecas do `painel` que nao tocam rede nem banco.
 *
 * Separadas para poderem ser testadas com `deno test` sem Supabase nenhum por
 * perto -- mesma divisao de `acesso-interno/puro.ts` e `acesso-estacao/puro.ts`.
 */
import { Recusa } from "../_compartilhado/sessao.ts";

/** O caminho depois do nome da funcao, em pedacos. */
export function pedacosDaRota(pathname: string): string[] {
  const p = pathname.split("/").filter(Boolean);
  const i = p.indexOf("painel");
  const resto = i >= 0 ? p.slice(i + 1) : p;
  // O `api/` opcional deixa o mesmo caminho do Render funcionar aqui, o que
  // torna o corte no frontend uma troca de base e nada mais.
  return resto[0] === "api" ? resto.slice(1) : resto;
}

// ─── Codigo de acesso local ──────────────────────────────────────────────────
//
// Porte de `normalizar_codigo_acesso` e `validar_codigo_acesso` (`db.py:1650`).

export const ALFABETO_CODIGO = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
export const TAMANHO_CODIGO = 6;

/** Maiusculas e sem espaco algum -- quem digita nao precisa acertar a forma. */
export function normalizarCodigo(codigo: unknown): string {
  return String(codigo ?? "").split(/\s+/).join("").toUpperCase();
}

/**
 * Confere o codigo escolhido pelo administrador e devolve a forma gravavel.
 *
 * Recebe os codigos ja em uso em vez de consultar o banco: a mensagem "esse
 * codigo ja e de outro operador" e muito mais util do que o erro de chave unica
 * que o Postgres devolveria.
 *
 * O 400 (e nao 422) reproduz o `salvar_acesso_local_endpoint` do `app.py`, que
 * transforma `CodigoInvalido` em 400 justamente para a tela poder mostrar o
 * motivo a quem digitou.
 */
export function validarCodigo(codigo: unknown, existentes: unknown[] = []): string {
  const limpo = normalizarCodigo(codigo);
  if (limpo.length !== TAMANHO_CODIGO) {
    throw new Recusa(400, `O codigo precisa ter exatamente ${TAMANHO_CODIGO} caracteres.`);
  }
  for (const c of limpo) {
    if (!ALFABETO_CODIGO.includes(c)) {
      throw new Recusa(400, "O codigo aceita apenas letras e numeros.");
    }
  }
  const usados = new Set(
    existentes.filter(Boolean).map((c) => normalizarCodigo(c)),
  );
  if (usados.has(limpo)) {
    throw new Recusa(400, "Esse codigo ja esta em uso por outro operador.");
  }
  return limpo;
}

// ─── Item de ordem de servico ────────────────────────────────────────────────

/** As unicas colunas que o painel pode mudar num item de OS (`db.py:1011`). */
export const COLUNAS_DO_ITEM = ["impressao", "formato_id", "cor_id", "numeracao_id"];

export function limparItemOs(data: unknown): Record<string, unknown> {
  const entrada = (data ?? {}) as Record<string, unknown>;
  const limpo: Record<string, unknown> = {};
  for (const chave of COLUNAS_DO_ITEM) {
    if (chave in entrada) limpo[chave] = entrada[chave];
  }
  return limpo;
}

// ─── Quem pode mexer na tela de Usuarios ─────────────────────────────────────
//
// A pergunta e `perm_admin_view`/`perm_admin_edit`, e NAO `role === "admin"`.
//
// O painel monta o menu por essas colunas: o modulo `admin` (rotulo "Usuarios")
// e uma linha da grade como qualquer outra, e o usuario da grafica edita essa
// grade ao vivo. Olhar o `role` aqui recusaria alguem a quem ele deu o modulo de
// proposito, e a tela mostraria o botao que o servidor recusa -- o pior dos dois
// mundos. A grade e a origem da verdade; o papel e so o rotulo do seletor.

export function podeVerUsuarios(permissoes: unknown): boolean {
  const p = (permissoes ?? {}) as Record<string, unknown>;
  return p.perm_admin_view === true || p.perm_admin_edit === true;
}

export function podeEditarUsuarios(permissoes: unknown): boolean {
  const p = (permissoes ?? {}) as Record<string, unknown>;
  return p.perm_admin_edit === true;
}
