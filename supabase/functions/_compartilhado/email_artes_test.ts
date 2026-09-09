import { strict as assert } from "node:assert";
import { operarEmailArtes } from "./email_artes.ts";
import { Recusa } from "./sessao.ts";
import type { MensagemArte } from "./smtp_artes.ts";

const env: Record<string, string | undefined> = {
  EMAIL_ARTES_SMTP_HOST: "smtp.example.com", EMAIL_ARTES_SMTP_USER: "arte@example.com",
  EMAIL_ARTES_SMTP_PASSWORD: "senha-sintetica", EMAIL_ARTES_REMETENTE: "arte@example.com",
};
const quem = { id: "operador-sintetico", email: "operador@example.com", permissoes: { perm_lista_arte_view: true } };
const link = { os_id: "vibe_11", numero_pedido: "11", token: "abc123" };
const url = "https://imposition.ai-ideal.com.br/cliente/11-abc123";
const entrada = { os_id: link.os_id, to: "cliente@example.com", subject: "Aprovação de arte", link_url: url, body_text: "Confira: " + url };
function contexto(linhas: unknown = [link], propostas: unknown = [{id_int:11,texto_whatsapp:"Total do pedido: R$ 148,05\nPagamento: Pix"}]) {
  const enviadas: MensagemArte[] = [], consultas: string[] = [];
  return { enviadas, consultas, deps: {
    ambiente: (nome: string) => env[nome],
    consultar: async (metodo: string, caminho: string) => {
      assert.equal(metodo, "GET"); consultas.push(caminho);
      return caminho.startsWith("propostas?") ? propostas : linhas;
    },
    enviar: async (_config: unknown, mensagem: MensagemArte) => { enviadas.push(mensagem); },
  } };
}
async function recusa(status: number, f: () => Promise<unknown>) {
  await assert.rejects(f, (e: unknown) => e instanceof Recusa && e.status === status);
}

Deno.test("email: todos os perfis com leitura enviam sem permissão administrativa", async () => {
  for (const role of ["designer", "atendimento", "impressor", "financeiro", "visualizador", "admin"]) {
    const c = contexto();
    const r = await operarEmailArtes("enviar", entrada, { ...quem, permissoes: { ...quem.permissoes, role } }, c.deps);
    assert.equal(r.ok, true); assert.equal(c.enviadas.length, 1);
    assert.ok(c.enviadas[0].text.startsWith(entrada.body_text));
    assert.ok(c.enviadas[0].html?.includes(`href="${url}"`));
    assert.match(c.enviadas[0].text, /phone=555195343478/);
    assert.equal(c.consultas[0], "pedidos_links_cliente?os_id=eq.vibe_11&ativo=eq.true&select=os_id,numero_pedido,token&limit=2");
    assert.equal(c.consultas[1], "propostas?id_int=eq.11&select=id_int,texto_whatsapp,vendedor&limit=2");
    assert.match(c.enviadas[0].html!, /Resumo do Orçamento[\s\S]*R\$ 148,05/);
    assert.match(c.enviadas[0].text, /Pagamento: Pix/);
  }
});
Deno.test("email: anônimo, cliente sem grade e usuário sem acesso não consultam nem enviam", async () => {
  const c = contexto();
  await recusa(401, () => operarEmailArtes("enviar", entrada, { ...quem, id: "" }, c.deps));
  for (const permissoes of [null, {}, { role: "admin" }, { perm_lista_arte_view: false }]) {
    await recusa(403, () => operarEmailArtes("enviar", entrada, { ...quem, permissoes }, c.deps));
  }
  assert.equal(c.consultas.length, 0); assert.equal(c.enviadas.length, 0);
});
Deno.test("email: configuração devolve somente remetente, nome e disponibilidade", async () => {
  const c = contexto();
  const r = await operarEmailArtes("config", {}, quem, c.deps);
  assert.deepEqual(r.config, { email_remetente: "arte@example.com", nome_remetente: "Ingresso Ideal — Atendimento", configurado: true });
  assert.equal(JSON.stringify(r).includes(env.EMAIL_ARTES_SMTP_PASSWORD!), false);
  assert.equal(JSON.stringify(r).includes(env.EMAIL_ARTES_SMTP_HOST!), false);
});
Deno.test("email: configuração ausente, porta bloqueada ou TLS inválido não disparam", async () => {
  for (const ambiente of [() => undefined, (k: string) => k === "EMAIL_ARTES_SMTP_PORT" ? "587" : env[k],
    (k: string) => k === "EMAIL_ARTES_PORTAL_URL" ? "http://example.com" : env[k]]) {
    const c = contexto(); c.deps.ambiente = ambiente;
    assert.equal((await operarEmailArtes("config", {}, quem, c.deps)).config?.configurado, false);
    await recusa(503, () => operarEmailArtes("enviar", entrada, quem, c.deps));
    assert.equal(c.enviadas.length, 0);
  }
});
Deno.test("email: não aceita sobrescrever SMTP, remetente, HTML, autor ou destinatário de teste", async () => {
  for (const campo of ["smtp_config", "from", "body_html", "autor", "empresa_id", "orcamento", "vendedor", "atendente"]) {
    const c = contexto();
    await recusa(422, () => operarEmailArtes("enviar", { ...entrada, [campo]: "forjado" }, quem, c.deps));
    assert.equal(c.consultas.length, 0); assert.equal(c.enviadas.length, 0);
  }
  const c = contexto();
  await recusa(422, () => operarEmailArtes("testar", { to: "outro@example.com" }, quem, c.deps));
  await operarEmailArtes("testar", {}, quem, c.deps);
  assert.equal(c.enviadas[0].to, quem.email); assert.equal(c.consultas.length, 0);
});
Deno.test("email: assinatura desatualizada cede ao atendimento cadastrado na proposta", async () => {
  for (const vendedor of ['Alexandre Almeida', 'Emily Boeira']) {
    const c = contexto([link], [{id_int:11,texto_whatsapp:'Total: R$ 148,05',vendedor}]);
    await operarEmailArtes('enviar', {...entrada, body_text: entrada.body_text + '\n\nAtenciosamente,\nAtendimento: Nome antigo'}, quem, c.deps);
    assert.ok(c.enviadas[0].text.includes('Atendimento: ' + vendedor));
    assert.ok(c.enviadas[0].html?.includes('Atendimento: ' + vendedor));
    assert.doesNotMatch(c.enviadas[0].text, /Nome antigo/);
    assert.ok(c.enviadas[0].text.includes(encodeURIComponent('Olá, ' + vendedor + '!')));
  }
});
Deno.test("email: orcamento ausente nao inventa valores; divergencia e falha impedem envio", async () => {
  for (const proposta of [[], [{id_int:11,texto_whatsapp:null}], [{id_int:11,texto_whatsapp:""}]]) {
    const c = contexto([link], proposta);
    await operarEmailArtes("enviar", entrada, quem, c.deps);
    assert.match(c.enviadas[0].text, /Resumo não disponível/);
    assert.doesNotMatch(c.enviadas[0].text, /R\$ 0/);
  }
  for (const proposta of [[{id_int:22,texto_whatsapp:"Outro cliente"}], [{id_int:11},{id_int:11}], null]) {
    const c = contexto([link], proposta);
    await recusa(409, () => operarEmailArtes("enviar", entrada, quem, c.deps));
    assert.equal(c.enviadas.length, 0);
  }
  const c = contexto();
  await recusa(503, () => operarEmailArtes("enviar", entrada, quem, {...c.deps,
    consultar: async (_metodo, caminho) => { if (caminho.startsWith('propostas?')) throw new Error('privado'); return [link]; },
  }));
  assert.equal(c.enviadas.length, 0);
});
Deno.test("email: valida destinatário, cabeçalho, tamanho, corpo e id antes de consultar", async () => {
  for (const alteracao of [
    { to: "a@example.com,b@example.com" }, { to: "a@example.com\r\nBcc: b@example.com" },
    { subject: "Arte\r\nBcc: b@example.com" }, { subject: "x".repeat(201) },
    { body_text: "x".repeat(50001) }, { body_text: "\0" }, { body_text: "" },
    { os_id: "vibe_11&select=*" }, { os_id: "vibe_11),os_id.gt.0" },
  ]) {
    const c = contexto();
    await recusa(422, () => operarEmailArtes("enviar", { ...entrada, ...alteracao }, quem, c.deps));
    assert.equal(c.consultas.length, 0); assert.equal(c.enviadas.length, 0);
  }
});
Deno.test("email: link inexistente, inativo, ambíguo ou de outro pedido não envia", async () => {
  for (const linhas of [[], [link, link], [{ ...link, os_id: "vibe_22" }], [{ ...link, token: "" }]]) {
    const c = contexto(linhas);
    await recusa(409, () => operarEmailArtes("enviar", entrada, quem, c.deps));
    assert.equal(c.enviadas.length, 0);
  }
});
Deno.test("email: impede token, origem, query, credenciais e mensagem sem link divergentes", async () => {
  for (const link_url of [url.replace("abc123", "xyz999"), url.replace("11-", "22-"),
    url.replace("imposition.ai-ideal.com.br", "evil.example"), url + "?x=1", url + "#x",
    url.replace("https://", "https://usuario@")]) {
    const c = contexto();
    await recusa(409, () => operarEmailArtes("enviar", { ...entrada, link_url, body_text: link_url }, quem, c.deps));
    assert.equal(c.enviadas.length, 0);
  }
  await recusa(409, () => operarEmailArtes("enviar", { ...entrada, body_text: "Sem link" }, quem, contexto().deps));
});
Deno.test("email: OS local e links legados são enviados com o domínio público", async () => {
  const os_id = "00000000-0000-0000-0000-000000000001";
  for (const origem of ["http://localhost:9000", "https://imposicao.vercel.app"]) {
    const c = contexto([{ ...link, os_id }]);
    const link_url = origem + "/cliente/11-abc123";
    await operarEmailArtes("enviar", { ...entrada, os_id, link_url, body_text: link_url }, quem, c.deps);
    assert.ok(c.enviadas[0].text.startsWith(url));
    assert.ok(c.enviadas[0].html?.includes(`href="${url}"`));
  }
});
Deno.test("email: falhas de banco e SMTP não expõem detalhes nem produzem sucesso", async () => {
  const c = contexto();
  const segredo = "segredo-sintetico-nao-expor";
  await recusa(503, () => operarEmailArtes("enviar", entrada, quem, { ...c.deps, consultar: () => { throw new Error(segredo); } }));
  await assert.rejects(() => operarEmailArtes("enviar", entrada, quem, { ...c.deps, enviar: () => { throw new Error(segredo); } }),
    (e: unknown) => e instanceof Recusa && e.status === 502 && !e.message.includes(segredo));
  assert.equal(c.enviadas.length, 0);
});
