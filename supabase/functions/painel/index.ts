/**
 * As rotas do painel da grafica que so a nuvem atende.
 *
 * Porte de `/api/user/permissions`, `/api/acessos-locais`, `/api/ordens`,
 * `/api/ordens/{id}/itens` e `/api/os_itens/{id}` (`app.py`). Sao as rotas que
 * NAO podem morar na estacao: as duas primeiras mexem em tabelas que so a chave
 * de servico alcanca (`sql/rls_passo3_fechar_leitura.sql`), e a chave de servico
 * nao vai para as estacoes por decisao registrada em `acesso_api.py` -- ela abre
 * cliente, proposta e financeiro do parceiro.
 *
 * ## O que este porte CORRIGE, e nao apenas move
 *
 * No Render, qualquer sessao valida podia gravar em `/api/user/permissions`. E
 * "qualquer sessao valida" aqui quer dizer qualquer cliente do ERP parceiro:
 * a conta com que o cliente entra e a mesma do Vibe. Quer dizer que um cliente
 * podia mandar `{"user_id": "<o dele>", "role": "admin", "perm_admin_edit":
 * true}` e virar administrador do painel da grafica -- dono do Menu Usuarios,
 * onde ficam os codigos de acesso das estacoes.
 *
 * A trava de 16/08/2026 (`app.py: precisa_de_sessao`) fechou o caso ANONIMO,
 * que era o mais grave, e deixou este de pe. Aqui ele fecha:
 *
 *   - escrever na grade de outra pessoa exige `perm_admin_edit`;
 *   - primeiro acesso continua criando a propria linha, so que o SERVIDOR
 *     decide o que vai nela. O corpo e ignorado.
 *
 * ## Por que `perm_admin_edit` e nao `role === "admin"`
 *
 * Esta escrito em `puro.ts`, junto da funcao: a grade e editavel usuario a
 * usuario e o dono da grafica a edita ao vivo. O papel e o rotulo do seletor; a
 * grade e a origem da verdade.
 */
import { banco, contar } from "../_compartilhado/banco.ts";
import { comCors, origemPermitida, respostaDePreflight } from "../_compartilhado/cors.ts";
import { excluirFonte, salvarFonte } from "../_compartilhado/fontes.ts";
import { conferirSenha, senhaAtual } from "../_compartilhado/senha_liberacao.ts";
import { Recusa, usuarioDoJwt } from "../_compartilhado/sessao.ts";
import { recusaDeRotaDesconhecida, RecusaDeValidacao } from "../_compartilhado/validacao.ts";
import {
  limparItemOs,
  pedacosDaRota,
  podeEditarUsuarios,
  podeVerUsuarios,
  validarCodigo,
} from "./puro.ts";

const JSON_HEADERS = { "Content-Type": "application/json" };

const TABELA_PERMISSOES = "imposition_user_permissions";
const TABELA_ACESSOS = "imposition_acessos_locais";

/**
 * O que o SERVIDOR grava no primeiro acesso de alguem.
 *
 * Copia deliberada de `ROLE_DEFAULTS` (`frontend/script.js`), reduzida aos dois
 * unicos perfis que o primeiro acesso pode produzir. A duplicacao e o preco de
 * nao confiar no corpo da requisicao, e vale: enquanto o servidor aceitasse o
 * que o navegador mandasse, "primeiro acesso" era o nome de uma porta por onde
 * qualquer cliente do ERP entrava como administrador.
 *
 * A copia do frontend continua mandando na TELA (quais caixas aparecem
 * marcadas); esta manda no que o BANCO recebe. Se as duas divergirem, quem vale
 * e esta -- e a tela se corrige na proxima leitura.
 */
const PADRAO_VISUALIZADOR = {
  perm_imposicao_view: true, perm_imposicao_edit: false,
  perm_pedidos_view: true, perm_pedidos_edit: false,
  perm_formatos_view: true, perm_formatos_edit: false,
  perm_numeracao_view: true, perm_numeracao_edit: false,
  perm_saidas_view: true, perm_saidas_edit: false,
  perm_cores_view: true, perm_cores_edit: false,
  perm_mapas_view: true, perm_mapas_edit: false,
  perm_amostras_view: true, perm_amostras_edit: false,
  perm_impressoras_view: false, perm_impressoras_edit: false,
  perm_producao_view: true, perm_producao_edit: false,
  perm_acabamento_view: true, perm_acabamento_edit: true,
  perm_lista_arte_view: true, perm_lista_arte_edit: false,
  perm_fontes_view: true, perm_fontes_edit: false,
  perm_gerar_pdf: false, perm_imprimir: false,
  perm_admin_view: false, perm_admin_edit: false,
};

const PADRAO_ADMIN = {
  perm_imposicao_view: true, perm_imposicao_edit: true,
  perm_pedidos_view: true, perm_pedidos_edit: true,
  perm_formatos_view: true, perm_formatos_edit: true,
  perm_numeracao_view: true, perm_numeracao_edit: true,
  perm_saidas_view: true, perm_saidas_edit: true,
  perm_cores_view: true, perm_cores_edit: true,
  perm_mapas_view: true, perm_mapas_edit: true,
  perm_amostras_view: true, perm_amostras_edit: true,
  perm_impressoras_view: true, perm_impressoras_edit: true,
  perm_producao_view: true, perm_producao_edit: true,
  perm_acabamento_view: true, perm_acabamento_edit: true,
  perm_lista_arte_view: true, perm_lista_arte_edit: true,
  perm_fontes_view: true, perm_fontes_edit: true,
  perm_gerar_pdf: true, perm_imprimir: true,
  perm_admin_view: true, perm_admin_edit: true,
};

/** A linha de permissoes de um usuario, ou `null`. */
async function permissoesDe(userId: string): Promise<Record<string, unknown> | null> {
  const linhas = (await banco(
    "GET",
    `${TABELA_PERMISSOES}?user_id=eq.${encodeURIComponent(userId)}&select=*`,
  )) ?? [];
  return linhas[0] ?? null;
}

/** Quem esta falando, e o que ele ja pode. */
async function quemChama(req: Request) {
  const usuario = usuarioDoJwt(req.headers.get("authorization"));
  return { ...usuario, permissoes: await permissoesDe(usuario.id) };
}

/** Recusa quem nao tem o modulo Usuarios; a mensagem diz o que pedir. */
function exigirModuloUsuarios(permissoes: unknown, escrita: boolean): void {
  const pode = escrita ? podeEditarUsuarios(permissoes) : podeVerUsuarios(permissoes);
  if (!pode) {
    throw new Recusa(
      403,
      'esta tela e do modulo "Usuarios". Peca ao administrador a permissao ' +
        (escrita ? "EDITAR" : "VER") + ' de "Usuarios".',
    );
  }
}

// ─── Permissoes ──────────────────────────────────────────────────────────────

/**
 * Grava a grade de alguem.
 *
 * Dois caminhos, e a diferenca entre eles e o que fecha a porta:
 *
 *   - quem TEM `perm_admin_edit` grava o que quiser, em quem quiser. E o Menu
 *     Usuarios funcionando como sempre funcionou.
 *   - quem NAO tem so pode criar a PROPRIA linha, e so quando ela ainda nao
 *     existe. O corpo e descartado: o servidor escreve `PADRAO_ADMIN` se nao ha
 *     ninguem na tabela (a primeira pessoa da grafica) e `PADRAO_VISUALIZADOR`
 *     em qualquer outro caso.
 *
 * O segundo caminho existe porque o painel cria a linha no primeiro login
 * (`ensureUserPermissions`, em `frontend/script.js`). Sem ele, ninguem novo
 * entraria nunca -- e exigir que um administrador cadastre antes mudaria um
 * fluxo que ja esta aprovado e rodando.
 */
async function gravarPermissoes(quem: Awaited<ReturnType<typeof quemChama>>, corpo: any) {
  const alvo = String(corpo?.user_id ?? "").trim();
  if (!alvo) throw new Recusa(400, "user_id e obrigatorio");

  if (!podeEditarUsuarios(quem.permissoes)) {
    if (alvo !== quem.id) {
      throw new Recusa(403, "so um administrador muda a permissao de outra pessoa");
    }
    if (quem.permissoes) {
      throw new Recusa(
        403,
        "a sua permissao quem muda e o administrador. Se voce precisa de um " +
          "modulo, peca a ele em Usuarios.",
      );
    }
    // Primeiro acesso: o servidor decide. `contar` e nao trazer as linhas --
    // quem esta entrando agora nao pode receber a grade inteira da grafica so
    // para descobrir se e o primeiro.
    const jaExistem = await contar(`${TABELA_PERMISSOES}?user_id=not.is.null`);
    const primeiro = jaExistem === 0;
    // Sem `email`: a tabela nao tem essa coluna, e mandar uma coluna que nao
    // existe faz o PostgREST recusar a gravacao INTEIRA com 400 -- ou seja,
    // ninguem novo entraria mais no painel. Conferido contra o banco em
    // 16/08/2026, coluna a coluna. Quem quiser saber de quem e a linha usa o
    // `user_id`, que e a chave.
    corpo = {
      user_id: quem.id,
      role: primeiro ? "admin" : "visualizador",
      ...(primeiro ? PADRAO_ADMIN : PADRAO_VISUALIZADOR),
    };
  }

  const linhas = await banco(
    "POST",
    `${TABELA_PERMISSOES}?on_conflict=user_id`,
    { ...corpo, updated_at: new Date().toISOString() },
    "resolution=merge-duplicates,return=representation",
  );
  // Resposta vazia e gravacao que nao aconteceu. Devolver o corpo recebido diria
  // "salvo" com base no que o CHAMADOR mandou, e nao no que o banco gravou --
  // e visto verde sobre gravacao inexistente e o defeito mais caro desta tela.
  if (!linhas || !linhas.length) {
    throw new Recusa(503, "o banco aceitou a requisicao e nao gravou linha nenhuma");
  }
  return { ok: true, permissions: linhas[0] };
}

// ─── Acessos locais ──────────────────────────────────────────────────────────

/** Porte de `db.salvar_acesso_local`. Criar e atualizar sao verbos diferentes. */
async function salvarAcessoLocal(corpo: any) {
  const registro: Record<string, unknown> = { ...(corpo ?? {}) };
  const agora = new Date().toISOString();
  registro.atualizado_em = agora;
  const criando = !registro.id;

  if (criando) {
    registro.id = crypto.randomUUID();
    registro.criado_em = agora;
    if (registro.ativo === undefined) registro.ativo = true;
    if (registro.permissoes === undefined) registro.permissoes = {};
  }

  if (criando || "codigo" in registro) {
    const todos = (await banco("GET", `${TABELA_ACESSOS}?select=id,codigo`)) ?? [];
    const usados = todos
      .filter((a: any) => a.id !== registro.id)
      .map((a: any) => a.codigo);
    registro.codigo = validarCodigo(registro.codigo, usados);
  }

  // PATCH e nao upsert no caminho de atualizacao: o upsert do PostgREST e um
  // INSERT com ON CONFLICT e valida o corpo como linha nova. Um corpo parcial
  // -- trocar o perfil, desativar -- nao traz `nome`, que e NOT NULL, e a
  // requisicao morreria com 400 antes de chegar ao UPDATE.
  let linhas;
  if (criando) {
    linhas = await banco("POST", TABELA_ACESSOS, registro, "return=representation");
  } else {
    const alvo = encodeURIComponent(String(registro.id));
    delete registro.id;
    linhas = await banco(
      "PATCH",
      `${TABELA_ACESSOS}?id=eq.${alvo}`,
      registro,
      "return=representation",
    );
  }
  if (!linhas || !linhas.length) {
    throw new Recusa(503, "o banco nao devolveu linha (id inexistente, ou escrita recusada)");
  }
  return { ok: true, acesso: linhas[0] };
}

// ─── Roteamento ──────────────────────────────────────────────────────────────

async function rotear(req: Request, url: URL): Promise<Response> {
  const p = pedacosDaRota(url.pathname);
  const ok = (corpo: unknown) =>
    new Response(JSON.stringify(corpo), { headers: JSON_HEADERS });
  const corpoJson = async () => {
    try {
      return await req.json();
    } catch {
      throw new Recusa(422, "corpo invalido: esperava JSON");
    }
  };

  // ── /user/permissions ──
  if (p[0] === "user" && p[1] === "permissions") {
    const quem = await quemChama(req);

    // `quantos` existe por causa de uma fuga pequena e feia: para saber se era o
    // primeiro usuario da grafica, o painel pedia a LISTA INTEIRA -- e pedia
    // justamente quando quem perguntava ainda nao tinha permissao nenhuma.
    // Um numero responde a mesma pergunta sem entregar a grade a um estranho.
    if (p.length === 3 && p[2] === "quantos") {
      if (req.method !== "GET") recusaDeRotaDesconhecida(req.method);
      return ok({ ok: true, total: await contar(`${TABELA_PERMISSOES}?user_id=not.is.null`) });
    }

    if (p.length === 2 && req.method === "GET") {
      exigirModuloUsuarios(quem.permissoes, false);
      return ok({
        ok: true,
        permissions: (await banco(
          "GET",
          `${TABELA_PERMISSOES}?select=*&order=created_at.asc`,
        )) ?? [],
      });
    }

    if (p.length === 2 && req.method === "POST") {
      return ok(await gravarPermissoes(quem, await corpoJson()));
    }

    if (p.length === 3 && req.method === "GET") {
      // A propria linha sempre; a de outra pessoa so com o modulo Usuarios. O
      // painel le a propria no login, e e a unica leitura que todo mundo faz.
      if (p[2] !== quem.id) exigirModuloUsuarios(quem.permissoes, false);
      return ok({ ok: true, permissions: await permissoesDe(p[2]) });
    }

    if (p.length === 3 && req.method === "DELETE") {
      exigirModuloUsuarios(quem.permissoes, true);
      if (p[2] === quem.id) {
        // Apagar a propria linha nao e um jeito de sair: e o jeito de perder o
        // Menu Usuarios sem ninguem para devolve-lo.
        throw new Recusa(400, "voce nao pode apagar a sua propria permissao");
      }
      await banco("DELETE", `${TABELA_PERMISSOES}?user_id=eq.${encodeURIComponent(p[2])}`);
      return ok({ ok: true });
    }

    recusaDeRotaDesconhecida(req.method);
  }

  // ── /acessos-locais ──
  //
  // O modulo Usuarios e exigido inclusive na LEITURA, e aqui isso importa mais
  // que na grade: esta lista traz os codigos de seis caracteres em texto claro,
  // e cada um deles destranca o painel de uma estacao da grafica.
  if (p[0] === "acessos-locais") {
    const quem = await quemChama(req);

    if (p.length === 1 && req.method === "GET") {
      exigirModuloUsuarios(quem.permissoes, false);
      return ok({
        ok: true,
        acessos: (await banco("GET", `${TABELA_ACESSOS}?select=*&order=nome.asc`)) ?? [],
      });
    }

    if (p.length === 1 && req.method === "POST") {
      exigirModuloUsuarios(quem.permissoes, true);
      return ok(await salvarAcessoLocal(await corpoJson()));
    }

    if (p.length === 2 && req.method === "DELETE") {
      exigirModuloUsuarios(quem.permissoes, true);
      await banco("DELETE", `${TABELA_ACESSOS}?id=eq.${encodeURIComponent(p[1])}`);
      return ok({ ok: true });
    }

    recusaDeRotaDesconhecida(req.method);
  }

  // ── /senha-liberacao ──
  //
  // A senha semanal que libera, no Painel do Acabamento, um peso real fora dos
  // 5 % do estimado. Ver `_compartilhado/senha_liberacao.ts`.
  //
  // MOSTRAR a senha exige o modulo Usuarios, pela mesma razao da lista de
  // codigos locais: e um segredo da semana, e quem o conhece libera qualquer
  // divergencia. CONFERIR exige so sessao -- quem digita e o operador do
  // acabamento, e a resposta e sim ou nao. A senha nunca desce para a tela dele.
  if (p[0] === "senha-liberacao") {
    const quem = await quemChama(req);

    if (p.length === 1 && req.method === "GET") {
      exigirModuloUsuarios(quem.permissoes, false);
      return ok({ ok: true, ...(await senhaAtual()) });
    }

    if (p.length === 2 && p[1] === "conferir" && req.method === "POST") {
      const corpo = await corpoJson();
      return ok({ ok: true, confere: await conferirSenha(corpo?.senha) });
    }

    recusaDeRotaDesconhecida(req.method);
  }

  // ── /fontes ──
  //
  // Sessão válida e nada além disso, DE PROPÓSITO — é exatamente o que o Render
  // exigia. O que fecha o buraco aqui não é uma permissão nova: é o REVOKE que
  // tirou INSERT/UPDATE/DELETE de `catalogo_fontes` da chave pública
  // (`sql/fontes_so_escrevem_pelas_funcoes.sql`). Exigir um módulo por cima
  // seria apertar um caminho que hoje funciona, e o módulo `perm_fontes_edit`
  // nem aparece no perfil de administrador do painel — quem cadastra fonte
  // acabaria trancado do lado de fora.
  if (p[0] === "fontes") {
    await quemChama(req);
    if (p.length === 1 && req.method === "POST") {
      return ok({ status: "success", fonte: await salvarFonte(await corpoJson()) });
    }
    if (p.length === 2 && req.method === "DELETE") {
      await excluirFonte(p[1]);
      return ok({ status: "success" });
    }
    recusaDeRotaDesconhecida(req.method);
  }

  // ── /ordens e /os_itens ──
  //
  // Sem exigencia de modulo, como no Render: sao dados de producao que o painel
  // inteiro le. Sessao valida continua sendo obrigatoria.
  if (p[0] === "ordens") {
    await quemChama(req);
    if (p.length === 1 && req.method === "GET") {
      const linhas = (await banco(
        "GET",
        "producao_ordens_servico?select=*,producao_os_itens(id)",
      )) ?? [];
      // O `_itens_count` e calculado aqui pela mesma razao do `db.get_ordens`:
      // a tela mostra "3 itens" sem abrir a ordem.
      return ok(linhas.map((o: any) => {
        const itens = o.producao_os_itens ?? [];
        delete o.producao_os_itens;
        return { ...o, _itens_count: itens.length };
      }));
    }
    if (p.length === 3 && p[2] === "itens" && req.method === "GET") {
      return ok(
        (await banco(
          "GET",
          `producao_os_itens?os_id=eq.${encodeURIComponent(p[1])}&order=created_at.asc`,
        )) ?? [],
      );
    }
    recusaDeRotaDesconhecida(req.method);
  }

  if (p[0] === "os_itens" && p.length === 2) {
    await quemChama(req);
    if (req.method !== "PUT") recusaDeRotaDesconhecida(req.method);
    const limpo = limparItemOs(await corpoJson());
    // Corpo sem nenhuma coluna conhecida e sucesso, e nao 404: e o que o
    // `db.update_os_item` faz, e a tela conta com isso ao salvar sem mudancas.
    if (!Object.keys(limpo).length) return ok({ status: "success" });
    const linhas = await banco(
      "PATCH",
      `producao_os_itens?id=eq.${encodeURIComponent(p[1])}`,
      limpo,
      "return=representation",
    );
    if (!linhas || !linhas.length) throw new Recusa(404, "Item não encontrado");
    return ok({ status: "success" });
  }

  recusaDeRotaDesconhecida(req.method);
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const origem = origemPermitida(req.headers.get("origin"));

  if (req.method === "OPTIONS") {
    return respostaDePreflight(
      origem,
      "GET, POST, PUT, DELETE, OPTIONS",
      "authorization,content-type,apikey",
    );
  }

  try {
    return comCors(await rotear(req, url), origem);
  } catch (e) {
    if (e instanceof Recusa) {
      const corpo = e instanceof RecusaDeValidacao
        ? { detail: e.detalhes }
        : { detail: e.detail };
      return comCors(
        new Response(JSON.stringify(corpo), { status: e.status, headers: JSON_HEADERS }),
        origem,
      );
    }
    console.error("[painel]", e);
    return comCors(
      new Response(JSON.stringify({ detail: "erro interno" }), {
        status: 500,
        headers: JSON_HEADERS,
      }),
      origem,
    );
  }
});
