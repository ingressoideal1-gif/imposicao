/**
 * As pecas do relatorio que nao tocam em rede nem em banco.
 *
 * Nasceram em `acesso-interno/puro.ts`, servindo so a tela da grafica. Mudaram
 * de casa em 04/09/2026, quando o DONO DO EVENTO passou a ver os mesmos numeros
 * no aplicativo dele -- e pela mesma razao que `numeracaoDoModelo` mudou antes:
 * duas telas que mostram o mesmo numero nao podem calcula-lo em dois lugares.
 *
 * O sintoma de duas copias aqui seria especialmente ruim, porque nao quebra
 * nada: a grafica diria 412 e o cliente diria 409, os dois com a tela aberta ao
 * mesmo tempo, e nao haveria como saber qual esta certo.
 *
 * O `acesso-interno/puro.ts` reexporta tudo o que esta aqui, entao os testes
 * escritos contra aquele modulo continuam apontando para onde foram escritos.
 */

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
 * Os motivos que a portaria grava numa recusa, com o nome que a pessoa entende.
 *
 * Um relatorio que dissesse "setor_nao_autorizado" obrigaria quem esta lendo a
 * saber o vocabulario do banco -- e quem le agora tambem e o dono do evento, no
 * celular, sem nenhuma obrigacao de saber o que o banco escreve.
 *
 * ESTA LISTA TEM DE COBRIR AS OITO REGRAS de `frontend/portaria-validacao.js`.
 * `evento_inativo` e `setor_bloqueado` faltavam aqui: entraram no validador
 * depois, e o relatorio mostrava o nome cru da coluna. Nao quebra nada, e e
 * exatamente por isso que passou -- ninguem olha um relatorio esperando
 * encontrar um erro de traducao. `tests/test_motivos_de_recusa.py` cobra a
 * lista inteira contra o validador.
 */
export const MOTIVOS: Record<string, string> = {
  evento_inativo: "Evento desligado",
  desconhecido: "Código não existe neste evento",
  ja_entrou: "Ingresso já usado",
  setor_nao_autorizado: "Aparelho não valida este setor",
  setor_bloqueado: "Setor desligado pelo dono",
  fora_da_janela: "Fora do horário do setor",
  bloqueado: "Faixa bloqueada",
  cancelado: "Credencial cancelada",
  fora_do_evento: "De outro evento",
  erro_de_leitura: "Falha na leitura",
};
