import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  montarMeusPedidos,
  nomeDaFicha,
  pertenceAConta,
  precisaDeSenha,
} from "./puro.ts";

Deno.test("posse: o evento e da conta que o criou, mesmo sem cliente ligado", () => {
  assert(pertenceAConta({ dono_auth_id: "u1", id_cliente: 14 }, "u1", []));
});

Deno.test("posse: o evento e de toda conta ligada ao MESMO cliente", () => {
  assert(pertenceAConta({ dono_auth_id: "u1", id_cliente: 14 }, "u2", [14, 60928]));
});

Deno.test("posse: outra conta, outro cliente -- nao", () => {
  assert(!pertenceAConta({ dono_auth_id: "u1", id_cliente: 14 }, "u2", [8469]));
  assert(!pertenceAConta({ dono_auth_id: "u1", id_cliente: null }, "u2", [14]));
  assert(!pertenceAConta({}, "u2", []));
});

const ENTRADA = {
  propostas: [
    { id_int: 20272, id_cliente: 14, created_at: "2026-08-12T10:00:00Z", status_interno: "APROVADO" },
    { id_int: 20281, id_cliente: 14, created_at: "2026-08-15T10:00:00Z", status_interno: "cancelado " },
    { id_int: 20300, id_cliente: 14, created_at: "2026-08-16T10:00:00Z", status_interno: null },
    { id_int: 20310, id_cliente: 14, created_at: "2026-08-17T10:00:00Z", status_interno: "NOVO" },
    { id_int: 20320, id_cliente: 14, created_at: "2026-08-17T11:00:00Z", status_interno: "NOVO" },
  ],
  legiveisPorPedido: {
    20272: [{ modelo_id: 1, nome: "PISTA", quantidade: 1500 }, { modelo_id: 2, nome: "VIP", quantidade: 300 }],
    20281: [{ modelo_id: 3, nome: "CAMAROTE", quantidade: 80 }],
    20300: [{ modelo_id: 4, nome: "PISTA", quantidade: 100 }],   // legivel, mas nada impresso
    20310: [],                                                       // sem modelo legivel
    20320: [{ modelo_id: 5, nome: "PISTA", quantidade: 10 }],    // ja carregado
  },
  credenciaisPorPedidoModelo: { "20272:1": 1500, "20272:2": 0, "20281:3": 80, "20320:5": 10 },
  fichasPorPedido: { 20272: { nome_evento: "Click", data_evento: "2026-09-12T22:00:00Z", local_evento: "Arena" } },
  carregados: [20320],
};

Deno.test("meus pedidos: so o impresso, legivel, nao cancelado, nao carregado", () => {
  const r = montarMeusPedidos(ENTRADA);
  assertEquals(r.map((p: any) => p.pedido), [20272]);
});

Deno.test("meus pedidos: o cartao traz a ficha e a situacao de impressao por modelo", () => {
  const p = montarMeusPedidos(ENTRADA)[0];
  assertEquals(p.nome_evento, "Click");
  assertEquals(p.local_evento, "Arena");
  assertEquals(p.data, "2026-08-12");
  assertEquals(p.setores.map((s: any) => [s.nome, s.impresso]), [["PISTA", true], ["VIP", false]]);
});

Deno.test("meus pedidos: do mais recente ao mais antigo", () => {
  // O mais novo (20100) tem o MENOR numero de pedido de proposito: uma
  // regressao que ordenasse por id em vez de created_at ainda passaria se o
  // mais recente tivesse o maior numero.
  const entrada = {
    ...ENTRADA,
    propostas: [
      ...ENTRADA.propostas,
      { id_int: 20100, id_cliente: 14, created_at: "2026-08-18T10:00:00Z", status_interno: "NOVO" },
    ],
    legiveisPorPedido: {
      ...ENTRADA.legiveisPorPedido,
      20100: [{ modelo_id: 9, nome: "PISTA", quantidade: 5 }],
    },
    credenciaisPorPedidoModelo: { ...ENTRADA.credenciaisPorPedidoModelo, "20100:9": 5 },
    carregados: [],
  };
  const tres = montarMeusPedidos(entrada);
  assertEquals(tres.map((p: any) => p.pedido), [20100, 20320, 20272]);
});

Deno.test("nome da ficha: vazio vira 'Pedido N'", () => {
  assertEquals(nomeDaFicha({ nome_evento: "  Click " }, 20272), "Click");
  assertEquals(nomeDaFicha({ nome_evento: "" }, 20272), "Pedido 20272");
  assertEquals(nomeDaFicha(null, 20272), "Pedido 20272");
});

// ── "Entrar libera 15 minutos" ──────────────────────────────────────────────

Deno.test("senha: sem bilhete de conta, ela continua obrigatoria", () => {
  assert(precisaDeSenha("", false));
  assert(precisaDeSenha("segredo1", false));
});

Deno.test("senha: com bilhete de conta e campo vazio, nao se pede senha", () => {
  assert(!precisaDeSenha("", true));
});

Deno.test("senha DIGITADA e conferida mesmo com bilhete de conta valido", () => {
  // Se ela passasse calada, quem digitou errado nunca saberia que errou a senha
  // da propria conta -- e descobriria isso na proxima tela que a pedisse.
  assert(precisaDeSenha("errada", true));
});

Deno.test("senha: nulo e indefinido contam como campo vazio", () => {
  assert(!precisaDeSenha(null as unknown as string, true));
  assert(!precisaDeSenha(undefined as unknown as string, true));
  assert(precisaDeSenha(undefined as unknown as string, false));
});
