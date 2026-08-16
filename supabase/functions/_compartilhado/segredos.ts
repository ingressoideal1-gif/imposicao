/**
 * De onde as Edge Functions tiram os segredos.
 *
 * ## A ordem, e por que ela é esta
 *
 * 1. **O ambiente** (`Edge Functions → Secrets` do Supabase). É o lugar certo, e
 *    vence sempre.
 * 2. **A tabela `imposition_segredos`**, lida com a chave de serviço. É o plano
 *    B, e existe porque a conta que opera este projeto tem papel *Developer* na
 *    organização do parceiro -- ela publica função mas não administra segredo.
 *    Medido em 16/08/2026: `POST /v1/projects/{ref}/secrets` responde 403 pela
 *    CLI e pela API, e o painel recusaria pelo mesmo motivo.
 *
 * O ambiente vindo primeiro é o que torna isto reversível sem tocar em código:
 * no dia em que o Owner colar os três valores nos Secrets, eles passam a vencer
 * sozinhos, a tabela deixa de ser consultada, e um `DROP TABLE` a remove.
 *
 * ## O cache, e o que ele NÃO é
 *
 * O valor lido fica guardado em memória enquanto aquele worker viver. Isso
 * economiza uma ida ao banco por requisição, e não mais que isso: cada invocação
 * fria começa vazia, e o Supabase recicla workers sozinho. Trocar um segredo na
 * tabela vale para os workers novos; para valer em todos, republique a função.
 *
 * `null` também é guardado, de propósito. Sem isso, uma função rodando sem o
 * segredo configurado bateria no banco a cada requisição para receber a mesma
 * resposta vazia -- e o caminho do erro ficaria mais caro que o do sucesso.
 */
import { banco } from "./banco.ts";

const cache = new Map<string, string | null>();

export async function segredo(nome: string): Promise<string | null> {
  const doAmbiente = Deno.env.get(nome);
  if (doAmbiente) return doAmbiente;

  if (cache.has(nome)) return cache.get(nome) ?? null;

  let valor: string | null = null;
  try {
    const linhas = (await banco(
      "GET",
      `imposition_segredos?nome=eq.${encodeURIComponent(nome)}&select=valor`,
    )) ?? [];
    valor = linhas[0]?.valor ?? null;
  } catch (e) {
    // Tabela ausente é o estado normal enquanto o plano B não foi aplicado, e
    // não pode virar 500. Quem chamou trata a falta do segredo com 503, que é a
    // resposta certa: falta de configuração no servidor não é defeito de quem
    // pediu.
    console.error(`[segredos] nao consegui ler ${nome} da tabela:`, e);
  }
  cache.set(nome, valor);
  return valor;
}

/** O segredo, ou 503 dizendo exatamente qual variável falta. */
export async function precisaDoSegredo(nome: string): Promise<string> {
  const v = await segredo(nome);
  if (!v) {
    throw new Error(
      `${nome} nao configurada neste servidor. Cole em Edge Functions → ` +
        `Secrets, ou grave em imposition_segredos.`,
    );
  }
  return v;
}
