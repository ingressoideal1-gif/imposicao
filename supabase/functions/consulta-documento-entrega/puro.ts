export class ErroConsulta extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function somenteDigitos(valor: unknown): string {
  return String(valor ?? "").replace(/\D/g, "");
}

export function cpfValido(valor: unknown): boolean {
  const cpf = somenteDigitos(valor);
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1+$/.test(cpf)) return false;
  for (let n = 9; n <= 10; n++) {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(cpf[i]) * (n + 1 - i);
    if (((soma * 10) % 11) % 10 !== Number(cpf[n])) return false;
  }
  return true;
}

export function cnpjValido(valor: unknown): boolean {
  const cnpj = somenteDigitos(valor);
  if (!/^\d{14}$/.test(cnpj) || /^(\d)\1+$/.test(cnpj)) return false;
  const pesos = [[5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]];
  for (let etapa = 0; etapa < 2; etapa++) {
    const soma = pesos[etapa].reduce((total, peso, i) => total + Number(cnpj[i]) * peso, 0);
    const digito = soma % 11 < 2 ? 0 : 11 - (soma % 11);
    if (digito !== Number(cnpj[12 + etapa])) return false;
  }
  return true;
}

export async function consultarNomeCpf(
  cpf: string,
  chave: string,
  buscar: typeof fetch = fetch,
): Promise<{ cpf: string; nome: string }> {
  if (!cpfValido(cpf)) throw new ErroConsulta(400, "CPF invalido");
  if (!chave) throw new ErroConsulta(503, "consulta de CPF indisponivel");

  const resposta = await buscar(`https://api.cpfhub.io/cpf/${cpf}`, {
    method: "GET",
    headers: { "x-api-key": chave, Accept: "application/json" },
  });
  let corpo: any = null;
  try {
    corpo = await resposta.json();
  } catch {
    throw new ErroConsulta(502, "resposta invalida da consulta de CPF");
  }
  if (resposta.status === 404) throw new ErroConsulta(404, "CPF nao encontrado");
  if (resposta.status === 429) throw new ErroConsulta(503, "limite temporario da consulta de CPF");
  if (resposta.status === 401 || resposta.status === 403) {
    throw new ErroConsulta(503, "consulta de CPF nao configurada");
  }
  if (!resposta.ok || corpo?.success !== true) {
    throw new ErroConsulta(502, "nao foi possivel consultar o CPF");
  }
  const recebido = somenteDigitos(corpo?.data?.cpf);
  const nome = String(corpo?.data?.name ?? "").trim();
  if (recebido !== cpf || !nome || nome.length > 150) {
    throw new ErroConsulta(502, "dados invalidos na consulta de CPF");
  }
  return { cpf: recebido, nome };
}

export async function consultarCnpj(
  cnpj: string,
  buscar: typeof fetch = fetch,
): Promise<Record<string, string>> {
  if (!cnpjValido(cnpj)) throw new ErroConsulta(400, "CNPJ invalido");
  const resposta = await buscar(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
    headers: { Accept: "application/json" },
  });
  if (resposta.status === 404) throw new ErroConsulta(404, "CNPJ nao encontrado");
  if (!resposta.ok) throw new ErroConsulta(502, "nao foi possivel consultar o CNPJ");
  const corpo: any = await resposta.json().catch(() => null);
  const retorno = {
    cnpj: somenteDigitos(corpo?.cnpj),
    nome: String(corpo?.razao_social || corpo?.nome_fantasia || "").trim(),
    cep: somenteDigitos(corpo?.cep),
    endereco: String(corpo?.logradouro ?? "").trim(),
    numero: String(corpo?.numero ?? "").trim(),
    complemento: String(corpo?.complemento ?? "").trim(),
    bairro: String(corpo?.bairro ?? "").trim(),
    cidade: String(corpo?.municipio ?? "").trim(),
    uf: String(corpo?.uf ?? "").trim().toUpperCase(),
  };
  if (retorno.cnpj !== cnpj || !retorno.nome || !/^\d{8}$/.test(retorno.cep) ||
    [retorno.endereco, retorno.numero, retorno.bairro, retorno.cidade].some((v) => !v) ||
    !/^[A-Z]{2}$/.test(retorno.uf)) {
    throw new ErroConsulta(502, "cadastro incompleto do CNPJ");
  }
  return retorno;
}
