import { banco } from "../_compartilhado/banco.ts";
import { prepararEvento } from "../_compartilhado/preparacao_nuvem.ts";
import { comCors, origemPermitida, respostaDePreflight } from "../_compartilhado/cors.ts";

type Estado = { disponivel: boolean; estado?: string; evento_id?: string; qr?: string };
type Dependencias = {
  consultar: (numero: string, token: string, criar: boolean) => Promise<Estado>;
  preparar: (evento: string) => Promise<unknown>;
};
const padrao: Dependencias = {
  consultar: (numero, token, criar) => banco("POST", "rpc/ideal_control_portal", {
    p_numero: numero, p_token: token, p_criar: criar,
  }),
  preparar: prepararEvento,
};

// Um lote por requisição limita o trabalho. A RPC serializa criação e a rotina
// existente serializa os lotes; repetir uma chamada retoma o mesmo evento.
export async function atender(req: Request, deps: Dependencias = padrao): Promise<Response> {
  const origem = origemPermitida(req.headers.get("origin"));
  const resposta = (body: unknown, status = 200) => comCors(Response.json(body, {
    status, headers: { "Cache-Control": "no-store" },
  }), origem);
  if (req.method === "OPTIONS") return respostaDePreflight(origem, "POST, OPTIONS", "authorization,content-type,apikey,x-client-info");
  if (req.method !== "POST") return resposta({ erro: "Método inválido." }, 405);
  try {
    const texto = await req.text();
    if (texto.length > 2048) return resposta({ erro: "Pedido inválido." }, 400);
    const b = JSON.parse(texto);
    if (!b || typeof b.numero !== "string" || !/^[1-9][0-9]{0,8}$/.test(b.numero)
      || typeof b.token !== "string" || b.token.length < 1 || b.token.length > 512
      || typeof b.criar !== "boolean") return resposta({ erro: "Pedido inválido." }, 400);
    let estado = await deps.consultar(b.numero, b.token, b.criar);
    if (b.criar && estado.disponivel && estado.estado === "preparando" && estado.evento_id) {
      await deps.preparar(estado.evento_id);
      // Revogação ou desligamento durante a preparação impede devolver o QR.
      estado = await deps.consultar(b.numero, b.token, true);
    }
    const { evento_id: _privado, ...publico } = estado;
    return resposta(publico);
  } catch (_) {
    // Não registrar token, QR, plano de códigos nem detalhes do banco.
    return resposta({ erro: "Não foi possível preparar o evento. Tente novamente ou fale com seu atendimento." }, 503);
  }
}
