/**
 * A senha semanal que libera um peso fora dos 5 % do estimado.
 *
 * No Painel do Acabamento, o peso real de um setor nao pode divergir mais de
 * 5 % do estimado do ERP sem alguem liberar. Quem libera digita uma senha de
 * tres caracteres -- 1 letra + 2 digitos, ex. `K47` -- que aparece no Menu
 * Usuarios para quem pode ver aquela tela.
 *
 * ## Por que a senha e DERIVADA, e nao sorteada e guardada
 *
 * `HMAC-SHA256(segredo, "senha-liberacao-peso:" + <semana>)`, em que <semana>
 * e a semana ISO no fuso de Sao Paulo (`2026-W34`). Tres consequencias:
 *
 *   - nao existe tabela de senhas, nem rotina que gere a da semana que vem: a
 *     senha MUDA SOZINHA toda segunda-feira 00:00 de Sao Paulo, porque a
 *     chave muda;
 *   - toda estacao e o site calculam a mesma senha, sem sincronizar nada;
 *   - trocar o segredo troca a senha de todas as estacoes na hora.
 *
 * O fuso e o da grafica, e nao o UTC, de proposito: se a senha virasse as
 * 00:00Z, ela mudaria as 21:00 de domingo na mesa do acabamento, e um operador
 * que leu a senha de manha a veria recusada a noite.
 *
 * ## Por que o segredo mora em `imposition_segredos`
 *
 * `PESO_LIBERACAO_SEGREDO` e lido pela `precisaDoSegredo`, que olha o ambiente
 * primeiro e a tabela depois (`segredos.ts`). A conta que opera este projeto
 * nao grava em Edge Functions -> Secrets, entao a tabela e o lugar que ela
 * ALCANCA. O valor foi sorteado dentro do banco (`gen_random_bytes`) em
 * 21/08/2026 e nunca passou por arquivo, terminal ou transcricao.
 *
 * ## O que sai daqui, e para quem
 *
 * A senha em si so e devolvida a quem pode ver o Menu Usuarios. Para a tela
 * do operador viaja apenas o que ele digitou, e volta sim ou nao -- por isso
 * `conferirSenha` existe separada de `senhaAtual`.
 */
import { iguaisEmTempoConstante } from "./assinatura.ts";
import { precisaDoSegredo } from "./segredos.ts";

export const SEGREDO_SENHA_LIBERACAO = "PESO_LIBERACAO_SEGREDO";
export const FUSO = "America/Sao_Paulo";

/**
 * O prefixo separa este uso do segredo de qualquer outro que um dia venha a
 * usar a mesma chave: o HMAC de `2026-W34` sozinho poderia coincidir com o de
 * outro modulo, e ai uma senha vazada abriria duas portas.
 */
const PREFIXO = "senha-liberacao-peso:";

const UM_DIA = 86_400_000;

/** AAAA-MM-DD a partir de um `Date` tratado como data civil em UTC. */
function dataIso(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${
    String(d.getUTCDate()).padStart(2, "0")
  }`;
}

/**
 * A data civil de `agora` em Sao Paulo, como {ano, mes, dia}.
 *
 * `formatToParts` em vez de `format`: o texto montado por `en-CA` e
 * `2026-08-21` hoje, mas a ordem dos pedacos e decisao do locale, e a dos
 * tipos nao. Ler pelo tipo nao depende disso.
 */
function dataCivilEmSaoPaulo(agora: Date): { ano: number; mes: number; dia: number } {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(agora);
  const pega = (tipo: string) =>
    Number(partes.find((p) => p.type === tipo)?.value ?? NaN);
  return { ano: pega("year"), mes: pega("month"), dia: pega("day") };
}

/**
 * "2026-W34" e as datas (AAAA-MM-DD) da segunda e do domingo, no fuso de SP.
 *
 * Semana ISO: segunda e o primeiro dia, e a semana 1 e a que contem a
 * primeira quinta-feira do ano (equivale a: a que contem 4 de janeiro). Por
 * isso o ano da chave e o ano da QUINTA daquela semana, e nao o da data --
 * 1/1/2027 e sexta e pertence a `2026-W53`.
 *
 * A conta e feita sobre `Date.UTC` da data civil, e so sobre ela: o instante
 * ja foi convertido para o dia de Sao Paulo, e dali em diante so interessa o
 * calendario. Misturar os dois de novo e o que faria a semana virar na hora
 * errada.
 */
export function semanaDe(agora: Date): { chave: string; inicio: string; fim: string } {
  const { ano, mes, dia } = dataCivilEmSaoPaulo(agora);
  const hoje = new Date(Date.UTC(ano, mes - 1, dia));
  // getUTCDay: domingo = 0. Para a ISO, segunda = 0 ... domingo = 6.
  const desdeSegunda = (hoje.getUTCDay() + 6) % 7;
  const segunda = new Date(hoje.getTime() - desdeSegunda * UM_DIA);
  const domingo = new Date(segunda.getTime() + 6 * UM_DIA);
  const quinta = new Date(segunda.getTime() + 3 * UM_DIA);

  const anoIso = quinta.getUTCFullYear();
  const primeiroDeJaneiro = Date.UTC(anoIso, 0, 1);
  // Dias corridos de 1/1 ate a quinta, inclusive os dois, em semanas cheias.
  const semana = Math.ceil(((quinta.getTime() - primeiroDeJaneiro) / UM_DIA + 1) / 7);

  return {
    chave: `${anoIso}-W${String(semana).padStart(2, "0")}`,
    inicio: dataIso(segunda),
    fim: dataIso(domingo),
  };
}

/**
 * Pura: HMAC-SHA256(segredo, "senha-liberacao-peso:" + chave) -> 1 letra + 2 digitos.
 *
 * Letra = `bytes[0] % 26`; digitos = `((bytes[1] << 8) | bytes[2]) % 100`. Sao
 * 2.600 senhas possiveis, o que e pouco contra quem tenta todas -- mas quem
 * tenta esta numa tela da grafica, e o que a senha protege e uma divergencia
 * de peso, nao um cofre. Trocar a formula troca a senha de TODAS as estacoes
 * no dia da publicacao; o teste fixa o valor para isso nao acontecer por
 * descuido.
 *
 * Recebe o segredo como texto, e nao o le, para ser testavel sem banco e sem
 * ambiente.
 */
export async function senhaDaSemana(segredo: string, chave: string): Promise<string> {
  const enc = new TextEncoder();
  const chaveHmac = await crypto.subtle.importKey(
    "raw",
    enc.encode(segredo),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(
    await crypto.subtle.sign("HMAC", chaveHmac, enc.encode(PREFIXO + chave)),
  );
  const letra = String.fromCharCode(65 + (mac[0] % 26));
  const digitos = String(((mac[1] << 8) | mac[2]) % 100).padStart(2, "0");
  return letra + digitos;
}

/** Le o segredo (precisaDoSegredo) e devolve a senha de agora. */
export async function senhaAtual(
  agora: Date = new Date(),
): Promise<{ senha: string; semana: string; inicio: string; fim: string }> {
  const { chave, inicio, fim } = semanaDe(agora);
  const senha = await senhaDaSemana(await precisaDoSegredo(SEGREDO_SENHA_LIBERACAO), chave);
  return { senha, semana: chave, inicio, fim };
}

/**
 * O que o operador digitou, do jeito que se compara: sem espacos em volta e
 * em maiusculas. Nao-texto vira vazio -- `confere: false` adiante, e nao erro,
 * porque um corpo sem senha e o operador clicando sem digitar, nao um defeito.
 */
export function normalizarSenha(bruto: unknown): string {
  if (typeof bruto !== "string") return "";
  return bruto.trim().toUpperCase();
}

/**
 * Pura: o texto digitado contra a senha esperada, em tempo constante.
 *
 * O `===` sai no primeiro caractere diferente, e com 2.600 senhas possiveis o
 * tempo de resposta ja diria qual letra esta certa. Ver `assinatura.ts`.
 */
export function conferirContra(bruto: unknown, esperada: string): boolean {
  const digitada = normalizarSenha(bruto);
  if (!digitada) return false;
  return iguaisEmTempoConstante(digitada, esperada);
}

/** trim + maiusculas; compara em tempo constante com a senha de agora. */
export async function conferirSenha(bruto: unknown, agora?: Date): Promise<boolean> {
  // Vazio e "nao confere" antes de ir ao segredo: nao custa uma ida ao banco
  // e nao vira 503 num servidor sem o segredo so porque alguem clicou Liberar
  // com o campo em branco.
  if (!normalizarSenha(bruto)) return false;
  return conferirContra(bruto, (await senhaAtual(agora)).senha);
}
