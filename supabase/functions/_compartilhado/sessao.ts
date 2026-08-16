/**
 * Quem esta falando: identidade e papel.
 *
 * Porte de `_usuario_logado` (`acesso_api.py:479`) e `_quem_configura`
 * (`acesso_interno.py:87`).
 *
 * ## O ganho que so aparece aqui, e nao apareceu na portaria
 *
 * No Render, `_usuario_logado` faz uma requisicao HTTP para o `/auth/v1/user`
 * do Supabase A CADA CHAMADA, so para saber quem esta falando. Numa Edge
 * Function isso desaparece duas vezes:
 *
 * 1. O portao do Supabase confere a assinatura do JWT ANTES de invocar a
 *    funcao, quando `verify_jwt = true` no `config.toml`. Chegar aqui ja e
 *    prova de que o token e valido e nao venceu.
 * 2. O `sub` sai das claims decodificando o proprio token -- zero rede.
 *
 * Some-se a travessia que a Fase 2a ja tirou (navegador -> Render -> Supabase
 * virou navegador -> Supabase) e a tela do dono deixa de pagar duas idas a rede
 * por requisicao.
 *
 * ## O que este modulo NAO faz, de proposito
 *
 * Nao confere assinatura de JWT. Se um dia alguem montar uma funcao com
 * `verify_jwt = false` e chamar `usuarioDoJwt`, o `sub` vira dado de entrada do
 * atacante. A guarda esta no `config.toml`, e o comentario aqui e para que
 * ninguem a remova por engano achando que este arquivo cobre.
 */
import { banco } from "./banco.ts";

/** Os papeis que podem configurar o Ideal Control da grafica. */
export const PAPEIS_QUE_CONFIGURAM = ["adm", "atendimento"];

export class Recusa extends Error {
  constructor(public status: number, public detail: string) {
    super(detail);
  }
}

function base64UrlParaTexto(parte: string): string {
  const base64 = parte.replace(/-/g, "+").replace(/_/g, "/");
  // O JWT omite o preenchimento; `atob` exige comprimento multiplo de 4.
  const cheio = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const bytes = Uint8Array.from(atob(cheio), (c) => c.charCodeAt(0));
  // O `atob` sozinho devolveria latin-1, e email com acento sairia trocado.
  return new TextDecoder().decode(bytes);
}

/**
 * O usuario dono do JWT: `{ id, email }`.
 *
 * Lanca `Recusa` 401 quando nao ha cabecalho -- que e o unico caso que sobra,
 * ja que token invalido ou vencido nunca chega ate aqui.
 */
export function usuarioDoJwt(cabecalho: string | null): { id: string; email: string } {
  const valor = (cabecalho ?? "").trim();
  if (!valor.toLowerCase().startsWith("bearer ")) {
    throw new Recusa(401, "faca login para continuar");
  }
  const partes = valor.slice(7).trim().split(".");
  if (partes.length !== 3) throw new Recusa(401, "sessao invalida; entre de novo");

  let claims: any;
  try {
    claims = JSON.parse(base64UrlParaTexto(partes[1]));
  } catch {
    throw new Recusa(401, "sessao invalida; entre de novo");
  }
  if (!claims?.sub) throw new Recusa(401, "sessao invalida; entre de novo");
  return { id: String(claims.sub), email: String(claims.email ?? "") };
}

/**
 * Quem pode configurar o Ideal Control da grafica.
 *
 * A MESMA resposta para "nao tem linha" e para "tem papel que nao configura":
 * as duas sao "voce nao pode", e distinguir contaria a quem tentou em que ponto
 * ele parou.
 */
export async function quemConfigura(
  cabecalho: string | null,
): Promise<{ id: string; email: string; papel: string }> {
  const usuario = usuarioDoJwt(cabecalho);
  const linhas = (await banco(
    "GET",
    `imposition_user_permissions?user_id=eq.${usuario.id}&select=user_id,role`,
  )) ?? [];

  const papel = String(linhas[0]?.role ?? "").trim().toLowerCase();
  if (!PAPEIS_QUE_CONFIGURAM.includes(papel)) {
    throw new Recusa(
      403,
      "o Ideal Control da grafica e para ADM e Atendimento; " +
        "peca a permissao ao administrador",
    );
  }
  return { id: usuario.id, email: usuario.email, papel };
}
