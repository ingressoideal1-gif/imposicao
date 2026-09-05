import { assert, assertEquals, assertRejects, assertThrows } from "jsr:@std/assert@1";
import { ALFABETO_SENHA, emailLimpo, liberarAcesso, senhaProvisoria } from "./contas.ts";
import { Recusa } from "./sessao.ts";

Deno.test("senha provisoria: 8 simbolos, sem 0 O 1 I L", () => {
  for (let i = 0; i < 200; i++) {
    const s = senhaProvisoria();
    assertEquals(s.length, 8);
    for (const c of s) assert(ALFABETO_SENHA.includes(c), `simbolo fora do alfabeto: ${c}`);
    for (const proibido of "0O1Il") assert(!s.includes(proibido));
  }
});

Deno.test("senha provisoria: duas seguidas nao sao iguais", () => {
  assert(senhaProvisoria() !== senhaProvisoria());
});

Deno.test("e-mail: minusculo e sem espacos", () => {
  assertEquals(emailLimpo("  Daniel@Exemplo.com "), "daniel@exemplo.com");
});

Deno.test("e-mail: o que nao parece e-mail e recusado com 422", () => {
  for (const ruim of ["", "daniel", "daniel@", "@exemplo.com", null, undefined, "a b@c.d"]) {
    const e = assertThrows(() => emailLimpo(ruim), Recusa);
    assertEquals(e.status, 422);
  }
});

// ── liberarAcesso, com o fetch de mesa ──────────────────────────────────────
//
// `liberarAcesso` fala com DOIS servicos por `fetch`: o PostgREST (`banco()`,
// em `/rest/v1/...`) e a admin API do GoTrue (`auth_admin.ts`, em
// `/auth/v1/admin/...`). O dublê abaixo responde aos dois pelo caminho da
// URL, do mesmo jeito que `configuracao_test.ts` dubla so o PostgREST -- so
// que aqui precisa dos dois lados porque e exatamente a COSTURA entre eles
// (criar no GoTrue, depois ligar no banco) que este conjunto de testes cobre.

interface Ida {
  metodo: string;
  url: string;
  corpo: string;
}

function jsonResp(corpo: unknown, status = 200): Response {
  return new Response(corpo === null ? "null" : JSON.stringify(corpo), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function vazio(status = 204): Response {
  return new Response(null, { status });
}

function erro(status: number, msg: string): Response {
  return new Response(JSON.stringify({ message: msg }), { status });
}

/**
 * Troca o `fetch` global por um dublê que responde conforme `responder`, e
 * anota cada ida em `idas` -- e o que os testes de "a conta foi apagada
 * depois?" e "a ligacao veio com criada_aqui:true?" precisam conferir.
 *
 * Devolve `restaurar` em vez de encapsular a chamada inteira (como
 * `comBancoDeMesa` de `configuracao_test.ts` faz) porque aqui um dos testes
 * PRECISA que `liberarAcesso` rejeite -- e ainda assim quer as `idas` depois.
 */
function comFetchDublado(
  responder: (ida: Ida) => Response,
): { idas: Ida[]; restaurar: () => void } {
  const fetchDeVerdade = globalThis.fetch;
  const idas: Ida[] = [];
  Deno.env.set("SUPABASE_URL", "https://banco.de.mesa");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "chave-de-mesa");
  globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => {
    const ida: Ida = {
      metodo: init?.method ?? "GET",
      url: String(url).replace("https://banco.de.mesa", ""),
      corpo: String(init?.body ?? ""),
    };
    idas.push(ida);
    return Promise.resolve(responder(ida));
  }) as typeof fetch;
  return {
    idas,
    restaurar: () => {
      globalThis.fetch = fetchDeVerdade;
    },
  };
}

Deno.test("liberarAcesso: e-mail novo cria a conta no GoTrue, liga no banco e devolve a senha", async () => {
  const { idas, restaurar } = comFetchDublado((ida) => {
    if (ida.url.includes("/rest/v1/rpc/acesso_usuario_por_email")) return jsonResp(null);
    if (ida.metodo === "POST" && ida.url.includes("/auth/v1/admin/users")) {
      return jsonResp({ id: "novo-id" });
    }
    if (ida.metodo === "POST" && ida.url.startsWith("/rest/v1/producao_acesso_contas")) {
      return vazio();
    }
    throw new Error(`chamada inesperada: ${ida.metodo} ${ida.url}`);
  });
  try {
    const r = await liberarAcesso(1, "novo@exemplo.com", "atendente@grafica");
    assertEquals(r.email, "novo@exemplo.com");
    assertEquals(r.ja_tinha_conta, false);
    assertEquals(r.senha_provisoria?.length, 8);
    assert(idas.some((i) => i.metodo === "POST" && i.url.includes("/auth/v1/admin/users")));
    assert(
      idas.some((i) => i.metodo === "POST" && i.url.startsWith("/rest/v1/producao_acesso_contas")),
    );
  } finally {
    restaurar();
  }
});

Deno.test("liberarAcesso: se a ligacao falhar depois de criar, a conta e desfeita e o erro propaga", async () => {
  const { idas, restaurar } = comFetchDublado((ida) => {
    if (ida.url.includes("/rest/v1/rpc/acesso_usuario_por_email")) return jsonResp(null);
    if (ida.metodo === "POST" && ida.url.includes("/auth/v1/admin/users")) {
      return jsonResp({ id: "orfa-id" });
    }
    if (ida.metodo === "POST" && ida.url.startsWith("/rest/v1/producao_acesso_contas")) {
      return erro(500, "PostgREST fora do ar");
    }
    if (ida.metodo === "DELETE" && ida.url.includes("/auth/v1/admin/users/orfa-id")) {
      return jsonResp({});
    }
    throw new Error(`chamada inesperada: ${ida.metodo} ${ida.url}`);
  });
  try {
    await assertRejects(() => liberarAcesso(1, "orfa@exemplo.com", "atendente@grafica"));
    assert(
      idas.some((i) => i.metodo === "DELETE" && i.url.includes("/auth/v1/admin/users/orfa-id")),
      "nao apagou a conta orfa depois da ligacao falhar",
    );
  } finally {
    restaurar();
  }
});

Deno.test("liberarAcesso: conta orfa NOSSA (metadata ideal-control) tem a senha resetada e a ligacao refeita", async () => {
  const { idas, restaurar } = comFetchDublado((ida) => {
    if (ida.url.includes("/rest/v1/rpc/acesso_usuario_por_email")) return jsonResp("user-123");
    if (
      ida.metodo === "GET" && ida.url.startsWith("/rest/v1/producao_acesso_contas") &&
      ida.url.includes("auth_user_id=eq.user-123")
    ) {
      return jsonResp([]);
    }
    if (ida.metodo === "GET" && ida.url.includes("/auth/v1/admin/users/user-123")) {
      return jsonResp({ id: "user-123", user_metadata: { origem: "ideal-control" } });
    }
    if (ida.metodo === "PUT" && ida.url.includes("/auth/v1/admin/users/user-123")) {
      return jsonResp({ id: "user-123" });
    }
    if (ida.metodo === "POST" && ida.url.startsWith("/rest/v1/producao_acesso_contas")) {
      return vazio();
    }
    throw new Error(`chamada inesperada: ${ida.metodo} ${ida.url}`);
  });
  try {
    const r = await liberarAcesso(2, "orfanossa@exemplo.com", "atendente@grafica");
    assertEquals(r.ja_tinha_conta, false);
    assertEquals(r.senha_provisoria?.length, 8);
    assert(idas.some((i) => i.metodo === "PUT" && i.url.includes("/auth/v1/admin/users/user-123")));
    const insercao = idas.find(
      (i) => i.metodo === "POST" && i.url.startsWith("/rest/v1/producao_acesso_contas"),
    );
    assert(insercao, "nao gravou a ligacao");
    assertEquals(JSON.parse(insercao!.corpo).criada_aqui, true);
  } finally {
    restaurar();
  }
});

Deno.test("liberarAcesso: conta existente que NAO e nossa so liga, sem tocar em senha", async () => {
  const { idas, restaurar } = comFetchDublado((ida) => {
    if (ida.url.includes("/rest/v1/rpc/acesso_usuario_por_email")) return jsonResp("user-456");
    if (
      ida.metodo === "GET" && ida.url.startsWith("/rest/v1/producao_acesso_contas") &&
      ida.url.includes("auth_user_id=eq.user-456")
    ) {
      return jsonResp([]);
    }
    if (ida.metodo === "GET" && ida.url.includes("/auth/v1/admin/users/user-456")) {
      return jsonResp({ id: "user-456", user_metadata: { origem: "outro-sistema" } });
    }
    if (ida.metodo === "POST" && ida.url.startsWith("/rest/v1/producao_acesso_contas")) {
      return vazio();
    }
    throw new Error(`chamada inesperada: ${ida.metodo} ${ida.url}`);
  });
  try {
    const r = await liberarAcesso(3, "existente@exemplo.com", "atendente@grafica");
    assertEquals(r.ja_tinha_conta, true);
    assertEquals(r.senha_provisoria, null);
    assert(!idas.some((i) => i.metodo === "PUT"), "mexeu na senha de conta que nao e nossa");
  } finally {
    restaurar();
  }
});

// ── O rebaixamento silencioso (04/09/2026) ──────────────────────────────────
//
// Tocar em "Liberar acesso" duas vezes no mesmo e-mail -- o que o atendente faz
// quando nao viu a senha da primeira vez -- reescrevia a ligacao com
// `criada_aqui: false`. A conta criada pela grafica passava a se dizer conta do
// Vibe: o botao "Nova senha provisoria" sumia da tela e o servidor recusava com
// 403. Duas contas de cliente ficaram sem ninguem que pudesse redefinir a senha.

Deno.test("liberarAcesso: liberar DE NOVO nao rebaixa a conta que a grafica criou", async () => {
  const { idas, restaurar } = comFetchDublado((ida) => {
    if (ida.url.includes("/rest/v1/rpc/acesso_usuario_por_email")) return jsonResp("user-789");
    if (
      ida.metodo === "GET" && ida.url.startsWith("/rest/v1/producao_acesso_contas") &&
      ida.url.includes("auth_user_id=eq.user-789")
    ) {
      return jsonResp([{ id_cliente: 7, criada_aqui: true }]);
    }
    if (ida.metodo === "PATCH" && ida.url.startsWith("/rest/v1/producao_acesso_contas")) {
      return vazio();
    }
    throw new Error(`chamada inesperada: ${ida.metodo} ${ida.url}`);
  });
  try {
    const r = await liberarAcesso(7, "denovo@exemplo.com", "atendente@grafica");
    assertEquals(r.ja_tinha_conta, true);
    assertEquals(r.criada_aqui, true, "a conta deixou de se dizer nossa");
    assertEquals(r.senha_provisoria, null);

    const patch = idas.find((i) => i.metodo === "PATCH");
    assert(patch, "nao religou a conta");
    const corpo = JSON.parse(patch!.corpo);
    assert(!("criada_aqui" in corpo), "reescreveu criada_aqui numa ligacao que ja existia");
    assert(
      !("senha_provisoria_em" in corpo),
      "apagou a marca da senha provisoria numa ligacao que ja existia",
    );
    assert(!idas.some((i) => i.metodo === "PUT"), "mexeu na senha sem ninguem pedir");
    assert(
      !idas.some((i) => i.metodo === "POST" && i.url.startsWith("/rest/v1/producao_acesso_contas")),
      "inseriu uma segunda ligacao para o mesmo cliente",
    );
  } finally {
    restaurar();
  }
});

Deno.test("liberarAcesso: conta NOSSA ligada a outro cliente entra como nossa no cliente novo", async () => {
  const { idas, restaurar } = comFetchDublado((ida) => {
    if (ida.url.includes("/rest/v1/rpc/acesso_usuario_por_email")) return jsonResp("user-900");
    if (
      ida.metodo === "GET" && ida.url.startsWith("/rest/v1/producao_acesso_contas") &&
      ida.url.includes("auth_user_id=eq.user-900")
    ) {
      return jsonResp([{ id_cliente: 1, criada_aqui: true }]);
    }
    if (ida.metodo === "GET" && ida.url.includes("/auth/v1/admin/users/user-900")) {
      return jsonResp({ id: "user-900", user_metadata: { origem: "ideal-control" } });
    }
    if (ida.metodo === "POST" && ida.url.startsWith("/rest/v1/producao_acesso_contas")) {
      return vazio();
    }
    throw new Error(`chamada inesperada: ${ida.metodo} ${ida.url}`);
  });
  try {
    const r = await liberarAcesso(2, "doisclientes@exemplo.com", "atendente@grafica");
    assertEquals(r.ja_tinha_conta, true);
    assertEquals(r.criada_aqui, true);
    const insercao = idas.find(
      (i) => i.metodo === "POST" && i.url.startsWith("/rest/v1/producao_acesso_contas"),
    );
    assert(insercao, "nao gravou a ligacao com o cliente novo");
    assertEquals(JSON.parse(insercao!.corpo).criada_aqui, true);
    // A senha NAO se troca aqui: a conta ja esta em uso por outro cliente, e
    // resetar derrubaria o acesso de quem ja entra com ela.
    assert(!idas.some((i) => i.metodo === "PUT"), "trocou a senha de uma conta em uso");
  } finally {
    restaurar();
  }
});
