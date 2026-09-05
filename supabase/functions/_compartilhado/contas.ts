/**
 * A conta do cliente: quem e de qual cliente, senha provisoria, troca.
 *
 * Tudo o que toca `producao_acesso_contas` mora aqui, para a `acesso-conta`
 * (o cliente) e a `acesso-interno` (a grafica) lerem a MESMA definicao de
 * "conta ligada a cliente".
 */
import { banco } from "./banco.ts";
import { Recusa } from "./sessao.ts";
import {
  apagarUsuario,
  criarUsuario,
  obterUsuario,
  trocarSenhaDoUsuario,
  usuarioPorEmail,
} from "./auth_admin.ts";

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

/**
 * O que "liberar o acesso" devolve.
 *
 * `criada_aqui` existe para a TELA saber o que dizer quando `ja_tinha_conta`
 * vem verdadeiro: conta que a grafica criou pede "toque em Nova senha
 * provisoria"; conta que ja era do cliente no Vibe pede "ele entra com a senha
 * que ja usa". Sem esse campo as duas situacoes davam a mesma frase -- e a
 * segunda frase, na primeira situacao, manda o atendente procurar uma senha
 * que nao existe.
 */
export interface Liberacao {
  email: string;
  ja_tinha_conta: boolean;
  criada_aqui: boolean;
  senha_provisoria: string | null;
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
 *
 * As duas idas (criar a conta no GoTrue, gravar a ligacao no banco) nao sao
 * atomicas -- sao dois servicos diferentes. Se a segunda falhar (rede,
 * PostgREST fora do ar), o codigo abaixo desfaz a conta criada, para o e-mail
 * voltar a poder tentar do zero. E se a propria desfeita falhar, a conta fica
 * orfa -- e e por isso que `ligarContaExistente`, logo abaixo, sabe reconhece-la
 * pelo `user_metadata` e completar a ligacao que faltou, em vez de tratar como
 * conta de outra origem para sempre.
 */
export async function liberarAcesso(
  idCliente: number,
  email: string,
  criadoPor: string,
): Promise<Liberacao> {
  const e = emailLimpo(email);
  const existente = await usuarioPorEmail(e);
  if (existente) return await ligarContaExistente(existente, idCliente, e, criadoPor);

  const senha = senhaProvisoria();
  const criado = await criarUsuario(e, senha, { origem: "ideal-control", id_cliente: idCliente });
  try {
    await banco("POST", "producao_acesso_contas", {
      auth_user_id: criado.id,
      id_cliente: idCliente,
      email: e,
      criada_aqui: true,
      senha_provisoria_em: new Date().toISOString(),
      criado_por: criadoPor,
      ativo: true,
    }, "return=minimal");
  } catch (erro) {
    // Sem desfazer, esta conta ficaria orfa: a proxima tentativa com o mesmo
    // e-mail cairia em `ligarContaExistente`. De la ela volta inteira (o
    // `user_metadata` a reconhece), mas desfazer aqui e mais barato e deixa o
    // e-mail livre para tentar do zero.
    try {
      await apagarUsuario(criado.id);
    } catch {
      // Se nem a desfeita for possivel, a conta fica orfa mesmo -- mas
      // `ligarContaExistente` cobre esse caso na proxima tentativa.
    }
    throw erro;
  }
  return { email: e, ja_tinha_conta: false, criada_aqui: true, senha_provisoria: senha };
}

/**
 * O e-mail ja tem conta no GoTrue. Liga-la a este cliente -- sem rebaixar o
 * que ja existe.
 *
 * ## O defeito que esta funcao existe para nao repetir (04/09/2026)
 *
 * A versao anterior gravava sempre `criada_aqui: false` e
 * `senha_provisoria_em: null`, com `merge-duplicates`. Tocar em "Liberar
 * acesso" uma SEGUNDA vez no mesmo e-mail -- o que o atendente faz quando nao
 * viu a senha da primeira -- reescrevia a ligacao que a propria grafica tinha
 * acabado de criar, e a conta passava a se dizer "conta do Vibe".
 *
 * O estrago nao aparecia na hora: aparecia depois, quando o botao "Nova senha
 * provisoria" sumia da tela (ele so existe para `criada_aqui`) e o servidor
 * passava a recusar com 403 "a senha dela se recupera no Vibe". Resultado: uma
 * conta criada por nos, cuja senha ninguem chegou a ver, e que ninguem mais
 * conseguia redefinir. Aconteceu com dois clientes no mesmo dia.
 *
 * Duas regras saem disso:
 *
 * 1. **Ligacao que ja existe nao se reescreve.** So `email` e `ativo` -- nunca
 *    `criada_aqui`, nunca `senha_provisoria_em`.
 * 2. **`criada_aqui` sai da ORIGEM da conta**, e nao do caminho por onde a tela
 *    chegou aqui. Quem sabe se a conta e nossa e o `user_metadata.origem` que
 *    `criarUsuario` gravou -- o mesmo sinal que `recuperarOrfaSeForNossa` usa.
 */
async function ligarContaExistente(
  authUserId: string,
  idCliente: number,
  email: string,
  criadoPor: string,
): Promise<Liberacao> {
  const ligacoes = (await banco(
    "GET",
    `producao_acesso_contas?auth_user_id=eq.${authUserId}&select=id_cliente,criada_aqui`,
  )) ?? [];

  const desteCliente = ligacoes.find(
    (l: any) => Number(l.id_cliente) === Number(idCliente),
  );
  if (desteCliente) {
    // `ativo: true` porque a ligacao pode ter sido desligada antes, e liberar
    // de novo e justamente o pedido de religa-la. O e-mail vai junto so para
    // acompanhar uma troca de caixa no GoTrue.
    await banco(
      "PATCH",
      `producao_acesso_contas?auth_user_id=eq.${authUserId}&id_cliente=eq.${idCliente}`,
      { email, ativo: true },
      "return=minimal",
    );
    return {
      email,
      ja_tinha_conta: true,
      criada_aqui: Boolean(desteCliente.criada_aqui),
      senha_provisoria: null,
    };
  }

  const usuario = await obterUsuario(authUserId);
  const nossa = usuario?.user_metadata?.origem === "ideal-control";

  // Sem ligacao NENHUMA e nossa: e a orfa de uma tentativa que caiu no meio.
  // Ela ganha senha nova, porque a anterior se perdeu junto com a tentativa.
  if (!ligacoes.length && nossa) {
    const senha = senhaProvisoria();
    await trocarSenhaDoUsuario(authUserId, senha);
    await banco("POST", "producao_acesso_contas", {
      auth_user_id: authUserId,
      id_cliente: idCliente,
      email,
      criada_aqui: true,
      senha_provisoria_em: new Date().toISOString(),
      criado_por: criadoPor,
      ativo: true,
    }, "return=minimal");
    return { email, ja_tinha_conta: false, criada_aqui: true, senha_provisoria: senha };
  }

  await banco("POST", "producao_acesso_contas", {
    auth_user_id: authUserId,
    id_cliente: idCliente,
    email,
    criada_aqui: nossa,
    senha_provisoria_em: null,
    criado_por: criadoPor,
    ativo: true,
  }, "return=minimal");
  return { email, ja_tinha_conta: true, criada_aqui: nossa, senha_provisoria: null };
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
