/**
 * Emite bilhetes assinados pelo DENO, para o Python conferir.
 *
 * A outra metade da paridade. O `assinatura_test.ts` prova que o Deno confere o
 * que o Python emitiu; este script produz o caminho contrario, que
 * `tests/test_assinatura_paridade.py` confere.
 *
 * Sem os dois sentidos, uma implementacao consistentemente errada nos dois
 * lados passaria -- e o dia em que um dos lados fosse corrigido sozinho
 * quebraria o outro.
 *
 * Regerar (da pasta `supabase/functions`):
 *   npx deno run --allow-env _compartilhado/emitir_casos.ts > \
 *     ../../tests/assinatura_casos_do_deno.json
 *
 * O segredo e o mesmo de mesa do `assinatura_casos.json`, e nao o de producao:
 * a saida vai para o repositorio.
 */
import casos from "./assinatura_casos.json" with { type: "json" };

Deno.env.set("QR_PEDIDO_SEGREDO", casos.segredo_qr);
Deno.env.set("ACESSO_ELEVACAO_SEGREDO", casos.segredo_elevacao);

const { assinarCorpo, SEGREDO_QR_PEDIDO, SEGREDO_ELEVACAO } = await import(
  "./assinatura.ts"
);

// Vencimentos FIXOS, e nao `agora + 180 dias`: a saida vai para o repositorio,
// e um token que carregasse o instante da geracao mudaria o arquivo a cada
// regeracao, poluindo o diff sem provar nada a mais.
const qr = [];
for (const [pedido, expira] of [[1, 0], [18560, 1800000000], [999999999, 2147483647]]) {
  const corpo = `${pedido}.${expira}`;
  qr.push({
    pedido,
    expira,
    token: `${corpo}.${await assinarCorpo(SEGREDO_QR_PEDIDO, corpo)}`,
  });
}

const elevacao = [];
for (
  const [ev, conta, nav, expira] of [
    ["8242dfbd-021a-4dfc-8f1f-9b240e28c65a", "abc123", "nav-1", 1800000000],
    ["e", "c", "n", 0],
    ["A_-9", "z".repeat(64), "nav_2-x", 2147483647],
  ] as [string, string, string, number][]
) {
  const corpo = `${ev}.${conta}.${nav}.${expira}`;
  elevacao.push({
    evento_id: ev,
    conta_id: conta,
    navegador: nav,
    expira,
    token: `${corpo}.${await assinarCorpo(SEGREDO_ELEVACAO, corpo)}`,
  });
}

const corposCrus = [];
for (const c of casos.corpos_crus) {
  corposCrus.push({
    corpo: c.corpo,
    assinatura: await assinarCorpo(SEGREDO_QR_PEDIDO, c.corpo),
  });
}

console.log(
  JSON.stringify(
    {
      emitido_por: "deno",
      segredo_qr: casos.segredo_qr,
      segredo_elevacao: casos.segredo_elevacao,
      corpos_crus: corposCrus,
      qr,
      elevacao,
    },
    null,
    2,
  ),
);
