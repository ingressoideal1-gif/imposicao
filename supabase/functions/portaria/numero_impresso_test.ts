import { assertEquals, assertMatch } from "jsr:@std/assert@1";
import { hashCodigo } from "../_compartilhado/hash.ts";
const assert = { equal: assertEquals, deepEqual: assertEquals, match: assertMatch };

Deno.test("faixa: paginação, número impresso, isolamento e atualização de carga antiga", async () => {
  const servir = Deno.serve, buscar = globalThis.fetch, ambiente = Deno.env.get;
  let handler!: (req: Request) => Promise<Response>;
  let consultasContratos = 0;
  const evento = "11111111-1111-4111-8111-111111111111";
  const dispositivo = "22222222-2222-4222-8222-222222222222";
  const setor = "33333333-3333-4333-8333-333333333333";
  const c = { id: "c1", codigo_hash: "hash-sintetico", setor_id: setor, numero: 150,
    origem: "qr_ideal", pedido_id_int: 24585, modelo_id: 1005802 };
  const salTicket = "ab".repeat(32);
  const numeracao = "44444444-4444-4444-8444-444444444444";
  const ticket = { ...c, pedido_id_int: 123, modelo_id: 456 };
  const extra = { ...ticket, id: "via1", numero: 4, codigo_hash: await hashCodigo("TESTE-0021", salTicket) };
  const fixo = { ...ticket, id: "via2", numero: 1, codigo_hash: await hashCodigo("TESTE-0022", salTicket) };
  const modificado = { ...ticket, id: "divergente", numero: 6, codigo_hash: await hashCodigo("OUTRO-0025", salTicket) };
  try {
    Deno.serve = ((fn: typeof handler) => { handler = fn; return {}; }) as unknown as typeof Deno.serve;
    Deno.env.get = (key) => key === "SUPABASE_URL" ? "https://teste.invalid" :
      key === "SUPABASE_SERVICE_ROLE_KEY" ? "sintetico" : undefined;
    globalThis.fetch = async (input, init) => {
      const u = new URL(String(input));
      assert.equal(u.hostname, "teste.invalid");
      const tabela = u.pathname.replace("/rest/v1/", "");
      let linhas: any;
      if (tabela === "rpc/producao_acesso_qr_leitor_evento") {
        assert.equal(init?.method, "POST");
        assert.deepEqual(JSON.parse(String(init?.body)), { p_evento: evento });
        linhas = 2;
      } else {
        assert.equal(init?.method, "GET");
        switch (tabela) {
          case "producao_acesso_dispositivos": linhas = [{ id: dispositivo, evento_id: evento }]; break;
          case "producao_acesso_pedidos":
            assert.equal(u.searchParams.get("evento_id"), `eq.${evento}`);
            linhas = [
              { pedido_id_int: 24585, publicado_em: "2026-11-10T19:39:10Z", total_credenciais: 870, sal: "sintetico" },
              { pedido_id_int: 123, publicado_em: "2026-11-10T19:39:10Z", total_credenciais: 6, sal: salTicket },
            ];
            break;
          case "producao_acesso_eventos": linhas = [{ id: evento, status: "ativo" }]; break;
          case "producao_acesso_setores": linhas = [{ id: setor, nome: "Teste", tipo_uso: "unico" }]; break;
          case "producao_acesso_bloqueios": linhas = [{ setor_id: setor, de: 150, ate: 150, motivo: "Teste" }]; break;
          case "producao_acesso_dispositivo_setores": linhas = [{ setor_id: setor }]; break;
          case "producao_acesso_credenciais": {
            assert.equal(u.searchParams.get("evento_id"), `eq.${evento}`);
            assert.equal(u.searchParams.get("limit"), "501");
            const offset = Number(u.searchParams.get("offset"));
            linhas = offset === 0 ? Array.from({ length: 501 }, (_, i) => ({ ...c, id: `c${i}` })) :
              [{ ...c, id: "cliente", origem: "cliente" }, fixo, extra, modificado]; break;
          }
          case "producao_acesso_qr_contratos":
            consultasContratos++;
            if (consultasContratos === 1) {
              assert.equal(u.searchParams.get("or"), "(and(pedido.eq.24585,modelo.eq.1005802))");
              linhas = [{ pedido: 24585, modelo: 1005802, versao: 2, inicio: 101, passo: 1, posicao: 1, quantidade: 150 }];
            } else {
              assert.equal(u.searchParams.get("or"), "(and(pedido.eq.123,modelo.eq.456))");
              linhas = [];
            }
            break;
          case "producao_acesso_preparacoes":
            assert.equal(u.searchParams.get("pedido_id_int"), "in.(123)");
            linhas = [{ pedido_id_int: 123, proximo: 3, plano: [
              { modelo: 456, quantidade: 3, inicio: 21, passo: 2, tipo: "QR", posicao: 2, prefix: "TESTE-", suffix: "", pad: 4 },
            ] }];
            break;
          case "pedidos_modelos":
            assert.equal(u.searchParams.get("or"), "(and(id_int.eq.123,id.eq.456))");
            linhas = [{ id_int: 123, id: 456, quantidade: 3, numeracao_inicio: 21, amostra_num_id: numeracao }];
            break;
          case "producao_numeracoes":
            linhas = [{ id: numeracao, tipo: "TICKET", ticket_qtd: 2, elements: [
              { type: "QR", ticket_pos: 2, prefix: "TESTE-", pad: 4 },
              { type: "QR", ticket_pos: 1, prefix: "TESTE-", pad: 4 },
              { type: "TEXT", ticket_pos: 2, pad: 5 },
              { type: "TEXT", ticket_pos: 1, pad: 5 },
            ] }];
            break;
          default: throw new Error(`Consulta inesperada: ${tabela}`);
        }
      }
      return new Response(JSON.stringify(linhas));
    };
    await import("./index.ts");
    const chamar = (desde: number, auth = true, leitor = 2) => handler(new Request(
      `https://teste.invalid/functions/v1/portaria/faixa?desde=${desde}&leitor=${leitor}`,
      { headers: auth ? { Authorization: "Bearer sintetico" } : {} }));
    assert.equal((await chamar(0, false)).status, 401);
    assert.equal(consultasContratos, 0);
    assert.equal((await chamar(0, true, 1)).status, 426);
    const resposta = await chamar(0);
    assert.equal(resposta.status, 200);
    const carga = await resposta.json();
    assert.equal(carga.credenciais.length, 500);
    assert.equal(carga.proxima, 500);
    assert.deepEqual(carga.credenciais[0], { id: "c0", h: "hash-sintetico", s: setor, n: 150, ni: 250 });
    assert.equal(carga.bloqueios[0].de, 150);
    assert.match(carga.publicacao.versao, /^numero-impresso-v1:vias:/);
    assert.equal(consultasContratos, 1);
    const ultima = await (await chamar(500)).json();
    assert.equal(ultima.proxima, null);
    assert.equal(ultima.credenciais[0].n, 150);
    assert.equal(ultima.credenciais[0].ni, undefined);
    assert.deepEqual(ultima.credenciais[1], { id: "via2", s: setor, h: fixo.codigo_hash, n: 1, ni: 22, np: 5 });
    assert.deepEqual(ultima.credenciais[2], { id: "via1", s: setor, h: extra.codigo_hash, n: 4, ni: 21, np: 5 });
    assert.equal(ultima.credenciais[3].ni, undefined);
    assert.equal(consultasContratos, 2);
    const window: any = {};
    new Function("window", Deno.readTextFileSync(new URL("../../../frontend/portaria-validacao.js", import.meta.url)))(window);
    const r = window.portariaValidacao.decidir({ carga, hashes: ["hash-sintetico"], entradas: {}, agora: "2026-11-12T12:00:00Z" });
    assert.equal(r.numero, 250);
    assert.equal(r.motivo, "bloqueado");
    assert.equal(r.credencial_id, "c0");
    ultima.publicacao_baixada = ultima.publicacao.versao;
    const leitura = { carga: ultima, hashes: [extra.codigo_hash], entradas: {}, agora: "2026-11-12T12:00:00Z" };
    const camera = window.portariaValidacao.decidir(leitura);
    const digitado = window.portariaValidacao.decidir({ ...leitura, numeroDigitado: "00021" });
    assert.equal(camera.estado, "permitido");
    assert.equal(camera.numero, "00021");
    assert.equal(camera.credencial_id, "via1");
    assert.deepEqual(digitado, camera);
  } finally { Deno.serve = servir; globalThis.fetch = buscar; Deno.env.get = ambiente; }
});
