import { strict as assert } from "node:assert";
import { operarEmailArtes } from "./email_artes.ts";
import { validarModelosEmail } from "./email_artes_corpo.ts";
import { mensagemMime, type MensagemArte } from "./smtp_artes.ts";
import { Recusa } from "./sessao.ts";

// PNG 1x1 sintético; nunca consulta dados reais ou abre conexão SMTP.
const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1X8AAAAASUVORK5CYII=";
const frente = { face: "frente", pagina: 1, dados: png };
const verso = { face: "verso", pagina: 1, dados: png };
const corpo = { os_id: "vibe_11",
  to: "cliente@example.com", subject: "Artes", body_text: "Olá! <script>alert(1)</script>\nConfira as artes abaixo.",
  modo: "artes_corpo", modelos: [{ id: "1", imagens: [frente, verso] }, { id: "2", imagens: [frente, { ...frente, pagina: 2 }] }] };
const quem = { id: "operador-sintetico", email: "operador@example.com", permissoes: { perm_lista_arte_view: true } };
const env: Record<string, string> = { EMAIL_ARTES_SMTP_HOST: "smtp.example.com", EMAIL_ARTES_SMTP_PASSWORD: "sintetica" };
const registros = [
  { id: 1, nome_modelo: 'Ingresso <img src=x onerror="x">', quantidade: 100, padrao: "Azul", gabarito_operacional: "001 a 100", verso_tipo: "FxVerso" },
  { id: 2, nome_modelo: "Credencial", quantidade: 20, padrao: "Verde", verso_tipo: "Frente" },
];
function contexto(linhas: unknown = registros) {
  const enviadas: MensagemArte[] = [], consultas: string[] = [];
  return { enviadas, consultas, deps: {
    ambiente: (k: string) => env[k],
    consultar: async (metodo: string, caminho: string) => {
      assert.equal(metodo, "GET"); consultas.push(caminho);
      assert.match(caminho, /^pedidos_modelos\?id_int=eq\.11&select=/);
      return linhas;
    },
    enviar: async (_config: unknown, mensagem: MensagemArte) => { enviadas.push(mensagem); },
  } };
}
const recusa = (status: number) => (e: unknown) => e instanceof Recusa && e.status === status;

Deno.test("artes no corpo: todos os modelos, frente/verso e páginas, sem portal ou pagamento", async () => {
  const c = contexto();
  assert.equal((await operarEmailArtes("enviar", corpo, quem, c.deps)).ok, true);
  const m = c.enviadas[0];
  assert.equal(m.imagens?.length, 4);
  assert.equal(c.consultas.length, 1);
  assert.match(m.html!, /Quantidade: 100/);
  assert.match(m.html!, /Credencial/);
  assert.match(m.html!, /src="cid:arte-1-verso-1"/);
  assert.match(m.html!, /src="cid:arte-2-frente-2"/);
  assert.match(m.html!, /&lt;script&gt;/);
  assert.match(m.html!, /&lt;img src=x/);
  assert.doesNotMatch(m.html!, /<script|<img src=x|href=|https?:\/\/|\/cliente\/|Abrir painel|Pagar pedido/);
  assert.doesNotMatch(m.text, /\/cliente\/|abc123/);
  assert.match(m.text, /001 a 100/);
  const mime = mensagemMime({ host: "smtp.example.com", usuario: "u", senha: "s", remetente: "arte@example.com", nome: "Arte" }, m);
  assert.match(mime, /multipart\/related/);
  assert.match(mime, /multipart\/alternative/);
  assert.equal((mime.match(/Content-Disposition: inline;/g) || []).length, 4);
  assert.equal((mime.match(/Content-ID: <arte-/g) || []).length, 4);
  for (const imagem of m.imagens!) {
    assert.ok(mime.includes(`Content-ID: <${imagem.cid}>`));
    assert.ok(m.html!.includes(`cid:${imagem.cid}`));
    assert.ok(mime.includes(imagem.base64.match(/.{1,76}/g)!.join("\r\n")));
  }
});

Deno.test("artes no corpo: faltando modelo, modelo estranho ou verso impede envio", async () => {
  for (const modelos of [corpo.modelos.slice(0, 1), [...corpo.modelos, { id: "3", imagens: [frente] }],
    [{ id: "3", imagens: [frente] }, corpo.modelos[1]], [{ id: "1", imagens: [frente] }, corpo.modelos[1]]]) {
    const c = contexto();
    await assert.rejects(() => operarEmailArtes("enviar", { ...corpo, modelos }, quem, c.deps), recusa(409));
    assert.equal(c.enviadas.length, 0);
  }
});

Deno.test("artes no corpo: imagens inválidas, HTML, URL remota, repetição e limites", () => {
  for (const imagens of [[], [verso], [frente, frente], [{ ...frente, pagina: 0 }],
    [{ ...frente, dados: "https://example.com/a.png" }], [{ ...frente, dados: "data:image/svg+xml;base64,PHN2Zz4=" }],
    [{ ...frente, dados: "data:image/png;base64,PHNjcmlwdD4=" }], [{ ...frente, dados: png, html: "<script>" }],
    [{ ...frente, dados: "data:image/png;base64," + "A".repeat(1500000) }]]) {
    assert.throws(() => validarModelosEmail([{ id: "1", imagens }]), recusa(422));
  }
  assert.throws(() => validarModelosEmail([corpo.modelos[0], corpo.modelos[0]]), recusa(422));
  assert.throws(() => validarModelosEmail(Array.from({ length: 101 }, (_, i) => ({ id: String(i), imagens: [frente] }))), recusa(422));
  assert.throws(() => validarModelosEmail([{ id: "1", imagens: Array.from({ length: 101 }, (_, i) => ({ ...frente, pagina: i + 1 })) }]), recusa(413));
  const grande = "data:image/png;base64," + btoa("\x89PNG\r\n\x1a\n" + "x".repeat(900000));
  assert.throws(() => validarModelosEmail([{ id: "1", imagens: Array.from({ length: 10 }, (_, i) => ({ ...frente, pagina: i + 1, dados: grande })) }]), recusa(413));
});

Deno.test("artes no corpo: sessão, texto sem link e falhas continuam protegidos", async () => {
  for (const [entrada, usuario, status] of [
    [corpo, { ...quem, id: "" }, 401], [corpo, { ...quem, permissoes: {} }, 403],
    [{ ...corpo, link_url: "https://example.com/cliente/11-abc123" }, quem, 422],
    [{ ...corpo, body_text: "https://example.com/cliente/11-abc123" }, quem, 422],
    [{ ...corpo, modo: "outro" }, quem, 422],
    [{ ...corpo, body_html: "<img>" }, quem, 422],
  ] as const) {
    const c = contexto();
    await assert.rejects(() => operarEmailArtes("enviar", entrada, usuario, c.deps), recusa(status));
    assert.equal(c.enviadas.length, 0);
  }
  const c = contexto();
  await assert.rejects(() => operarEmailArtes("enviar", corpo, quem, { ...c.deps,
    consultar: async (metodo, caminho) => { if (caminho.startsWith("pedidos_modelos")) throw new Error("falha"); return await c.deps.consultar(metodo, caminho); },
  }), recusa(503));
  assert.equal(c.enviadas.length, 0);
});

Deno.test("artes no corpo: OS UUID resolve o número sem depender de link do cliente", async () => {
  const os_id = "00000000-0000-0000-0000-000000000001";
  const c = contexto();
  const deps = { ...c.deps, consultar: async (metodo: string, caminho: string) => {
    if (caminho.startsWith("producao_ordens_servico?")) return [{ id: os_id, numero: 11 }];
    return await c.deps.consultar(metodo, caminho);
  } };
  await operarEmailArtes("enviar", { ...corpo, os_id }, quem, deps);
  assert.equal(c.enviadas.length, 1);
  await assert.rejects(() => operarEmailArtes("enviar", { ...corpo, os_id }, quem, {
    ...c.deps, consultar: async () => [],
  }), recusa(409));
});
