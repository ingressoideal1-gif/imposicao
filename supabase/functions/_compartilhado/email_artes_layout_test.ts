import { strict as assert } from "node:assert";
import { layoutEmailArte } from "./email_artes_layout.ts";
import { mensagemMime } from "./smtp_artes.ts";

const portal = "https://portal.example";
const link = portal + "/cliente/11-abc123";
Deno.test("layout: remove resumo legado de HTML e texto, preservando aprovacao e contato", () => {
  const texto = `Olá, Cliente!\n\nSuas artes estão prontas.\n\nRESUMO DOS MODELOS DO PEDIDO:\n\n[01] Pulseira\nQuantidade: 5000\nArte: https://storage.example/arte.pdf\n\nLINK DE APROVAÇÃO INTERATIVA:\n${link}`;
  const r = layoutEmailArte(texto, portal, link, "11");
  assert.match(r.html, /Abrir aprovação interativa/);
  assert.match(r.html, /src="https:\/\/vwbtitjlpelrcnsytzqw.supabase.co\/storage\/v1\/object\/public\/app-imagens\/1788972058296_logo_ideal_2027.png"/);
  assert.match(r.html, /src="https:\/\/vwbtitjlpelrcnsytzqw.supabase.co\/storage\/v1\/object\/public\/app-imagens\/1787694554509_Whatsapp.png"/);
  assert.match(r.html, /Falar com meu Atendimento/);
  assert.doesNotMatch(r.html, /Precisa de ajuda com as artes|Nossa equipe de atendimento|Falar com atendente pelo WhatsApp/);
  assert.ok(r.html.includes(`href="${link}"`));
  assert.match(r.html, /phone=555195343478/);
  assert.match(r.text, /Suas artes estão prontas/);
  assert.ok(r.text.includes(link));
  assert.doesNotMatch(r.html + r.text, /RESUMO DOS MODELOS|\[01\] Pulseira|Quantidade|storage.example/);
});
Deno.test("layout: mensagem curta mantem botao antes da despedida e texto editado", () => {
  const texto = `Olá, Cliente!\n\nTexto editado pelo designer.\n\nLINK DE APROVAÇÃO INTERATIVA:\n${link}\n\nAtenciosamente,\nEquipe Ingresso Ideal`;
  const r = layoutEmailArte(texto, portal, link, "11");
  assert.ok(r.text.startsWith(texto.replace('Equipe Ingresso Ideal', 'Atendimento')));
  assert.ok(r.html.indexOf("Texto editado") < r.html.indexOf("Abrir aprovação interativa"));
  assert.ok(r.html.indexOf("Abrir aprovação interativa") < r.html.indexOf("Atenciosamente"));
});
Deno.test("layout: assinatura e WhatsApp usam o responsavel de cada pedido e escapam HTML", () => {
  const original = `Mensagem editada.\n\nLINK DE APROVAÇÃO INTERATIVA:\n${link}\n\nAtenciosamente,\nAtendimento: Nome desatualizado`;
  for (const vendedor of ['Alexandre Almeida', 'Emily Boeira', '  André   Toniazzo\n', '<img src=x> & Teste']) {
    const nome = vendedor.replace(/\s+/g, ' ').trim();
    const r = layoutEmailArte(original, portal, link, '11', undefined, vendedor);
    assert.match(r.text, /Mensagem editada/);
    assert.ok(r.text.includes('Atendimento: ' + nome));
    assert.doesNotMatch(r.html + r.text, /Nome desatualizado/);
    assert.equal((r.text.match(/Atenciosamente/g) || []).length, 1);
    const contato = new URL(r.text.split('\n').at(-1)!);
    assert.equal(contato.searchParams.get('phone'), '555195343478');
    assert.equal(contato.searchParams.get('text'), `Olá, ${nome}! Preciso de atendimento sobre a aprovação das artes do Pedido #11.`);
    assert.doesNotMatch(r.html, /<img src=x>/);
  }
});
Deno.test("layout: sem responsavel cadastrado usa atendimento generico", () => {
  const r = layoutEmailArte(`Confira ${link}\n\nAtenciosamente,\nEquipe Ingresso Ideal / Atendimento`, portal, link, '11');
  assert.match(r.text, /Atenciosamente,\nAtendimento\n/);
  assert.doesNotMatch(r.text, /^Atendimento:|undefined|null|Equipe Ingresso Ideal/m);
});
Deno.test("layout: HTML editado e atributos de links sao escapados", () => {
  const r = layoutEmailArte('<script>alert(1)</script>\n<img src=x onerror="alert(2)">\nhttps://storage.example/a?x=1&y=2\njavascript:alert(3)', portal, link, "11");
  assert.doesNotMatch(r.html, /<script|<img src=x|href="javascript:/);
  assert.match(r.html, /&lt;script&gt;/);
  assert.match(r.html, /x=1&amp;y=2/);
});
Deno.test("layout: teste de remetente nao inventa link de aprovacao", () => {
  const r = layoutEmailArte("Teste sintético", portal);
  assert.match(r.html, /Abrir painel/);
  assert.doesNotMatch(r.html, /Abrir aprovação interativa|Realizar Pagamento|\/cliente\//);
});
Deno.test("layout: orcamento preserva valores do ERP e pagamento abre aba correta", () => {
  const orcamento = '✅ *100* Produto: *R$ 148,05*\nFrete: Grátis\nDesconto já aplicado\nPagamento: Pix\n<img src=x onerror=alert(1)>';
  const r = layoutEmailArte(`Olá!\n\nLINK DE APROVAÇÃO INTERATIVA:\n${link}`, portal, link, "11", orcamento);
  assert.ok(r.text.includes(orcamento));
  assert.match(r.html, /<strong>R\$ 148,05<\/strong>/);
  assert.match(r.html, /Frete: Grátis/);
  assert.doesNotMatch(r.html, /<img src=x/);
  assert.ok(r.html.includes(`href="${link}#pagamento"`));
  assert.ok(r.text.includes(link + '#pagamento'));
  assert.ok(r.html.indexOf('Abrir aprovação interativa') < r.html.indexOf('Resumo do Orçamento'));
  assert.ok(r.html.indexOf('Resumo do Orçamento') < r.html.indexOf('Realizar Pagamento'));
});
Deno.test("MIME: texto e HTML UTF-8 decodificam sem corromper assunto nem links", () => {
  const corpo = layoutEmailArte("Olá! Aprovação de arte.", portal, link, "11");
  const mime = mensagemMime({host:"smtp.example",usuario:"arte@example.com",senha:"sintetica",remetente:"arte@example.com",nome:"Ingresso Ideal"}, {to:"cliente@example.com",subject:"Aprovação — Pedido #11",...corpo});
  const boundary = mime.match(/boundary="([^"]+)"/)![1];
  const parts = mime.split("--" + boundary);
  assert.equal(parts.length, 4);
  assert.match(parts[1], /text\/plain/);
  assert.match(parts[2], /text\/html/);
  for (const [index, expected] of [[1, corpo.text], [2, corpo.html]] as const) {
    const b64 = parts[index].split("\r\n\r\n")[1].trim();
    const decoded = new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, "")), c => c.charCodeAt(0)));
    assert.equal(decoded.replace(/\r\n/g,"\n"), expected.replace(/\r\n/g,"\n"));
  }
  assert.match(mime, /To: <cliente@example.com>/);
});
