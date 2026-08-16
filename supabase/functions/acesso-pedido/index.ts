/**
 * O QR do Pedido: uma rota so, `POST /pedidos/{pedido}/qr`.
 *
 * Porte de `gerar_qr` (`acesso_api.py:508`).
 *
 * ## Esta rota MINTA acesso
 *
 * O token que ela devolve e o que permite reivindicar o evento de um pedido.
 * Deixa-la aberta desfaria tudo que as outras travas construiram -- qualquer um
 * geraria o QR do pedido alheio e tomaria o evento. Por isso ela exige JWT, e
 * por isso `verify_jwt = true` no `config.toml`.
 *
 * Note que ela NAO exige papel. E deliberado, e e o comportamento do Render:
 * quem gera o QR e o atendente que esta falando com o cliente ao telefone, e
 * exigir ADM aqui trocaria uma tela que funciona por um chamado interno. O que
 * o JWT garante e que quem pede esta logado no painel da grafica.
 *
 * ## Gerar REVOGA o anterior
 *
 * Revogar e o conserto de quando o QR cai na conta errada: o QR viaja por
 * WhatsApp, e quem receber a imagem consegue reivindicar o pedido -- uma vez. Se
 * cair no cliente errado, o atendente gera outro e o primeiro morre na hora.
 *
 * ## A paridade criptografica, que e o coracao do risco
 *
 * A assinatura vive em `_compartilhado/assinatura.ts` e esta provada NOS DOIS
 * SENTIDOS contra o Python: `assinatura_test.ts` confere bilhete que o Python
 * emitiu, e `tests/test_assinatura_paridade.py` confere bilhete que o Deno
 * emitiu. Um byte de diferenca no HMAC invalidaria todo QR em circulacao, e a
 * descoberta aconteceria quando um cliente tentasse abrir o dele.
 */
import { banco } from "../_compartilhado/banco.ts";
import { comCors, origemPermitida, respostaDePreflight } from "../_compartilhado/cors.ts";
import { Recusa, usuarioDoJwt } from "../_compartilhado/sessao.ts";
import { segredo } from "../_compartilhado/segredos.ts";
import {
  inteiro,
  recusaDeRotaDesconhecida,
  RecusaDeValidacao,
} from "../_compartilhado/validacao.ts";
import { gerarQrPedido, SEGREDO_QR_PEDIDO } from "../_compartilhado/assinatura.ts";
import { abrirPedido } from "../_compartilhado/pedidos.ts";
import { pedacosDaRota, urlDoEvento } from "./puro.ts";

const JSON_HEADERS = { "Content-Type": "application/json" };

async function sha256Hex(texto: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function gerar(pedido: number, quem: { email: string }): Promise<unknown> {
  // 503, e nao 500: faltar configuracao no servidor nao e defeito de quem
  // chamou, e a mensagem diz exatamente qual variavel colar.
  if (!(await segredo(SEGREDO_QR_PEDIDO))) {
    throw new Recusa(503, `${SEGREDO_QR_PEDIDO} nao configurada neste servidor`);
  }

  const token = await gerarQrPedido(pedido);

  // Garante a linha e o sal, mesmo antes de imprimir. Sem tiragem: quem le a
  // resposta daqui e a tela do atendente, que so quer o endereco do QR.
  await abrirPedido(pedido, false);

  await banco("PATCH", `producao_acesso_pedidos?pedido_id_int=eq.${pedido}`, {
    qr_token_hash: await sha256Hex(token),
    qr_gerado_em: "now()",
    // O QR anterior morre aqui. O novo nasce valido.
    qr_revogado_em: null,
  });

  console.log(`[acesso] QR do pedido ${pedido} gerado por ${quem.email}`);
  return { url: urlDoEvento(Deno.env.get("PAINEL_BASE_URL"), token), pedido };
}

async function rotear(req: Request, url: URL): Promise<Response> {
  const p = pedacosDaRota(url.pathname);

  // Rota que nao e esta -- por caminho ou por metodo -- cai na regra do
  // `app.py`, que depende do METODO e nao do caminho: GET vira 404, o resto
  // vira 405. Ver `recusaDeRotaDesconhecida`, onde a medicao esta registrada.
  if (req.method !== "POST" || !(p.length === 3 && p[0] === "pedidos" && p[2] === "qr")) {
    recusaDeRotaDesconhecida(req.method);
  }

  // O `pedido: int` e validado antes de a rota rodar, e portanto antes da
  // sessao: caminho invalido responde 422 mesmo sem JWT. Inverter faria a mesma
  // URL responder 401 num endereco e 422 no outro enquanto as duas convivem.
  const pedido = inteiro(p[1], "path", "pedido");
  const quem = usuarioDoJwt(req.headers.get("authorization"));
  return new Response(JSON.stringify(await gerar(pedido, quem)), {
    headers: JSON_HEADERS,
  });
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const origem = origemPermitida(req.headers.get("origin"));

  if (req.method === "OPTIONS") return respostaDePreflight(origem, "POST, OPTIONS");

  try {
    return comCors(await rotear(req, url), origem);
  } catch (e) {
    if (e instanceof Recusa) {
      const corpo = e instanceof RecusaDeValidacao
        ? { detail: e.detalhes }
        : { detail: e.detail };
      return comCors(
        new Response(JSON.stringify(corpo), { status: e.status, headers: JSON_HEADERS }),
        origem,
      );
    }
    console.error("[acesso-pedido]", e);
    return comCors(
      new Response(JSON.stringify({ detail: "erro interno" }), {
        status: 500,
        headers: JSON_HEADERS,
      }),
      origem,
    );
  }
});
