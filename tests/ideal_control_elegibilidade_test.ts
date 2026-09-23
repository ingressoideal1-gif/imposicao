// Rotas reais, banco sintético e nenhuma permissão de rede.
Deno.test("listas interna e por cliente incluem somente modelos legíveis, mesmo antes da publicação", async () => {
  const originalServe = Deno.serve, originalFetch = globalThis.fetch;
  const env = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
  const anteriores = env.map(n => Deno.env.get(n));
  let handler: (r: Request) => Promise<Response>;
  const uuid = (n: number) => `11111111-1111-4111-8111-${String(n).padStart(12, "0")}`;
  const modelos = Array.from({length: 9}, (_, i) => ({id_int:i+1, quantidade: i === 7 ? 0 : 10, amostra_num_id: i === 8 ? "n1" : uuid(i+1)}));
  const elements = [[{type:"QR_IDEAL"}], [{type:"QR"}], [{type:"BARCODE"}], [{type:"TEXT"}], [{type:"QR",fixed:true}], [{type:"QR",source:"database"}], null, [{type:"QR"}]];
  const assert = (v: unknown) => { if (!v) throw new Error("Resultado inesperado"); };
  try {
    Deno.env.set(env[0], "https://sintetico.invalid");
    Deno.env.set(env[1], "chave-ficticia");
    Deno.serve = ((h: typeof handler) => {handler=h; return {};}) as typeof Deno.serve;
    globalThis.fetch = ((input: any, options: any) => {
      const u = new URL(String(input));
      assert(u.hostname === "sintetico.invalid" && options.method === "GET");
      const tabela = u.pathname.split("/").pop();
      let rows: any;
      if (tabela === "imposition_user_permissions") rows=[{role:"admin"}];
      else if (tabela === "clientes") rows=[{id_cliente:1,nome:"Sintético"}];
      else if (tabela === "propostas") rows=Array.from({length:10},(_,i)=>({id_int:i+1}));
      else if (tabela === "pedidos_modelos") rows=modelos;
      else if (tabela === "producao_numeracoes") rows=elements.map((e,i)=>({id:uuid(i+1),elements:e}));
      else if (tabela === "producao_acesso_pedidos") rows=u.searchParams.has("pedido_id_int") ? [] : Array.from({length:10},(_,i)=>({pedido_id_int:i+1}));
      else if (tabela === "producao_acesso_contas") rows=[];
      else throw new Error("Consulta inesperada: "+tabela);
      return Promise.resolve(new Response(JSON.stringify(rows)));
    }) as typeof fetch;
    await import("../supabase/functions/acesso-interno/index.ts");
    const token = "ficticio."+btoa(JSON.stringify({sub:uuid(99)}))+".ficticio";
    for (const rota of ["clientes/1", "pedidos?limite=2"]) {
      const res = await handler!(new Request("https://sintetico.invalid/acesso-interno/"+rota,{headers:{Authorization:"Bearer "+token}}));
      assert(res.status===200);
      const r = await res.json();
      assert(JSON.stringify(r.pedidos.map((p:any)=>p.pedido_id_int)) === (rota.startsWith("clientes") ? "[1,2,3]" : "[1,2]"));
      if (rota.startsWith("clientes")) {
        assert(r.sem_modelo===1 && r.sem_controle===6);
        assert(r.pedidos.every((p:any)=>!p.no_controle && p.total_credenciais===0));
      }
    }
  } finally {
    Deno.serve=originalServe; globalThis.fetch=originalFetch;
    env.forEach((n,i)=>anteriores[i]===undefined ? Deno.env.delete(n) : Deno.env.set(n,anteriores[i]!));
  }
});
