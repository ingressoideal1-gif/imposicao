import { lerPesos } from "./pesos.ts";

Deno.test("estacao recebe hora do ERP por leitura filtrada, inclusive nula", async () => {
  const fetchAnterior = globalThis.fetch;
  const variaveis = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
  const anteriores = variaveis.map((nome) => Deno.env.get(nome));
  Deno.env.set("SUPABASE_URL", "https://exemplo.invalid");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "chave-ficticia-teste");
  const linhas = [{ setor: "LASER", hora: "16:00:00" }, { setor: "PVC", hora: null }];
  let chamadas = 0;
  globalThis.fetch = ((entrada: RequestInfo | URL, opcoes?: RequestInit) => {
    chamadas++;
    const url = new URL(String(entrada));
    if (opcoes?.method !== "GET" || opcoes.body !== undefined) throw new Error("Somente leitura");
    if (url.searchParams.get("id_int") !== "eq.9001") throw new Error("Filtro do pedido ausente");
    if (url.searchParams.get("select") !== "setor,peso_real_kg,status_producao,hora") {
      throw new Error("Projecao incorreta");
    }
    return Promise.resolve(new Response(JSON.stringify(linhas)));
  }) as typeof fetch;
  try {
    const recebido = await lerPesos(9001);
    if (JSON.stringify(recebido) !== JSON.stringify(linhas) || chamadas !== 1) {
      throw new Error("Hora do ERP alterada ou nao devolvida");
    }
    globalThis.fetch = (() => Promise.resolve(new Response("falha simulada", { status: 503 }))) as typeof fetch;
    let falhou = false;
    try { await lerPesos(9001); } catch { falhou = true; }
    if (!falhou) throw new Error("Falha de leitura nao pode parecer hora ausente");
  } finally {
    globalThis.fetch = fetchAnterior;
    variaveis.forEach((nome, i) => {
      if (anteriores[i] === undefined) Deno.env.delete(nome);
      else Deno.env.set(nome, anteriores[i]!);
    });
  }
});
