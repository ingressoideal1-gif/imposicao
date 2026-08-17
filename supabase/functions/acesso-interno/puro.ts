/**
 * As pecas da tela interna que nao tocam em rede nem em banco.
 *
 * Moram em arquivo separado pelo mesmo motivo da portaria: o `index.ts` chama
 * `Deno.serve()` no topo, entao IMPORTA-LO liga um servidor, e um teste destas
 * funcoes teria de pedir permissao de rede e deixar um servidor pendurado.
 */

/**
 * O caminho depois do nome da funcao, em pedacos.
 *
 * A funcao e servida em `/functions/v1/acesso-interno/<...>`, e o caminho
 * tambem chega como `/acesso-interno/<...>` dependendo de como se chama. O
 * prefixo sai por regex, e nao contando segmentos: se o Supabase mudar o
 * formato e a conta de segmentos quebrar, TODAS as rotas viram 404 de uma vez e
 * a tela para sem dizer por que.
 */
export function pedacosDaRota(pathname: string): string[] {
  return pathname
    .replace(/^.*\/acesso-interno\/?/, "")
    .split("/")
    .filter((p) => p !== "")
    .map(decodeURIComponent);
}

/**
 * "2026-08-15T22:33:16+00:00" -> "2026-08-15T22:00". Nulo vira vazio.
 *
 * Porte de `_hora_cheia`. A hora e a do RELOGIO COMO ESCRITO, sem converter
 * fuso -- foi assim que o Python sempre se comportou, e medi caso a caso antes
 * de escrever isto (`hora_casos.json`).
 *
 * A primeira versao deste porte usava `toISOString()`, que converte para UTC:
 * "22:33:16-03:00" viraria "2026-08-16T01:00" em vez de "2026-08-15T22:00". O
 * `strftime` do Python formata os campos do objeto e ignora o deslocamento, e o
 * `replace(tzinfo=utc)` de la so entra quando a data vem SEM fuso -- onde nao
 * muda campo nenhum. O grafico por hora do dashboard sairia deslocado, e a
 * unica pista seria um pico numa hora em que nao entrou ninguem.
 *
 * Por isso a leitura e textual: os campos vem da propria escrita, e nao de um
 * `Date` que reinterpreta o fuso pelo caminho.
 */
const MOMENTO_ISO =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:[+-]\d{2}:?\d{2}|Z)?)?$/;

export function horaCheia(momento: unknown): string {
  if (!momento) return "";
  const m = MOMENTO_ISO.exec(String(momento));
  if (!m) return "";
  const [, ano, mes, dia, hora] = m;
  // O calendario ainda precisa existir: o Python levanta `ValueError` para
  // "2026-13-99", e a regex sozinha deixaria passar.
  const d = new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(dia)));
  if (
    d.getUTCFullYear() !== Number(ano) || d.getUTCMonth() !== Number(mes) - 1 ||
    d.getUTCDate() !== Number(dia) || Number(hora ?? 0) > 23
  ) {
    return "";
  }
  return `${ano}-${mes}-${dia}T${hora ?? "00"}:00`;
}

/** Porte de `_situacao`. A ordem importa: cancelado vence bloqueado, que vence
 * entrou -- um ingresso cancelado que tambem esta numa faixa bloqueada precisa
 * aparecer como cancelado, que e o estado mais forte. */
export function situacao(
  credencial: any,
  bloqueio: string | null,
  entrada: string | null,
): string {
  if ((credencial?.status ?? "ativo") !== "ativo") return "cancelado";
  if (bloqueio) return "bloqueado";
  if (entrada) return "entrou";
  return "disponivel";
}

/**
 * Mudou de casa na Fase 2b: as duas telas precisam da mesma regra, entao ela
 * vive em `_compartilhado/modelos.ts`. O reexport mantem os testes deste
 * modulo apontando para onde foram escritos.
 */
export { numeracaoDoModelo } from "../_compartilhado/modelos.ts";

/**
 * O tamanho de pagina pedido, preso entre 1 e o teto.
 *
 * O teto NAO pode passar de 1.000: o PostgREST corta toda resposta nesse
 * tamanho, em silencio, e um `limit` maior nao muda nada -- a pagina viria
 * cortada e a tela mostraria menos ingressos do que diz ter. Este projeto ja
 * foi mordido por isso tres vezes.
 */
export const POR_PAGINA_MAXIMO = 500;
export const POR_PAGINA_PADRAO = 200;

/**
 * O Python escreve `int(por_pagina or POR_PAGINA_PADRAO)`, e o `or` do Python
 * cai no padrao para QUALQUER valor falso -- inclusive `0` e `""`, e nao so
 * `None`. Um `0` pedido pela URL vira 200, e nao 1.
 *
 * Sem isto, `?por_pagina=0` traria UM ingresso por pagina no Render e
 * duzentos aqui, e ninguem entenderia por que a mesma tela pagina diferente
 * conforme o endereco.
 */
export function tamanhoDaPagina(pedido: unknown): number {
  const n = Number(pedido);
  if (!Number.isFinite(n) || n === 0) return POR_PAGINA_PADRAO;
  return Math.max(1, Math.min(Math.trunc(n), POR_PAGINA_MAXIMO));
}

export function numeroDaPagina(pedido: unknown): number {
  const n = Number(pedido);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.trunc(n));
}

/**
 * O termo de busca por texto, sem os caracteres que quebrariam o filtro.
 *
 * `*`, `,` e `&` tem significado na querystring do PostgREST; deixa-los passar
 * transformaria uma busca em outro filtro.
 */
export function termoSeguro(busca: string): string {
  return String(busca).replace(/[*,&]/g, "").slice(0, 64);
}

/**
 * O QR de instalacao aponta para ca. Um so, generico, sem nada dentro: quem o
 * le instala o aplicativo e entra com a conta que a grafica liberou. E o
 * dominio publico e nao o da estacao, porque o painel da grafica roda nos
 * dois e o QR vai para o celular do cliente.
 */
export const URL_DE_INSTALACAO = "https://ideal-imposition.vercel.app/ic/";

/** Os motivos que a portaria grava numa recusa, com o nome que o atendente
 * entende. Um dashboard que dissesse "setor_nao_autorizado" obrigaria quem esta
 * lendo a saber o vocabulario do banco. */
export const MOTIVOS: Record<string, string> = {
  desconhecido: "Código não existe neste evento",
  ja_entrou: "Ingresso já usado",
  setor_nao_autorizado: "Aparelho não valida este setor",
  fora_da_janela: "Fora do horário do setor",
  bloqueado: "Faixa bloqueada",
  cancelado: "Credencial cancelada",
  fora_do_evento: "De outro evento",
  erro_de_leitura: "Falha na leitura",
};
