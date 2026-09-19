/** Acesso interno aos bancos de dados variáveis de um pedido. */
import { banco } from "./banco.ts";
import { Recusa } from "./sessao.ts";

export type Banco = (
  metodo: string,
  caminho: string,
  corpo?: unknown,
  prefer?: string,
) => Promise<any>;

type Identidade = Record<string, unknown> | null | undefined;

const CAMPOS_DO_BANCO = [
  "nome", "csv_filename", "csv_headers", "csv_data", "csv_url",
];

function objeto(valor: unknown): Record<string, unknown> {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) {
    throw new Recusa(422, "corpo invalido: esperava um objeto JSON");
  }
  return valor as Record<string, unknown>;
}

function inteiroPositivo(valor: unknown, nome: string): number {
  const n = Number(valor);
  if (!Number.isInteger(n) || n <= 0) throw new Recusa(422, `${nome} invalido`);
  return n;
}

function textoId(valor: unknown, nome: string): string {
  const s = String(valor ?? "").trim();
  if (!s || s.length > 120 || /[\u0000-\u001f]/.test(s)) {
    throw new Recusa(422, `${nome} invalido`);
  }
  return s;
}

function uuid(valor: unknown, nome: string): string {
  const s = String(valor ?? "").trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(s)) {
    throw new Recusa(422, `${nome} invalido`);
  }
  return s;
}

function permitido(identidade: Identidade, escrita: boolean): boolean {
  if (!identidade) return false;
  const chave = escrita ? "perm_amostras_edit" : "perm_amostras_view";
  if (typeof identidade[chave] === "boolean") return identidade[chave] === true;

  // Linhas antigas de acesso local podem guardar apenas o perfil. Estes sao os
  // mesmos padroes de ROLE_DEFAULTS no painel; uma negacao explicita acima
  // sempre vence o perfil.
  const papel = String(identidade.role ?? "").trim().toLowerCase();
  const leitura = ["admin", "atendimento", "designer", "impressor", "gerente", "visualizador"];
  const edicao = ["admin", "designer", "gerente"];
  return (escrita ? edicao : leitura).includes(papel);
}

function exigirPermissao(identidade: Identidade, escrita: boolean): void {
  if (!permitido(identidade, escrita)) {
    throw new Recusa(403, `esta operacao exige permissao para ${escrita ? "editar" : "ver"} Amostras`);
  }
}

async function bancoDoPedido(
  consultar: Banco,
  bancoId: string,
  pedido: number,
): Promise<Record<string, unknown>> {
  const linhas = (await consultar(
    "GET",
    `pedidos_bancos?id=eq.${bancoId}&id_int=eq.${pedido}&select=*&limit=2`,
  )) ?? [];
  if (!Array.isArray(linhas) || linhas.length !== 1) {
    throw new Recusa(404, "banco nao encontrado neste pedido");
  }
  return linhas[0];
}

async function conferirModelo(
  consultar: Banco,
  modeloId: string,
  pedido: number,
): Promise<void> {
  const linhas = (await consultar(
    "GET",
    `pedidos_modelos?id=eq.${encodeURIComponent(modeloId)}&id_int=eq.${pedido}&select=id&limit=2`,
  )) ?? [];
  if (!Array.isArray(linhas) || linhas.length !== 1) {
    throw new Recusa(404, "modelo nao encontrado neste pedido");
  }
}

function umaLinha(linhas: unknown, mensagem: string): Record<string, unknown> {
  if (!Array.isArray(linhas) || linhas.length !== 1) throw new Recusa(503, mensagem);
  return linhas[0];
}

/** Valida novamente na nuvem o codigo que a estacao apresentou. */
export async function operadorLocalBancos(
  codigoBruto: string | null,
  consultar: Banco = banco,
): Promise<Record<string, unknown>> {
  const codigo = String(codigoBruto ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(codigo)) throw new Recusa(401, "operador local invalido");
  let linhas;
  try {
    linhas = await consultar(
      "GET",
      `imposition_acessos_locais?codigo=eq.${codigo}&ativo=eq.true&select=role,permissoes&limit=2`,
    );
  } catch {
    // O helper do PostgREST inclui o caminho no erro. Nao deixar o codigo ir ao log.
    throw new Recusa(503, "nao foi possivel validar o operador local");
  }
  if (!Array.isArray(linhas) || linhas.length !== 1) throw new Recusa(401, "operador local invalido");
  const linha = linhas[0] ?? {};
  const grade = linha.permissoes && typeof linha.permissoes === "object" && !Array.isArray(linha.permissoes)
    ? linha.permissoes : {};
  return { role: linha.role, ...grade };
}

export async function operarBancosPedido(
  acao: string,
  corpoBruto: unknown,
  identidade: Identidade,
  consultar: Banco = banco,
): Promise<unknown> {
  const corpo = objeto(corpoBruto);
  const pedido = inteiroPositivo(corpo.id_int, "id_int");
  const escrita = acao !== "consultar";
  exigirPermissao(identidade, escrita);

  if (acao === "consultar") {
    const bancos = (await consultar(
      "GET",
      `pedidos_bancos?id_int=eq.${pedido}&select=*&order=created_at.asc`,
    )) ?? [];
    if (!Array.isArray(bancos)) throw new Recusa(503, "resposta invalida ao consultar bancos");
    if (!bancos.length) return { bancos: [], vinculos: [] };
    const ids = bancos.map((b: any) => uuid(b?.id, "id do banco"));
    const vinculos = (await consultar(
      "GET",
      `pedidos_modelos_banco?banco_id=in.(${ids.join(",")})&select=*`,
    )) ?? [];
    if (!Array.isArray(vinculos)) throw new Recusa(503, "resposta invalida ao consultar vinculos");
    return { bancos, vinculos };
  }

  if (acao === "criar") {
    const registro: Record<string, unknown> = { id_int: pedido };
    for (const campo of CAMPOS_DO_BANCO) if (campo in corpo) registro[campo] = corpo[campo];
    registro.nome = String(registro.nome ?? registro.csv_filename ?? "banco").trim().slice(0, 120);
    if (!registro.nome) throw new Recusa(422, "nome do banco e obrigatorio");
    if (!Array.isArray(registro.csv_headers)) throw new Recusa(422, "csv_headers deve ser uma lista");
    if (!Array.isArray(registro.csv_data) || !(registro.csv_data as unknown[]).length) {
      throw new Recusa(422, "csv_data deve ter pelo menos uma linha");
    }
    const linhas = await consultar("POST", "pedidos_bancos", registro, "return=representation");
    return { banco: umaLinha(linhas, "o banco nao devolveu a linha criada") };
  }

  if (acao === "atualizar") {
    const bancoId = uuid(corpo.banco_id, "banco_id");
    await bancoDoPedido(consultar, bancoId, pedido);
    const alteracoes: Record<string, unknown> = {};
    for (const campo of CAMPOS_DO_BANCO) if (campo in corpo) alteracoes[campo] = corpo[campo];
    if (!Object.keys(alteracoes).length) throw new Recusa(422, "nenhuma alteracao permitida foi enviada");
    if ("nome" in alteracoes) {
      alteracoes.nome = String(alteracoes.nome ?? "").trim().slice(0, 120);
      if (!alteracoes.nome) throw new Recusa(422, "nome do banco e obrigatorio");
    }
    if ("csv_headers" in alteracoes && !Array.isArray(alteracoes.csv_headers)) {
      throw new Recusa(422, "csv_headers deve ser uma lista");
    }
    if ("csv_data" in alteracoes && !Array.isArray(alteracoes.csv_data)) {
      throw new Recusa(422, "csv_data deve ser uma lista");
    }
    alteracoes.updated_at = new Date().toISOString();
    const linhas = await consultar(
      "PATCH",
      `pedidos_bancos?id=eq.${bancoId}&id_int=eq.${pedido}`,
      alteracoes,
      "return=representation",
    );
    return { banco: umaLinha(linhas, "o banco nao devolveu a linha atualizada") };
  }

  if (acao === "excluir") {
    const bancoId = uuid(corpo.banco_id, "banco_id");
    await bancoDoPedido(consultar, bancoId, pedido);
    const vinculos = (await consultar(
      "GET",
      `pedidos_modelos_banco?banco_id=eq.${bancoId}&select=modelo_id&limit=1`,
    )) ?? [];
    if (Array.isArray(vinculos) && vinculos.length) {
      throw new Recusa(409, "este banco ainda esta ligado a um modelo");
    }
    const linhas = await consultar(
      "DELETE",
      `pedidos_bancos?id=eq.${bancoId}&id_int=eq.${pedido}`,
      undefined,
      "return=representation",
    );
    return { banco: umaLinha(linhas, "o banco nao devolveu a linha excluida") };
  }

  if (acao === "vincular") {
    const modeloId = textoId(corpo.modelo_id, "modelo_id");
    await conferirModelo(consultar, modeloId, pedido);
    if (corpo.banco_id === null || corpo.banco_id === undefined || corpo.banco_id === "") {
      const atuais = (await consultar(
        "GET",
        `pedidos_modelos_banco?modelo_id=eq.${encodeURIComponent(modeloId)}&select=*&limit=2`,
      )) ?? [];
      if (!Array.isArray(atuais) || !atuais.length) return { vinculo: null };
      if (atuais.length !== 1) throw new Recusa(409, "mais de um vinculo encontrado para o modelo");
      await bancoDoPedido(consultar, uuid(atuais[0].banco_id, "banco_id"), pedido);
      const apagadas = await consultar(
        "DELETE",
        `pedidos_modelos_banco?modelo_id=eq.${encodeURIComponent(modeloId)}`,
        undefined,
        "return=representation",
      );
      umaLinha(apagadas, "o vinculo nao devolveu a linha excluida");
      return { vinculo: null };
    }
    const bancoId = uuid(corpo.banco_id, "banco_id");
    await bancoDoPedido(consultar, bancoId, pedido);
    const linha = {
      modelo_id: modeloId,
      banco_id: bancoId,
      csv_mapa: corpo.csv_mapa ?? null,
      updated_at: new Date().toISOString(),
    };
    const gravadas = await consultar(
      "POST",
      "pedidos_modelos_banco?on_conflict=modelo_id",
      linha,
      "resolution=merge-duplicates,return=representation",
    );
    return { vinculo: umaLinha(gravadas, "o vinculo nao devolveu a linha gravada") };
  }

  throw new Recusa(404, "acao de bancos desconhecida");
}
