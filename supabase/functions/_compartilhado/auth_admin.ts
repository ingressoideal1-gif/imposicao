/**
 * A admin API do GoTrue, com a service_role que a Edge Function ja tem.
 *
 * Achar uma conta pelo e-mail ou pelo id, criar uma conta com senha, trocar a
 * senha de uma conta, apagar uma conta. Nada aqui devolve token nem hash.
 *
 * `usuarioPorEmail` passa pelo banco (a funcao SQL `acesso_usuario_por_email`,
 * SECURITY DEFINER, so da service_role) porque `auth.users` nao esta exposta
 * ao PostgREST e a admin API nao filtra por e-mail -- listar todos os usuarios
 * para achar um seria pagina por pagina, e um dia sao milhares.
 *
 * `obterUsuario` e `apagarUsuario` existem para `contas.ts` conseguir desfazer
 * uma conta que criou aqui e, no caso de sobrar orfa (ligacao no banco falhou
 * depois da conta criada), reconhece-la de volta pelo `user_metadata`.
 */
import { banco } from "./banco.ts";
import { Recusa } from "./sessao.ts";

function ambiente(): { url: string; chave: string } {
  const url = Deno.env.get("SUPABASE_URL");
  const chave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !chave) {
    throw new Recusa(503, "SUPABASE_SERVICE_ROLE_KEY nao esta no ambiente");
  }
  return { url, chave };
}

/**
 * `corpo` e opcional -- DELETE e GET nao mandam corpo, e `JSON.stringify(undefined)`
 * viraria a string `"undefined"`, que nao e JSON valido.
 *
 * `aceita404`: so `obterUsuario` usa, para devolver `null` em vez de lancar
 * quando a conta nao existe mais.
 */
async function admin(
  metodo: string,
  caminho: string,
  corpo?: unknown,
  aceita404 = false,
): Promise<any> {
  const { url, chave } = ambiente();
  const r = await fetch(`${url}/auth/v1/admin/${caminho}`, {
    method: metodo,
    headers: {
      apikey: chave,
      Authorization: `Bearer ${chave}`,
      "Content-Type": "application/json",
    },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  if (aceita404 && r.status === 404) return null;
  const texto = await r.text();
  if (!r.ok) {
    // O GoTrue responde `{msg}` ou `{error_description}`; nenhum dos dois
    // carrega segredo. Cortado, para nao virar um erro de tela quilometrico.
    throw new Recusa(502, `o servico de contas recusou (${r.status}): ${texto.slice(0, 200)}`);
  }
  return texto ? JSON.parse(texto) : null;
}

export async function usuarioPorEmail(email: string): Promise<string | null> {
  const r = await banco("POST", "rpc/acesso_usuario_por_email", { p_email: email });
  return r ? String(r) : null;
}

export async function criarUsuario(
  email: string,
  senha: string,
  metadata: Record<string, unknown>,
): Promise<{ id: string }> {
  const u = await admin("POST", "users", {
    email,
    password: senha,
    // Confirmado na criacao: nao ha e-mail de confirmacao neste projeto (sem
    // SMTP), e a conta e criada pela grafica, que conhece o cliente.
    email_confirm: true,
    user_metadata: metadata,
  });
  if (!u?.id) throw new Recusa(502, "o servico de contas nao devolveu a conta criada");
  return { id: String(u.id) };
}

export async function trocarSenhaDoUsuario(id: string, senha: string): Promise<void> {
  await admin("PUT", `users/${encodeURIComponent(id)}`, { password: senha });
}

/** A conta pelo id, ou `null` se ja nao existe mais. So o que `contas.ts` precisa. */
export async function obterUsuario(
  id: string,
): Promise<{ id: string; user_metadata: Record<string, unknown> } | null> {
  const u = await admin("GET", `users/${encodeURIComponent(id)}`, undefined, true);
  if (!u?.id) return null;
  return { id: String(u.id), user_metadata: u.user_metadata ?? {} };
}

/**
 * Desfaz uma conta criada aqui. So chamado quando a ligacao dela em
 * `producao_acesso_contas` falhou depois de criar -- ver `liberarAcesso`.
 */
export async function apagarUsuario(id: string): Promise<void> {
  await admin("DELETE", `users/${encodeURIComponent(id)}`);
}
