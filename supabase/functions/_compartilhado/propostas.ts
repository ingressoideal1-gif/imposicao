/** Operações do Imposition sobre propostas. Não aceita SQL, colunas ou PATCH livre. */
import { banco } from "./banco.ts";
import { Recusa } from "./sessao.ts";

export type OperadorPropostas = { role?: unknown; [chave: string]: unknown };
type Banco = typeof banco;
const bancoSemDadosNoErro: Banco = async (...args) => {
  try { return await banco(...args); }
  catch { throw new Recusa(503, "servico de pedidos indisponivel"); }
};
const COLUNAS = "id,id_int,cliente,vendedor,status_interno,created_at,id_cliente,id_faturado,frete_escolhido,id_endereco_ent";
const LEITURAS = ["perm_pedidos_view", "perm_producao_view", "perm_acabamento_view", "perm_lista_arte_view", "perm_numeracao_view"];

function objeto(valor: unknown): Record<string, any> {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) throw new Recusa(422, "esperava um objeto JSON");
  return valor as Record<string, any>;
}
function campos(corpo: Record<string, any>, permitidos: string[]) {
  if (Object.keys(corpo).some((k) => !permitidos.includes(k))) throw new Recusa(422, "campo nao permitido nesta operacao");
}
function numero(valor: unknown): number {
  if (!/^[0-9]+$/.test(String(valor)) || !Number.isSafeInteger(Number(valor)) || Number(valor) <= 0) {
    throw new Recusa(422, "numero invalido");
  }
  return Number(valor);
}
function numeros(valor: unknown, maximo = 200): number[] {
  if (!Array.isArray(valor) || !valor.length || valor.length > maximo) throw new Recusa(422, `informe de 1 a ${maximo} numeros`);
  return [...new Set(valor.map(numero))];
}
function texto(valor: unknown): string {
  if (typeof valor !== "string" || !valor.trim() || valor.length > 200) throw new Recusa(422, "texto invalido");
  return valor.trim();
}

/** Somente valores escalares escapados chegam aos filtros PostgREST. */
function literal(valor: string): string {
  return '"' + valor.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
}

export function exigirOperadorPropostas(operador: OperadorPropostas | null, acao: string, status?: unknown) {
  if (!operador) throw new Recusa(403, "operador do Imposition nao identificado");
  if (acao === "status") {
    if (status === "EM PRODUCAO") {
      if (String(operador.role ?? "").trim().toLowerCase() !== "admin") throw new Recusa(403, "somente o administrador libera para producao");
    } else if (status === "EXPEDICAO") {
      if (operador.perm_acabamento_edit !== true) throw new Recusa(403, "sem permissao para editar acabamento");
    } else throw new Recusa(422, "status nao permitido");
  } else if (!LEITURAS.some((chave) => operador[chave] === true)) {
    throw new Recusa(403, "sem permissao para consultar pedidos");
  }
}

/** A identificação do operador ocorre antes de chamar esta função. Sem filtro de empresa. */
export async function operarPropostas(acao: string, entrada: unknown, operador: OperadorPropostas | null, consultar: Banco = bancoSemDadosNoErro) {
  const corpo = objeto(entrada);
  if (!["consultar", "status", "cadastro", "pagamentos"].includes(acao)) throw new Recusa(404, "operacao inexistente");
  exigirOperadorPropostas(operador, acao, corpo.status);
  if (acao === "cadastro") {
    campos(corpo, ["pedido", "escopo", "exigir_cadastro"]);
    if (corpo.escopo !== undefined && !["entrega", "contato"].includes(corpo.escopo)) throw new Recusa(422, "escopo de cadastro invalido");
    if (corpo.exigir_cadastro !== undefined && typeof corpo.exigir_cadastro !== "boolean") throw new Recusa(422, "exigencia de cadastro invalida");
    const pedido = numero(corpo.pedido);
    const linhas = await consultar("GET", `propostas?id_int=eq.${pedido}&select=cliente,vendedor,id_cliente,id_faturado,id_endereco_ent&limit=2`);
    if (!Array.isArray(linhas) || linhas.length !== 1) throw new Recusa(409, "pedido inexistente ou ambiguo");
    const proposta = linhas[0];
    const clienteId = proposta.id_faturado || proposta.id_cliente;
    let cliente = null, endereco = null;
    if (clienteId) {
      const colunas = corpo.escopo === "contato" ? "nome,fantasia,email_financeiro,email_contato,email" :
        "nome,fantasia,documento,ins_estadual,email_financeiro,email_contato,email,whatsapp_1,telefone_fixo";
      const clientes = await consultar("GET", `clientes?id_cliente=eq.${numero(clienteId)}&select=${colunas}&limit=2`);
      if (!Array.isArray(clientes) || clientes.length > 1) throw new Recusa(409, "cadastro ambiguo");
      if (corpo.exigir_cadastro && clientes.length !== 1) throw new Recusa(409, "cadastro do cliente nao encontrado");
      cliente = clientes[0] ?? null;
    }
    if (corpo.escopo !== "contato" && proposta.id_endereco_ent) {
      const id = String(proposta.id_endereco_ent);
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Recusa(409, "referencia de endereco invalida");
      const enderecos = await consultar("GET", `enderecos?id=eq.${id}&select=recebedor,cpf_recebedor,endereco,numero,complemento,bairro,cidade,uf,cep&limit=2`);
      if (!Array.isArray(enderecos) || enderecos.length > 1) throw new Recusa(409, "endereco ambiguo");
      endereco = enderecos[0] ?? null;
    }
    return { cliente, endereco, nome: proposta.cliente || "", vendedor: typeof proposta.vendedor === "string" ? proposta.vendedor : "" };
  }
  if (acao === "pagamentos") {
    campos(corpo, ["numeros", "offset", "limite"]);
    const ids = numeros(corpo.numeros);
    const offset = corpo.offset ?? 0, limite = corpo.limite ?? 500;
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1000000 ||
        !Number.isSafeInteger(limite) || limite < 1 || limite > 500) throw new Recusa(422, "paginacao invalida");
    const linhas = await consultar("GET", `pagamentos_v2?id_int=in.(${ids.join(",")})&status=neq.CANCELADO&select=id_int,status&order=id_int.asc,status.asc&offset=${offset}&limit=${limite}`);
    if (!Array.isArray(linhas)) throw new Recusa(503, "resposta de pagamentos invalida");
    return linhas;
  }
  if (acao === "status") {
    campos(corpo, ["pedido", "status"]);
    const pedido = numero(corpo.pedido);
    const existentes = await consultar("GET", `propostas?id_int=eq.${pedido}&select=id&limit=2`);
    if (!Array.isArray(existentes) || existentes.length !== 1 || !existentes[0].id) {
      throw new Recusa(409, "pedido inexistente ou numero ambiguo");
    }
    const id = encodeURIComponent(String(existentes[0].id));
    const linhas = await consultar("PATCH", `propostas?id=eq.${id}&id_int=eq.${pedido}&select=id_int,status_interno`,
      { status_interno: corpo.status }, "return=representation");
    if (!Array.isArray(linhas) || linhas.length !== 1) throw new Recusa(409, "a gravacao nao retornou exatamente um pedido");
    return linhas[0];
  }

  campos(corpo, ["tipo", "numeros", "status", "clientes", "nome", "offset", "limite"]);
  const offset = corpo.offset ?? 0;
  const limite = corpo.limite ?? 500;
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1000000 ||
      !Number.isSafeInteger(limite) || limite < 1 || limite > 500) throw new Recusa(422, "paginacao invalida");
  const q = new URLSearchParams({ select: COLUNAS, order: "id_int.desc,id.desc", offset: String(offset), limit: String(limite) });
  switch (corpo.tipo) {
    case "numeros":
      campos(corpo, ["tipo", "numeros", "offset", "limite"]);
      q.set("id_int", `in.(${numeros(corpo.numeros).join(",")})`);
      break;
    case "lista":
      campos(corpo, ["tipo", "offset", "limite"]);
      break;
    case "status":
      campos(corpo, ["tipo", "status", "offset", "limite"]);
      if (!Array.isArray(corpo.status) || !corpo.status.length || corpo.status.length > 30) throw new Recusa(422, "lista de status invalida");
      q.set("status_interno", `in.(${corpo.status.map((s: unknown) => literal(texto(s))).join(",")})`);
      break;
    case "clientes": {
      campos(corpo, ["tipo", "clientes", "offset", "limite"]);
      const ids = numeros(corpo.clientes, 2);
      q.set("or", `(${ids.flatMap((id) => [`id_cliente.eq.${id}`, `id_faturado.eq.${id}`]).join(",")})`);
      q.set("order", "created_at.desc,id.desc");
      break;
    }
    case "nome":
      campos(corpo, ["tipo", "nome", "offset", "limite"]);
      q.set("cliente", `ilike.${literal("%" + texto(corpo.nome) + "%")}`);
      q.set("order", "created_at.desc,id.desc");
      break;
    case "encerrados_teste":
      campos(corpo, ["tipo", "offset", "limite"]);
      q.set("encerrado_teste_em", "not.is.null");
      q.set("select", "id_int");
      break;
    default: throw new Recusa(422, "consulta nao permitida");
  }
  const linhas = await consultar("GET", `propostas?${q}`);
  if (!Array.isArray(linhas)) throw new Recusa(503, "resposta invalida ao consultar pedidos");
  // A identidade comercial serve apenas à exibição. O titular fiscal e os
  // campos originais da proposta permanecem literais.
  const ids = [...new Set(linhas.map((p) => p.id_cliente ?? p.id_faturado)
    .filter((id) => /^[0-9]+$/.test(String(id)) && Number(id) > 0).map(Number))];
  const nomes = new Map<number, string>();
  try {
    for (let i = 0; i < ids.length; i += 200) {
      const clientes = await consultar("GET", `clientes?id_cliente=in.(${ids.slice(i, i + 200).join(",")})&select=id_cliente,fantasia,nome`);
      if (!Array.isArray(clientes)) throw new Error("cadastro indisponivel");
      clientes.forEach((c) => nomes.set(Number(c.id_cliente), String(c.fantasia ?? "").trim() || String(c.nome ?? "").trim()));
    }
  } catch {
    // Falha na apresentação não oculta pedidos nem expõe erros do cadastro.
    return linhas;
  }
  linhas.forEach((p) => {
    const nome = nomes.get(Number(p.id_cliente ?? p.id_faturado));
    if (nome) p.cliente_exibicao = nome;
  });
  return linhas;
}

/** Exige código ativo no banco, além do segredo do agente já conferido na rota. */
export async function operadorLocalPropostas(codigo: string | null, consultar: Banco = banco): Promise<OperadorPropostas> {
  if (!codigo || !/^[A-Z0-9]{6}$/.test(codigo)) throw new Recusa(401, "operador local invalido");
  let linhas;
  try {
    linhas = await consultar("GET", `imposition_acessos_locais?codigo=eq.${codigo}&ativo=eq.true&select=role,permissoes&limit=2`);
  } catch {
    // O helper inclui o caminho no erro. Não deixar o código do operador ir ao log.
    throw new Recusa(503, "nao foi possivel validar o operador local");
  }
  if (!Array.isArray(linhas) || linhas.length !== 1) throw new Recusa(401, "operador local invalido");
  const p = linhas[0];
  const grade = objeto(p.permissoes ?? {});
  const role = String(p.role ?? "").trim().toLowerCase();
  // Mesmo preenchimento das chaves ausentes feito por permsDoOperadorLocal.
  // Negação explícita sempre prevalece. Nenhuma identidade vem do navegador.
  const padroes: Record<string, boolean[]> = {
    admin: [true, true, true, true, true], atendimento: [true, true, true, true, true],
    designer: [true, true, true, true, true], impressor: [true, true, true, false, true],
    acabamento: [false, false, true, false, false], financeiro: [true, true, true, false, false],
    gerente: [true, true, true, true, true], visualizador: [true, true, true, true, true],
  };
  const vazio = !Object.keys(grade).length;
  const valores = vazio ? LEITURAS.map(() => true) : padroes[role];
  const defaults = valores ? Object.fromEntries(LEITURAS.map((k, i) => [k, valores[i]])) : {};
  if (valores) defaults.perm_acabamento_edit = true;
  return { ...defaults, ...grade, role };
}
