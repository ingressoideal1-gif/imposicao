/**
 * A conta do cliente: quem e de qual cliente, senha provisoria, troca.
 *
 * Tudo o que toca `producao_acesso_contas` mora aqui, para a `acesso-conta`
 * (o cliente) e a `acesso-interno` (a grafica) lerem a MESMA definicao de
 * "conta ligada a cliente".
 */
import { banco } from "./banco.ts";
import { Recusa } from "./sessao.ts";
import { criarUsuario, trocarSenhaDoUsuario, usuarioPorEmail } from "./auth_admin.ts";

// O mesmo alfabeto do codigo de pareamento: sem 0 O 1 I L, que se confundem
// quando ditados por telefone -- e a senha provisoria e ditada por telefone.
export const ALFABETO_SENHA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const TAMANHO_SENHA = 8;

export function senhaProvisoria(): string {
  const bytes = new Uint8Array(TAMANHO_SENHA * 4);
  crypto.getRandomValues(bytes);
  let saida = "";
  let i = 0;
  while (saida.length < TAMANHO_SENHA) {
    const b = bytes[i++ % bytes.length];
    // Rejeicao do resto, como no sortearCodigo: sem vies para o comeco do alfabeto.
    if (b < 248) saida += ALFABETO_SENHA[b % ALFABETO_SENHA.length];
  }
  return saida;
}

const PARECE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function emailLimpo(valor: unknown): string {
  const e = String(valor ?? "").trim().toLowerCase();
  if (!PARECE_EMAIL.test(e)) throw new Recusa(422, "escreva um e-mail valido");
  return e;
}

export async function clientesDaConta(userId: string): Promise<number[]> {
  const linhas = (await banco(
    "GET",
    `producao_acesso_contas?auth_user_id=eq.${userId}&ativo=eq.true&select=id_cliente`,
  )) ?? [];
  // Variavel tipada em vez de encadear direto no spread: sem isso o `tsc` do
  // Deno (2.9.5) infere o `Set` como `Set<unknown>` aqui -- o contexto do
  // retorno `number[]` nao alcanca o `T` do `Set` quando o array de entrada
  // vem de `any`. Mesmo comportamento em runtime, so para o type-checker.
  const ids: number[] = linhas.map((l: any) => Number(l.id_cliente)).filter(Boolean);
  return [...new Set(ids)];
}

export async function contaPrecisaTrocarSenha(userId: string): Promise<boolean> {
  const linhas = (await banco(
    "GET",
    `producao_acesso_contas?auth_user_id=eq.${userId}&ativo=eq.true` +
      "&select=senha_provisoria_em",
  )) ?? [];
  return linhas.some((l: any) => Boolean(l.senha_provisoria_em));
}

export async function marcarSenhaTrocada(userId: string): Promise<void> {
  await banco(
    "PATCH",
    `producao_acesso_contas?auth_user_id=eq.${userId}`,
    { senha_provisoria_em: null },
    "return=minimal",
  );
}

export async function contasDoCliente(idCliente: number): Promise<any[]> {
  const linhas = (await banco(
    "GET",
    `producao_acesso_contas?id_cliente=eq.${idCliente}&ativo=eq.true` +
      "&select=auth_user_id,email,criada_aqui,senha_provisoria_em,criado_em&order=criado_em.asc",
  )) ?? [];
  return linhas.map((l: any) => ({
    auth_user_id: l.auth_user_id,
    email: l.email,
    criada_aqui: Boolean(l.criada_aqui),
    senha_provisoria: Boolean(l.senha_provisoria_em),
    criado_em: l.criado_em,
  }));
}

/**
 * Libera o acesso de um cliente para um e-mail.
 *
 * E-mail que JA tem conta: so liga, sem mexer na senha -- nunca redefinimos a
 * senha de uma conta que nao criamos. E-mail novo: cria com senha provisoria,
 * que sai UMA vez na resposta e nao e guardada em claro em lugar nenhum.
 */
export async function liberarAcesso(
  idCliente: number,
  email: string,
  criadoPor: string,
): Promise<{ email: string; ja_tinha_conta: boolean; senha_provisoria: string | null }> {
  const e = emailLimpo(email);
  const existente = await usuarioPorEmail(e);
  if (existente) {
    await banco("POST", "producao_acesso_contas?on_conflict=auth_user_id,id_cliente", {
      auth_user_id: existente,
      id_cliente: idCliente,
      email: e,
      criada_aqui: false,
      senha_provisoria_em: null,
      criado_por: criadoPor,
      ativo: true,
    }, "resolution=merge-duplicates,return=minimal");
    return { email: e, ja_tinha_conta: true, senha_provisoria: null };
  }
  const senha = senhaProvisoria();
  const criado = await criarUsuario(e, senha, { origem: "ideal-control", id_cliente: idCliente });
  await banco("POST", "producao_acesso_contas", {
    auth_user_id: criado.id,
    id_cliente: idCliente,
    email: e,
    criada_aqui: true,
    senha_provisoria_em: new Date().toISOString(),
    criado_por: criadoPor,
    ativo: true,
  }, "return=minimal");
  return { email: e, ja_tinha_conta: false, senha_provisoria: senha };
}

/** So para conta que a grafica criou. A anterior deixa de valer no mesmo ato. */
export async function novaSenhaProvisoria(authUserId: string): Promise<{ senha_provisoria: string }> {
  const linhas = (await banco(
    "GET",
    `producao_acesso_contas?auth_user_id=eq.${authUserId}&criada_aqui=eq.true&select=auth_user_id`,
  )) ?? [];
  if (!linhas.length) {
    throw new Recusa(403, "esta conta nao foi criada pela grafica; a senha dela se recupera no Vibe");
  }
  const senha = senhaProvisoria();
  await trocarSenhaDoUsuario(authUserId, senha);
  await banco(
    "PATCH",
    `producao_acesso_contas?auth_user_id=eq.${authUserId}`,
    { senha_provisoria_em: new Date().toISOString() },
    "return=minimal",
  );
  return { senha_provisoria: senha };
}
