import assert from "node:assert/strict";
import { operarWhatsappArtes, telefoneWhatsApp } from "./whatsapp_artes.ts";
import { Recusa } from "./sessao.ts";
const quem = { id: "00000000-0000-4000-8000-000000000001", permissoes: { perm_lista_arte_view: true } };
function fixture() {
  const registros = new Map<string, any>();
  const env: Record<string, string> = { CHATGURU_ENDPOINT: "https://s1.chatguru.app/api/v1", CHATGURU_KEY: "sintetica", CHATGURU_ACCOUNT_ID: "conta", CHATGURU_PHONE_ID: "telefone", CHATGURU_DEFAULT_DDI: "55" };
  const c = { env, registros, chamadas: [] as URLSearchParams[], recusado: false, timeout: false, falharPersistencia: false,
    status: "scheduled", ocupado: false, timeoutDialogo: false, contato: { id: 7, id_cliente: 1, nome_contato: "Contato Exemplo", whats: "11999990000" },
    proposta: { id_int: 11, id_contato: "7", id_cliente: 1, id_faturado: 2 },
    link: { os_id: "vibe_11", numero_pedido: 11, token: "abc123", arte_pronta_em: "2026-11-06T12:00:00Z" } };
  const deps = {
    ambiente: (k: string) => env[k],
    consultar: async (metodo: string, caminho: string, corpo?: any) => {
      if (caminho.startsWith("pedidos_links_cliente?")) return [c.link];
      if (caminho.startsWith("propostas?")) return [c.proposta];
      if (caminho.startsWith("contatos?")) { assert.ok(caminho.includes("id=eq.7")); return [c.contato]; }
      if (caminho === "rpc/imposition_whatsapp_dialogo_finalizar") {
        if (c.falharPersistencia) return [];
        const r = { ...registros.get(corpo.p_chave), estado: corpo.p_estado, dialogo_executado: corpo.p_estado === "aguardando" };
        registros.set(corpo.p_chave, r); return [r];
      }
      if (caminho === "rpc/imposition_whatsapp_dialogo_reservar") {
        if (c.ocupado) return "ocupado";
        if (corpo.p_repetir) {
          const atual = registros.get(corpo.p_chave);
          if (atual?.estado !== "falhou" || atual?.message_id) return "existente";
          registros.set(corpo.p_chave, { ...atual, estado: "preparando" });
          return "reservado";
        }
        if (registros.has(corpo.p_chave)) return "existente";
        registros.set(corpo.p_chave, { chave: corpo.p_chave, estado: "preparando", message_id: null, concluido: false });
        return "reservado";
      }
      const chave = /chave=eq.([a-f0-9]+)/.exec(caminho)?.[1] || "";
      if (metodo === "PATCH") {
        if (c.falharPersistencia) return [];
        const r = { ...registros.get(chave), ...corpo }; registros.set(chave, r); return [r];
      }
      return registros.has(chave) ? [registros.get(chave)] : [];
    },
    fetch: (async (_url: any, op: any) => {
      assert.equal(op.redirect, "error");
      assert.equal(op.headers["Content-Type"], "application/x-www-form-urlencoded");
      const body = new URLSearchParams(op.body); c.chamadas.push(body);
      if (c.timeout || (c.timeoutDialogo && body.get("action") === "dialog_execute")) throw new Error("erro privado do provedor");
      const status = body.get("action") === "message_status";
      return Response.json(c.recusado ? { result: "error", code: 400, description: "dados privados" } :
        { result: "success", code: 200, message_id: "msg-sintetica", message_status: c.status }, { status: c.recusado ? 400 : 200 });
    }) as typeof fetch
  };
  const executar = (acao: string, extra = {}) => operarWhatsappArtes(acao, { os_id: "vibe_11", ...extra }, quem, deps);
  return { c, deps, executar, preparar: () => executar("preparar") };
}
Deno.test("whatsapp: destinatário selecionado, aceite e status sem novo envio", async () => {
  const f = fixture(), p = await f.preparar();
  assert.equal(p.contato.whatsapp, "5511999990000"); assert.equal(f.c.chamadas.length, 0);
  assert.ok(p.texto.includes("https://imposition.ai-ideal.com.br/cliente/11-abc123"));
  assert.ok(p.texto.includes("modelo de mensagem"));
  const r = await f.executar("enviar", { confirmacao: p.confirmacao });
  assert.equal(r.estado, "aguardando"); assert.equal(r.aceito, true);
  assert.equal(f.c.chamadas[0].get("chat_number"), "5511999990000");
  assert.equal(f.c.chamadas[0].get("field__Link_do_Cliente"), "https://imposition.ai-ideal.com.br/cliente/11-abc123");
  assert.equal(f.c.chamadas[1].get("dialog_id"), "6aef191d04236cee4e7075c1");
  assert.equal(r.dialogo_executado, true);
  await f.executar("enviar", { confirmacao: p.confirmacao });
  assert.equal(f.c.chamadas.length, 2);
  f.c.status = "sent";
  assert.equal((await f.executar("status", { confirmacao: p.confirmacao })).estado, "aguardando");
  assert.deepEqual(f.c.chamadas.map(x => x.get("action")), ["chat_update_custom_fields", "dialog_execute"]);
  assert.equal((await f.executar("concluir", { confirmacao: p.confirmacao })).concluido, true);
  assert.equal((await f.preparar()).concluido, true);
});
Deno.test("whatsapp: concorrência reserva apenas uma chamada", async () => {
  const f = fixture(), p = await f.preparar();
  await Promise.all(Array.from({ length: 5 }, () => f.executar("enviar", { confirmacao: p.confirmacao })));
  assert.equal(f.c.chamadas.length, 2);
});
Deno.test("whatsapp: timeout preserva reserva e nunca repete disparo", async () => {
  const f = fixture(), p = await f.preparar(); f.c.timeout = true;
  assert.equal((await f.executar("enviar", { confirmacao: p.confirmacao })).estado, "desconhecido");
  await f.executar("enviar", { confirmacao: p.confirmacao });
  assert.equal(f.c.chamadas.length, 1);
});
Deno.test("whatsapp: persistência vazia depois do aceite não libera repetição", async () => {
  const f = fixture(), p = await f.preparar(); f.c.falharPersistencia = true;
  await assert.rejects(() => f.executar("enviar", { confirmacao: p.confirmacao }), Recusa);
  f.c.falharPersistencia = false;
  assert.equal((await f.executar("enviar", { confirmacao: p.confirmacao })).estado, "preparando");
  assert.equal(f.c.chamadas.length, 2);
});
Deno.test("whatsapp: rejeição não vaza resposta nem é aceita", async () => {
  const f = fixture(), p = await f.preparar(); f.c.recusado = true;
  const r = await f.executar("enviar", { confirmacao: p.confirmacao });
  assert.equal(r.estado, "falhou"); assert.equal(r.aceito, false);
  assert.ok(!JSON.stringify(r).includes("dados privados"));
  await assert.rejects(() => f.executar("concluir", { confirmacao: p.confirmacao }), Recusa);
});
Deno.test("whatsapp: mudança de telefone ou arte exige nova conferência", async () => {
  const f = fixture(), p = await f.preparar(); f.c.contato.whats = "11999990001";
  await assert.rejects(() => f.executar("enviar", { confirmacao: p.confirmacao }), Recusa);
  assert.equal(f.c.chamadas.length, 0);
});
Deno.test("whatsapp: sem contato ou vínculo inválido não usa cadastro geral", async () => {
  const f = fixture(); f.c.proposta.id_contato = "";
  await assert.rejects(f.preparar, Recusa);
  f.c.proposta.id_contato = "7"; f.c.contato.id_cliente = 99;
  await assert.rejects(f.preparar, Recusa);
  assert.equal(f.c.chamadas.length, 0);
});
Deno.test("whatsapp: sessão, permissão e campos livres recusados", async () => {
  const f = fixture();
  await assert.rejects(() => operarWhatsappArtes("preparar", { os_id: "vibe_11" }, { ...quem, id: "" }, f.deps), Recusa);
  await assert.rejects(() => operarWhatsappArtes("preparar", { os_id: "vibe_11" }, { ...quem, permissoes: {} }, f.deps), Recusa);
  await assert.rejects(() => f.executar("enviar", { to: "11999990000" }), Recusa);
});
Deno.test("whatsapp: endpoint fixo HTTPS e segredo ausente bloqueiam envio", async () => {
  const f = fixture(); f.c.env.CHATGURU_ENDPOINT = "https://example.com/api/v1";
  await assert.rejects(f.preparar, Recusa);
  f.c.env.CHATGURU_ENDPOINT = "https://s1.chatguru.app/api/v1"; f.c.env.CHATGURU_KEY = "";
  await assert.rejects(f.preparar, Recusa);
});
Deno.test("whatsapp: endpoint legado informado aceita envio e preserva idempotência", async () => {
  for (const endpoint of ["https://app.zap.guru/api/v1", "https://app.zap.guru/api/v1/"]) {
    const f = fixture(); f.c.env.CHATGURU_ENDPOINT = endpoint;
    const enviar = f.deps.fetch;
    f.deps.fetch = ((url: any, op: any) => { assert.equal(url, endpoint); return enviar(url, op); }) as typeof fetch;
    const p = await f.preparar();
    assert.equal((await f.executar("enviar", { confirmacao: p.confirmacao })).aceito, true);
    await f.executar("enviar", { confirmacao: p.confirmacao });
    assert.equal(f.c.chamadas.length, 2);
  }
});
Deno.test("whatsapp: endpoint legado não permite outros hosts, credenciais ou parâmetros", async () => {
  for (const endpoint of ["http://app.zap.guru/api/v1", "https://outro.zap.guru/api/v1",
    "https://app.zap.guru.example.com/api/v1", "https://app.zap.guru@evil.example/api/v1",
    "https://app.zap.guru/api/v1?destino=outro", "https://app.zap.guru/api/v1#outro"]) {
    const f = fixture(); f.c.env.CHATGURU_ENDPOINT = endpoint;
    await assert.rejects(f.preparar, /CHATGURU_ENDPOINT/);
    assert.equal(f.c.chamadas.length, 0);
    assert.equal(f.c.registros.size, 0);
  }
});
Deno.test("whatsapp: telefone nacional exige DDI explicitamente configurado", () => {
  assert.throws(() => telefoneWhatsApp("11999990000", ""), Recusa);
  assert.equal(telefoneWhatsApp("(11) 99999-0000", "55"), "5511999990000");
  assert.equal(telefoneWhatsApp("+5511999990000", ""), "5511999990000");
  assert.throws(() => telefoneWhatsApp("telefone 11999990000", "55"), Recusa);
});
Deno.test("whatsapp: repetição explícita só após rejeição confirmada e é atômica", async () => {
  const f = fixture(), p = await f.preparar(); f.c.recusado = true;
  await f.executar("enviar", { confirmacao: p.confirmacao });
  f.c.recusado = false;
  await Promise.all([f.executar("reenviar", { confirmacao: p.confirmacao }), f.executar("reenviar", { confirmacao: p.confirmacao })]);
  assert.equal(f.c.chamadas.length, 3);
  assert.equal((await f.preparar()).aceito, true);
});

Deno.test("whatsapp: mensagem legada aceita não é reenviada por diálogo", async () => {
  const f=fixture(),p=await f.preparar();
  f.c.registros.set(p.confirmacao,{chave:p.confirmacao,estado:"aguardando",message_id:"legado",concluido:false});
  assert.equal((await f.executar("enviar",{confirmacao:p.confirmacao})).aceito,true);
  assert.equal(f.c.chamadas.length,0);
  f.c.status="sent";
  assert.equal((await f.executar("status",{confirmacao:p.confirmacao})).estado,"enviado");
  assert.equal(f.c.chamadas[0].get("action"),"message_status");
});
Deno.test("whatsapp: conversa ocupada impede atualização de campo", async () => {
  const f=fixture(),p=await f.preparar();f.c.ocupado=true;
  await assert.rejects(()=>f.executar("enviar",{confirmacao:p.confirmacao}),/operação pendente/);
  assert.equal(f.c.chamadas.length,0);
});
Deno.test("whatsapp: diálogo incerto não aceita conclusão nem repete", async () => {
  const f=fixture(),p=await f.preparar();f.c.timeoutDialogo=true;
  assert.equal((await f.executar("enviar",{confirmacao:p.confirmacao})).estado,"desconhecido");
  await assert.rejects(()=>f.executar("concluir",{confirmacao:p.confirmacao}),Recusa);
  await f.executar("reenviar",{confirmacao:p.confirmacao});
  assert.equal(f.c.chamadas.length,2);
});
