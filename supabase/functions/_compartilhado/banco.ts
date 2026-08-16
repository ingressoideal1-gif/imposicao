/**
 * PostgREST com a chave de servico -- o equivalente do `supabase()` do
 * `acesso_api.py`. Nao usar fora do controle de acesso.
 *
 * ## De onde vem a chave
 *
 * `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` sao injetados pelo proprio
 * Supabase em toda Edge Function. Nao ha segredo a configurar para esta funcao,
 * e e proposital que nao haja: quanto menos lugar guardando a chave-mestra,
 * menos lugar de onde ela pode vazar.
 *
 * ## Uma armadilha herdada do Python, que vale para quem escrever consultas aqui
 *
 * O caminho e concatenado na URL sem escape nenhum, igual ao Python. Entao
 * qualquer valor que va num filtro precisa ser seguro em query string. O caso
 * que ja mordeu: `Date.prototype.toISOString()` termina em `Z` e esta certo,
 * mas o `isoformat()` do Python termina em `+00:00`, e o `+` de uma query
 * string significa ESPACO -- o filtro chega quebrado e o PostgREST recusa com
 * 400. Se um dia alguem passar uma data por aqui, que termine em `Z`.
 */
/**
 * Lidas SOB DEMANDA, e nao no carregamento do modulo.
 *
 * Ler no topo parece mais simples e custa caro: o modulo passa a ser
 * impossivel de importar em qualquer contexto que nao tenha as duas variaveis
 * -- inclusive num `deno test` das pecas puras da funcao, que nao chega perto
 * do banco. O teste morria antes de comecar, com um erro que nao tinha nada a
 * ver com o que ele testava.
 *
 * E se faltar de verdade, o erro daqui diz o nome da variavel, em vez do
 * `undefined` silencioso que o `!` do TypeScript deixaria passar.
 */
function precisa(nome: string): string {
  const v = Deno.env.get(nome);
  if (!v) {
    throw new Error(
      `${nome} nao esta no ambiente. O Supabase injeta esta variavel em toda ` +
        `Edge Function -- se ela falta, a funcao nao esta rodando onde deveria.`,
    );
  }
  return v;
}

export async function banco(
  metodo: string,
  caminho: string,
  corpo?: unknown,
  prefer?: string,
): Promise<any> {
  const urlBase = precisa("SUPABASE_URL");
  const chave = precisa("SUPABASE_SERVICE_ROLE_KEY");

  const cabecalhos: Record<string, string> = {
    apikey: chave,
    Authorization: `Bearer ${chave}`,
    "Content-Type": "application/json",
  };
  if (prefer) {
    cabecalhos["Prefer"] = prefer;
  } else if (metodo === "POST" || metodo === "PATCH") {
    cabecalhos["Prefer"] = "return=representation";
  }

  const r = await fetch(`${urlBase}/rest/v1/${caminho}`, {
    method: metodo,
    headers: cabecalhos,
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });

  if (!r.ok) {
    // O corpo do erro do PostgREST diz a causa (coluna que nao existe, tipo
    // errado, filtro malformado). Perde-lo aqui transforma toda falha de
    // consulta no mesmo "erro interno" e torna a investigacao cega.
    throw new Error(
      `PostgREST ${r.status} em ${metodo} ${caminho}: ${(await r.text()).slice(0, 300)}`,
    );
  }

  // `return=minimal` responde 204 sem corpo, e `JSON.parse("")` levanta.
  const texto = await r.text();
  return texto ? JSON.parse(texto) : null;
}

/**
 * Quantas linhas casam com o filtro, SEM trazer as linhas.
 *
 * Porte de `contar()` (`acesso_api.py:118`). Existe porque a tela precisa
 * comparar o que o ERP encomendou com o que esta publicado, e um evento de
 * 12.000 ingressos traria 12.000 objetos para chegar a um numero.
 *
 * O PostgREST devolve a contagem no cabecalho `Content-Range` quando se pede
 * `Prefer: count=exact`. E a contagem e EXATA em qualquer tamanho -- ao
 * contrario de contar o tamanho de uma lista, que o teto de 1.000 linhas
 * limitaria em silencio.
 */
export async function contar(caminho: string): Promise<number> {
  const urlBase = precisa("SUPABASE_URL");
  const chave = precisa("SUPABASE_SERVICE_ROLE_KEY");

  const juncao = caminho.includes("?") ? "&" : "?";
  const r = await fetch(`${urlBase}/rest/v1/${caminho}${juncao}select=id&limit=1`, {
    headers: {
      apikey: chave,
      Authorization: `Bearer ${chave}`,
      Prefer: "count=exact",
      // `Range` de uma linha so: sem ele o PostgREST traz a primeira pagina
      // inteira para descobrir um numero que ja vem no cabecalho.
      Range: "0-0",
    },
  });
  if (!r.ok) {
    throw new Error(
      `PostgREST ${r.status} ao contar ${caminho}: ${(await r.text()).slice(0, 300)}`,
    );
  }
  // "0-0/2000" -- o que interessa e o que vem depois da barra. "*/0" quando
  // nao ha linha nenhuma.
  const total = (r.headers.get("content-range") ?? "").split("/")[1];
  return total && total !== "*" ? Number(total) : 0;
}
