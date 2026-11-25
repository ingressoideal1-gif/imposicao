import { banco } from "./banco.ts";
import { hashCodigo } from "./hash.ts";
import { fonteDosCodigosPorModelo } from "./pedidos.ts";
import {
  conteudoDoIngresso,
  type ContratoQr,
  type PlanoModelo,
  planoDoModelo,
  sequenciaDoContrato,
  sequenciaDoIngresso,
} from "./preparacao_codigos.ts";

type Contrato = Pick<ContratoQr, "pedido" | "modelo" | "versao" | "inicio" | "passo" | "posicao" | "posicoes" | "quantidade">;
type Par = { pedido: number; modelo: number };
type Exibicao = { ni: number; np?: number };
type PlanoPublicado = { plano: PlanoModelo; publicados: number };

/** `numero` continua sendo a identidade ordinal usada na emissão e nos bloqueios.
 * O valor impresso vem do contrato congelado, nunca do modelo editável do ERP.
 * Sem contrato QR12 não reinterpretamos credenciais legadas/importadas.
 */
export function numeroImpresso(credencial: any, contrato?: Contrato): number | undefined {
  if (credencial.origem !== "qr_ideal" || !contrato || contrato.versao !== 2) return undefined;
  if (contrato.pedido !== credencial.pedido_id_int || contrato.modelo !== credencial.modelo_id) {
    throw new Error("Contrato de numeração de outra credencial.");
  }
  const sequencia = sequenciaDoContrato(contrato);
  const ordem = credencial.numero;
  if (!Number.isSafeInteger(ordem) || ordem < 1 || ordem > sequencia.quantidade) {
    throw new Error("Contrato de numeração inválido para a credencial.");
  }
  return sequenciaDoIngresso(sequencia, ordem - 1).valor;
}

function chave(pedido: number, modelo: number): string {
  return `${pedido}/${modelo}`;
}

function larguraDoTexto(numeracao: any, posicao: number): number | undefined {
  const larguras = new Set<number>();
  for (const el of numeracao?.elements ?? []) {
    if (el?.type !== "TEXT" || el.fixed || el.database_text || el.source === "database") continue;
    if (numeracao.tipo === "TICKET" && Number(el.ticket_pos || 1) !== posicao) continue;
    const pad = Number(el.pad ?? 0);
    if (Number.isSafeInteger(pad) && pad >= 0 && pad <= 100) larguras.add(pad);
  }
  return larguras.size === 1 ? larguras.values().next().value : undefined;
}

function planoConvencional(fonte: any): PlanoModelo | undefined {
  if (!fonte) return undefined;
  try {
    const plano = planoDoModelo(fonte);
    return plano && plano.tipo !== "QR_IDEAL" ? plano : undefined;
  } catch {
    // Uma alteração inválida do gabarito não impede a portaria de ler a faixa.
    return undefined;
  }
}

async function planosPublicados(pares: Par[]): Promise<Map<string, PlanoPublicado>> {
  const pedidos = [...new Set(pares.map(p => p.pedido))];
  const preparacoes = await banco("GET", `producao_acesso_preparacoes?pedido_id_int=in.(${pedidos.join(",")})` +
    "&select=pedido_id_int,proximo,plano");
  const publicados = new Map<string, PlanoPublicado>();
  for (const p of preparacoes ?? []) {
    let restantes = p.proximo;
    for (const plano of p.plano) {
      if (restantes <= 0) break;
      const quantidade = Math.min(restantes, plano.quantidade);
      restantes -= quantidade;
      if (plano.tipo !== "QR_IDEAL") {
        publicados.set(chave(p.pedido_id_int, plano.modelo), { plano, publicados: quantidade });
      }
    }
  }
  return publicados;
}

async function numeroConvencional(
  c: any,
  sal: string,
  publicado: PlanoPublicado | undefined,
  atual: PlanoModelo | undefined,
  numeracao: any,
): Promise<Exibicao | undefined> {
  if (!Number.isSafeInteger(c.numero) || c.numero < 1) return;
  const indice = c.numero - 1;
  const confirmado = publicado && c.numero <= publicado.publicados ? publicado.plano : undefined;
  const vigente = atual && c.numero <= atual.quantidade ? atual : undefined;
  const plano = confirmado ?? vigente;
  if (!plano) return;

  const conteudo = conteudoDoIngresso(null, c.pedido_id_int, plano, indice);
  // A preparação valida os hashes lote a lote. As demais credenciais só
  // adotam o gabarito atual quando ele reproduz o código já publicado.
  if (!confirmado && await hashCodigo(conteudo, sal) !== c.codigo_hash) return;

  const { valor, via } = sequenciaDoIngresso(plano, indice);
  const sequenciaVigente = vigente && sequenciaDoIngresso(vigente, indice);
  const textoVigente = vigente === plano || (vigente && sequenciaVigente?.valor === valor &&
    sequenciaVigente.via.posicao === via.posicao &&
    conteudoDoIngresso(null, c.pedido_id_int, vigente, indice) === conteudo);
  const pad = (textoVigente ? larguraDoTexto(numeracao, via.posicao) : undefined) ?? via.pad;
  return pad > 0 ? { ni: valor, np: pad } : { ni: valor };
}

export async function numerosImpressos(
  credenciais: any[],
  sais: Readonly<Record<string, string>>,
): Promise<Map<string, Exibicao>> {
  const pares = new Map<string, Par>();
  for (const c of credenciais) {
    if (c.origem !== "qr_ideal" || !Number.isSafeInteger(c.pedido_id_int) ||
        !Number.isSafeInteger(c.modelo_id)) continue;
    pares.set(chave(c.pedido_id_int, c.modelo_id), { pedido: c.pedido_id_int, modelo: c.modelo_id });
  }
  const contratos = new Map<string, Contrato>();
  const lista = [...pares.values()];
  for (let i = 0; i < lista.length; i += 50) {
    const filtro = lista.slice(i, i + 50).map(p =>
      `and(pedido.eq.${p.pedido},modelo.eq.${p.modelo})`).join(",");
    const linhas = await banco("GET",
      `producao_acesso_qr_contratos?or=(${filtro})&select=pedido,modelo,versao,inicio,passo,posicao,posicoes,quantidade&limit=50`);
    if (!Array.isArray(linhas)) throw new Error("Resposta de contratos de numeração inválida.");
    for (const c of linhas) contratos.set(chave(c.pedido, c.modelo), c);
  }
  const resultado = new Map<string, Exibicao>();
  for (const c of credenciais) {
    const valor = numeroImpresso(c, contratos.get(chave(c.pedido_id_int, c.modelo_id)));
    if (valor !== undefined) resultado.set(c.id, { ni: valor });
  }

  const semContrato = lista.filter(p => !contratos.has(chave(p.pedido, p.modelo)) &&
    /^[a-f0-9]{64}$/i.test(sais[p.pedido]));
  const publicados = new Map<string, PlanoPublicado>();
  const atuais = new Map<string, { plano?: PlanoModelo; numeracao: any }>();
  for (let i = 0; i < semContrato.length; i += 50) {
    const lote = semContrato.slice(i, i + 50);
    const [planos, fontes] = await Promise.all([planosPublicados(lote), fonteDosCodigosPorModelo(lote)]);
    for (const [id, plano] of planos) publicados.set(id, plano);
    for (const m of fontes) atuais.set(chave(m.id_int, m.id), { plano: planoConvencional(m), numeracao: m.numeracao });
  }

  const convencionais = credenciais.filter(c => {
    const id = chave(c.pedido_id_int, c.modelo_id);
    return c.origem === "qr_ideal" && !contratos.has(id) && (publicados.has(id) || atuais.get(id)?.plano);
  });
  for (let i = 0; i < convencionais.length; i += 32) {
    await Promise.all(convencionais.slice(i, i + 32).map(async c => {
      const id = chave(c.pedido_id_int, c.modelo_id);
      const atual = atuais.get(id);
      const numero = await numeroConvencional(c, sais[c.pedido_id_int], publicados.get(id), atual?.plano, atual?.numeracao);
      if (numero) resultado.set(c.id, numero);
    }));
  }
  return resultado;
}
