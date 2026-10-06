/** Rota real, banco sintetico: nenhum contrato pode ser criado pela consulta. */
import { strict as assert } from "node:assert";

Deno.test("painel QR: sessao, grade, leitura filtrada e sem dados secretos", async () => {
  const servir = Deno.serve, buscar = globalThis.fetch, ambiente = Deno.env.get;
  let handler!: (req: Request) => Promise<Response>;
  let permissoes: Record<string, unknown> | null = { perm_lista_arte_view: true };
  let consultas = 0, falhar = false;
  const chamadas: string[] = [];
  const jwt = "cabecalho." + btoa(JSON.stringify({ sub: "operador-sintetico" })) + ".assinatura";
  try {
    Deno.serve = ((fn: typeof handler) => { handler = fn; return {}; }) as unknown as typeof Deno.serve;
    Deno.env.get = (nome) => ({ SUPABASE_URL: "https://banco.invalid", SUPABASE_SERVICE_ROLE_KEY: "sintetica" })[nome];
    globalThis.fetch = ((_url: string | URL | Request, opts?: RequestInit) => {
      consultas++;
      assert.equal(opts?.method, "GET", "nenhuma mutacao ou RPC de reserva");
      const url = String(_url);
      if (url.includes("imposition_user_permissions?")) return Promise.resolve(Response.json(permissoes ? [permissoes] : []));
      assert.equal(url, "https://banco.invalid/rest/v1/producao_acesso_qr_contratos?pedido=eq.23063&select=pedido,modelo,versao&order=modelo.asc");
      chamadas.push(url);
      if (falhar) return Promise.resolve(Response.json({message:"sintetico"},{status:503}));
      return Promise.resolve(Response.json([
        {pedido:23063,modelo:1001859,versao:2,extra_privado:"nunca-retornar"},
        {pedido:23063,modelo:1001959,versao:2},
      ]));
    }) as typeof fetch;
    await import("./index.ts");
    const req = (pedido = "23063", metodo = "GET", token = jwt) => new Request(
      "https://funcao.invalid/functions/v1/painel/api/qr-ideal/contratos?pedido=" + encodeURIComponent(pedido),
      {method:metodo,headers:{Origin:"https://imposition.ai-ideal.com.br",...(token ? {Authorization:"Bearer " + token} : {})}},
    );
    assert.equal((await handler(req("23063","OPTIONS",""))).status,204);
    assert.equal((await handler(req("23063","GET",""))).status,401);
    assert.equal(consultas,0);
    for (const p of [null,{}, {role:"admin"}, {perm_lista_arte_view:"true"}]) {
      permissoes=p;
      assert.equal((await handler(req())).status,403);
    }
    assert.equal(chamadas.length,0);
    permissoes={perm_producao_view:true};
    const res=await handler(req());
    assert.equal(res.status,200);
    assert.equal(res.headers.get("Cache-Control"),"no-store");
    assert.equal(res.headers.get("Access-Control-Allow-Origin"),"https://imposition.ai-ideal.com.br");
    assert.deepEqual(await res.json(),[
      {pedido:23063,modelo:1001859,versao:2},{pedido:23063,modelo:1001959,versao:2},
    ]);
    const n=chamadas.length;
    for(const pedido of ["", "0", "-1", "1.5", "23063&pedido=1", "2147483648"]){
      assert.equal((await handler(req(pedido))).status,422);
    }
    for(const metodo of ["POST","PUT","DELETE"]){
      assert.equal((await handler(req("23063",metodo))).status,405);
    }
    assert.equal(chamadas.length,n);
    falhar=true;
    const falha=await handler(req());
    assert.equal(falha.status,500);
    assert.deepEqual(await falha.json(),{detail:"erro interno"});
  } finally {
    Deno.serve=servir; globalThis.fetch=buscar; Deno.env.get=ambiente;
  }
});
