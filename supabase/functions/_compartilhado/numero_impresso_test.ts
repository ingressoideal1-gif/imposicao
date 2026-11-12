import { numeroImpresso, numerosImpressos } from "./numero_impresso.ts";

function igual(a: unknown, b: unknown) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${JSON.stringify(a)} != ${JSON.stringify(b)}`);
}
const credencial = { id: "c1", origem: "qr_ideal", pedido_id_int: 24585, modelo_id: 1005802, numero: 150 };
const contrato = { pedido: 24585, modelo: 1005802, versao: 2, inicio: 101, passo: 1, posicao: 1, quantidade: 150 };

Deno.test("24585: posição 150 apresenta 250, sem alterar a credencial", () => {
  const antes = JSON.stringify(credencial);
  igual(numeroImpresso(credencial, contrato), 250);
  igual(JSON.stringify(credencial), antes);
});
Deno.test("inícios 1, 0, 801, 901 e última célula TICKET", () => {
  for (const inicio of [0, 1, 801, 901]) {
    igual(numeroImpresso({ ...credencial, numero: 1 }, { ...contrato, inicio }), inicio);
  }
  igual(numeroImpresso(credencial, { ...contrato, passo: 3, posicao: 2 }), 549);
});
Deno.test("legado, sem contrato e código do cliente conservam apresentação anterior", () => {
  igual(numeroImpresso(credencial), undefined);
  igual(numeroImpresso(credencial, { ...contrato, versao: 1 }), undefined);
  igual(numeroImpresso({ ...credencial, origem: "cliente" }, contrato), undefined);
});
Deno.test("não aceita outra identidade, posição inválida ou estouro", () => {
  for (const alteracao of [{ pedido: 1 }, { modelo: 1 }, { inicio: null }, { passo: 0 },
    { quantidade: 149 }, { posicao: 2 }, { inicio: Number.MAX_SAFE_INTEGER }]) {
    let recusou = false;
    try { numeroImpresso(credencial, { ...contrato, ...alteracao } as any); } catch { recusou = true; }
    igual(recusou, true);
  }
});
Deno.test("consulta só contratos dos pares necessários, em lotes abaixo do teto", async () => {
  const original = globalThis.fetch;
  const envUrl = Deno.env.get("SUPABASE_URL"), envKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  Deno.env.set("SUPABASE_URL", "https://teste.invalid");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "sintetico");
  const chamadas: string[] = [];
  globalThis.fetch = async (input, init) => {
    igual(init?.method, "GET");
    const url = new URL(String(input));
    igual(url.pathname, "/rest/v1/producao_acesso_qr_contratos");
    igual(url.searchParams.get("versao"), "eq.2");
    const filtro = url.searchParams.get("or") || "";
    chamadas.push(filtro);
    const modelos = [...filtro.matchAll(/modelo\.eq\.(\d+)/g)].map(m => Number(m[1]));
    if (modelos.length > 50) throw new Error("Lote excedeu limite");
    return new Response(JSON.stringify(modelos.map(modelo => ({ ...contrato, modelo }))));
  };
  try {
    const lista = Array.from({ length: 105 }, (_, i) => ({ ...credencial, id: `c${i}`, modelo_id: 1005802 + i }));
    const resposta = await numerosImpressos([...lista, { ...credencial, id: "cliente", origem: "cliente" }]);
    igual(chamadas.length, 3);
    igual(resposta.size, 105);
    igual(resposta.get("c0"), 250);
    igual(resposta.has("cliente"), false);
  } finally {
    globalThis.fetch = original;
    if (envUrl === undefined) Deno.env.delete("SUPABASE_URL"); else Deno.env.set("SUPABASE_URL", envUrl);
    if (envKey === undefined) Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY"); else Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", envKey);
  }
});

const window: any = {};
new Function("window", Deno.readTextFileSync(new URL("../../../frontend/portaria-validacao.js", import.meta.url)))(window);
new Function("window", Deno.readTextFileSync(new URL("../../../frontend/portaria-sincronismo.js", import.meta.url)))(window);
function entrada(ni: any = 250) {
  return { carga: { evento: { ativo: true }, aparelho: { setores: ["s1"] },
    setores: [{ id: "s1", nome: "Teste", tipo_uso: "unico" }],
    credenciais: [{ id: "c1", s: "s1", h: "hash-sintetico", n: 150, ni }], bloqueios: [] as any[] },
    hashes: ["hash-sintetico"], agora: "2026-11-12T12:00:00Z", entradas: {} as any, presencaOnline: false };
}
Deno.test("leitura permitida apresenta 250 e mantém ID usado pelo controle", () => {
  const e = entrada();
  const r = window.portariaValidacao.decidir(e);
  igual([r.estado, r.numero, r.credencial_id], ["permitido", 250, "c1"]);
  igual(e.carga.credenciais[0].n, 150);
});
Deno.test("bloqueio existente usa ordinal 150, mas recusa apresenta pulseira 250", () => {
  const e = entrada();
  e.carga.bloqueios = [{ setor_id: "s1", de: 150, ate: 150, motivo: "Teste" }];
  const r = window.portariaValidacao.decidir(e);
  igual([r.motivo, r.numero], ["bloqueado", 250]);
  e.carga.bloqueios[0].de = e.carga.bloqueios[0].ate = 250;
  igual(window.portariaValidacao.decidir(e).estado, "permitido");
});
Deno.test("entrada repetida conserva recusa e número impresso", () => {
  const e = entrada();
  e.entradas.c1 = "2026-11-12T11:00:00Z";
  const r = window.portariaValidacao.decidir(e);
  igual([r.motivo, r.numero], ["ja_entrou", 250]);
});
Deno.test("reentrada online e setor não autorizado também apresentam número impresso", () => {
  const e = entrada();
  e.carga.setores[0].tipo_uso = "reentrada";
  e.presencaOnline = true;
  igual(window.portariaValidacao.decidir(e).numero, 250);
  e.carga.aparelho.setores = [];
  const r = window.portariaValidacao.decidir(e);
  igual([r.motivo, r.numero], ["setor_nao_autorizado", 250]);
});
Deno.test("cache antigo sem ni e número zero continuam legíveis", () => {
  for (const ni of [null, "250", -1, 1.5]) igual(window.portariaValidacao.decidir(entrada(ni)).numero, 150);
  const e = entrada();
  delete (e.carga.credenciais[0] as any).ni;
  igual(window.portariaValidacao.decidir(e).numero, 150);
  igual(window.portariaValidacao.decidir(entrada(0)).numero, 0);
});
Deno.test("número impresso sobrevive armazenamento offline e sincronismo", () => {
  const e = entrada();
  const carga = JSON.parse(JSON.stringify(e.carga));
  const sincronizada = window.portariaSincronismo.aplicar(carga, { bloqueios: [] });
  igual(window.portariaValidacao.decidir({ ...e, carga: sincronizada }).numero, 250);
  igual(sincronizada.credenciais[0].n, 150);
});

Deno.test("ambiguidade apresenta o número de cada setor; desconhecido não ganha número", () => {
  const e = entrada();
  e.carga.aparelho.setores.push("s2");
  e.carga.setores.push({ id: "s2", nome: "Outro", tipo_uso: "unico" });
  e.carga.credenciais.push({ id: "c2", s: "s2", h: "hash-sintetico", n: 150, ni: 950 });
  const r = window.portariaValidacao.decidir(e);
  igual(r.estado, "ambiguo");
  igual(r.candidatos.map((c: any) => c.numero), [250, 950]);
  e.hashes = ["desconhecido"];
  const negado = window.portariaValidacao.decidir(e);
  igual([negado.motivo, negado.numero], ["desconhecido", null]);
});
