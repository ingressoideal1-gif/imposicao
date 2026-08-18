/**
 * O QUE muda na configuracao do evento, separado de QUEM pode mudar.
 *
 * Porte das funcoes `_aplicar_*` de `acesso_config.py`. O Python ja fazia essa
 * separacao, e ela e o que permite as duas telas dividirem a escrita: a tela do
 * cliente exige elevacao de 15 minutos, a da grafica exige papel ADM ou
 * Atendimento, e as duas terminam chamando exatamente as mesmas funcoes daqui.
 *
 * Nada neste arquivo decide se alguem pode. Quem decide sao as funcoes
 * `acesso-conta` e `acesso-interno`, cada uma com sua regra, antes de chamar.
 */
import { banco } from "./banco.ts";
import { hashCodigo, hashDoToken, tokenNovo } from "./hash.ts";
import { Recusa } from "./sessao.ts";

/** A portaria decide a fila por isto; nada mais existe. */
export const TIPOS_DE_USO = ["unico", "reentrada"];

export const MAXIMO_CODIGOS = 5000;
export const TAMANHO_MAXIMO_DO_CODIGO = 64;

/**
 * Sem `0`, `O`, `1`, `I` e `L`: o porteiro le este codigo de um papel, e esses
 * cinco caracteres sao erro garantido. Sao 31 simbolos, e 31^6 ~= 8,9 x 10^8.
 */
const ALFABETO_CODIGO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const TAMANHO_CODIGO = 6;

// ── Validadores ─────────────────────────────────────────────────────────────

/**
 * Apara espacos e checa tamanho. `campo` entra na mensagem para o dono saber o
 * que corrigir sem precisar adivinhar qual caixa da tela errou.
 */
export function texto(valor: unknown, campo: string, minimo: number, maximo: number): string {
  const limpo = String(valor ?? "").trim();
  if (limpo.length < minimo || limpo.length > maximo) {
    throw new Recusa(422, `${campo}: escreva de ${minimo} a ${maximo} caracteres`);
  }
  return limpo;
}

/**
 * O formato que o `datetime.fromisoformat` do Python aceita.
 *
 * A regex existe porque o `Date` do JavaScript e MAIS permissivo que o Python:
 * ele engole "2026", "Sept 28 2026" e outras formas que o `fromisoformat`
 * recusa. Sem ela, o Render recusaria 422 e a Edge Function gravaria -- e a
 * divergencia so apareceria como um horario estranho na tela do dono.
 */
const FORMATO_ISO = new RegExp(
  "^(?<ano>\\d{4})(?<td>-?)(?<mes>\\d{2})\\k<td>(?<dia>\\d{2})" +
    "([T ]\\d{2}(?<th>:?)\\d{2}(\\k<th>\\d{2}(\\.\\d{1,9})?)?" +
    "([+-]\\d{2}:?\\d{2}|Z)?)?$",
);

/**
 * O calendario de verdade, que a regex sozinha nao cobre.
 *
 * `2026-02-30` passa em qualquer regex de formato, e o `Date` do JavaScript
 * ACEITA: ele rola para 2 de marco e devolve um instante valido. O Python
 * recusa. Sem esta conferencia, o dono digitava 30 de fevereiro, o Render
 * dizia 422 e a Edge Function gravava 2 de marco -- uma data que ninguem
 * escolheu, na hora de abrir o portao.
 */
function diaQueExiste(ano: number, mes: number, dia: number): boolean {
  if (mes < 1 || mes > 12 || dia < 1) return false;
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 &&
    d.getUTCDate() === dia;
}

/**
 * A forma compacta (`20260928T2000`) vira extendida antes do `Date.parse`.
 *
 * O `fromisoformat` do Python aceita as duas; o `Date.parse` so aceita a
 * extendida. Medido caso a caso contra `acesso_config._momento` -- os casos
 * estao em `momento_casos.json`. As `\1` e `\2` da regex acima existem pelo
 * mesmo motivo: elas forcam a mesma escolha (com ou sem separador) no campo
 * inteiro, senao `2026-0928` passaria, o que nenhum dos dois lados aceita.
 */
function paraFormaExtendida(texto: string): string {
  const m = texto.match(
    /^(\d{4})(\d{2})(\d{2})([T ](\d{2})(\d{2})((\d{2})(\.\d+)?)?(.*))?$/,
  );
  if (!m) return texto;
  const hora = m[4]
    ? `T${m[5]}:${m[6]}${m[8] ? `:${m[8]}${m[9] ?? ""}` : ""}${m[10] ?? ""}`
    : "";
  return `${m[1]}-${m[2]}-${m[3]}${hora}`;
}

/**
 * Um instante para o banco, ou `null`.
 *
 * `null` e `""` sao o mesmo pedido -- sem limite daquele lado --, porque o dono
 * precisa de um jeito de voltar atras depois de ter posto um horario; a unica
 * alternativa seria inventar uma data absurda.
 *
 * A validacao e de FORMA, nao de calendario: o `datetime-local` do navegador
 * manda "2026-09-28T20:00", e o Postgres aceita. Data impossivel e recusada
 * pelo proprio banco, e repetir a regra aqui seria uma segunda verdade para
 * manter.
 */
export function momento(valor: unknown, campo: string): string | null {
  if (valor === null || valor === undefined) return null;
  const texto = String(valor).trim();
  if (texto === "") return null;
  const g = FORMATO_ISO.exec(texto)?.groups;
  if (
    !g ||
    !diaQueExiste(Number(g.ano), Number(g.mes), Number(g.dia)) ||
    Number.isNaN(instanteEmMs(texto))
  ) {
    throw new Recusa(422, `${campo}: escreva uma data e hora validas, ou deixe vazio`);
  }
  return texto;
}

/**
 * Milissegundos do instante, tratando data sem fuso como UTC.
 *
 * Sem o `Z` acrescentado, o JavaScript le "2026-09-28T20:00" como hora LOCAL
 * do servidor -- e o Python, em `_conferir_janela`, trata como UTC. Duas
 * janelas iguais dariam resultados diferentes conforme o fuso da maquina.
 */
function instanteEmMs(bruto: string): number {
  const texto = paraFormaExtendida(bruto);
  const temFuso = /([+-]\d{2}:?\d{2}|Z)$/.test(texto);
  // O `Date.parse` corta a fracao em 3 casas, e o Python guarda 6. Nao importa:
  // isto so serve para COMPARAR abre_em com fecha_em, e o que vai para o banco
  // e sempre o texto original, sem passar por aqui.
  return Date.parse(texto.replace(" ", "T") + (temFuso ? "" : "Z"));
}

/**
 * Fechar antes de abrir recusa SEMPRE, nao "as vezes".
 *
 * O dono descobriria isso com a fila na porta. E como o baile que vira a
 * madrugada e o caso normal -- abre sabado 22h, fecha domingo 5h --, a confusao
 * natural aqui e errar o DIA; por isso a mensagem diz o que esta errado, e nao
 * so "invalido".
 */
export function conferirJanela(abre: string | null, fecha: string | null): void {
  if (!abre || !fecha) return; // um lado so e configuracao legitima
  if (instanteEmMs(fecha) <= instanteEmMs(abre)) {
    throw new Recusa(
      422,
      "a hora em que fecha tem de ser depois da hora em que abre " +
        "— confira se o dia esta certo, no caso de virar a madrugada",
    );
  }
}

// ── Evento e setor ──────────────────────────────────────────────────────────

export async function aplicarEvento(eventoId: string, corpo: any): Promise<any> {
  const mudanca: Record<string, unknown> = {};
  if ("nome_evento" in corpo) {
    mudanca.nome_evento = texto(corpo.nome_evento, "nome do evento", 1, 120);
  }
  if ("local_evento" in corpo) {
    mudanca.local_evento = texto(corpo.local_evento, "local", 0, 200) || null;
  }
  if ("data_evento" in corpo) mudanca.data_evento = corpo.data_evento || null;
  // Os TRES estados que a tela oferece, e o que cada um significa para quem
  // esta no portao:
  //
  //   ativo       -- os portoes leem.
  //   encerrado   -- pausa: sai de cartaz, os portoes param, continua em
  //                  "Meus Eventos" para o dono religar num toque.
  //   finalizado  -- arquivo: o evento acabou, vai para a lista de finalizados
  //                  e os portoes param. Da para reabrir.
  //
  // A portaria nao precisou mudar por causa do `finalizado`: a carga manda
  // `ativo: status === "ativo"`, entao qualquer estado que nao seja `ativo` ja
  // fecha a porta.
  //
  // `excluido` continua FORA, e a coluna aceita -- e por isso que a conferencia
  // existe. Apagar evento nao e o que a engrenagem oferece: um evento acontece
  // e termina, ele nao deixa de ter existido. Um valor a mais aqui seria a
  // diferenca entre "o dono arquivou o evento" e "o evento sumiu da conta
  // dele", sem volta e sem nada na tela que explicasse.
  if ("status" in corpo) {
    const s = String(corpo.status ?? "").trim();
    if (s !== "ativo" && s !== "encerrado" && s !== "finalizado") {
      throw new Recusa(422, "status do evento: ativo, encerrado ou finalizado");
    }
    mudanca.status = s;
  }

  if (Object.keys(mudanca).length) {
    await banco("PATCH", `producao_acesso_eventos?id=eq.${eventoId}`, mudanca, "return=minimal");
  }
  return { ok: true, gravado: Object.keys(mudanca).sort() };
}

/**
 * Recomecar a contagem de um evento: as entradas somem, os ingressos ficam.
 *
 * ## Para que serve
 *
 * O dono testa o portao antes do publico chegar -- le o proprio ingresso tres
 * vezes para ver a tela verde -- e depois quer o contador em zero. Sem isto, o
 * jeito de limpar um teste era nao testar.
 *
 * ## O que sai e o que FICA
 *
 * Saem as entradas unicas (a linha que decide a corrida entre dois portoes) e
 * as leituras (de onde sai o numero na tela). Ficam as credenciais, os setores
 * e os aparelhos, e essa escolha e do usuario: apagar as credenciais faria o
 * portao recusar todo mundo como `desconhecido`, e apagar os aparelhos exigiria
 * parear os celulares de novo, um a um, com o evento prestes a comecar.
 *
 * ## Por que a ordem importa
 *
 * Apaga primeiro, carimba por ultimo. O carimbo e o que manda os portoes
 * esquecerem o que ja baixaram; se ele existisse antes de as linhas sairem, o
 * celular esvaziaria a lista local e o sincronismo seguinte a encheria de novo
 * com as mesmas entradas -- o dono veria o contador voltar sozinho. Falhando no
 * meio, nada foi carimbado e apertar de novo termina o servico: os tres passos
 * sao repetiveis.
 */
export async function zerarEntradas(eventoId: string): Promise<any> {
  await banco(
    "DELETE",
    `producao_acesso_entradas_unicas?evento_id=eq.${eventoId}`,
    undefined,
    "return=minimal",
  );
  await banco(
    "DELETE",
    `producao_acesso_leituras?evento_id=eq.${eventoId}`,
    undefined,
    "return=minimal",
  );

  // `now()` e o relogio do BANCO, e nao o desta funcao, de proposito -- o mesmo
  // motivo do `momento` da tabela de falhas de pareamento. O aparelho compara
  // esta marca com a que guardou, e uma marca vinda de um relogio diferente do
  // que carimba as linhas poderia cair antes de entradas que ela deveria
  // apagar.
  //
  // `return=representation` (o padrao do `banco()` para PATCH) e o que devolve o
  // instante escolhido pelo banco. Sem ele nao haveria o que responder, e a tela
  // teria de perguntar de novo so para saber a hora.
  const linha = ((await banco(
    "PATCH",
    `producao_acesso_eventos?id=eq.${eventoId}&select=entradas_zeradas_em`,
    { entradas_zeradas_em: "now()" },
  )) ?? [])[0];

  return { ok: true, zerado_em: linha?.entradas_zeradas_em ?? null };
}

/**
 * `setor` e a linha JA LIDA do banco -- quem chama e que decide como encontra-la
 * e se pode toca-la.
 *
 * Nem `quantidade` nem `lotacao` entram, e e a mesma razao para as duas: quem
 * manda na tiragem contratada e o ERP, e a lotacao do setor E essa tiragem.
 * Aceitar qualquer uma delas aqui criaria uma segunda fonte da verdade, que
 * passa a discordar do contrato no instante em que o cliente aumenta o pedido.
 */
export async function aplicarSetor(setor: any, corpo: any): Promise<any> {
  const mudanca: Record<string, unknown> = {};
  if ("nome" in corpo) mudanca.nome = texto(corpo.nome, "nome do setor", 1, 60);
  if ("tipo_uso" in corpo) {
    const tipo = String(corpo.tipo_uso ?? "").trim();
    if (!TIPOS_DE_USO.includes(tipo)) {
      throw new Recusa(
        422,
        "tipo de uso: escolha 'vale uma entrada so' ou 'permite sair e voltar'",
      );
    }
    mudanca.tipo_uso = tipo;
  }
  if ("abre_em" in corpo) mudanca.abre_em = momento(corpo.abre_em, "hora em que abre");
  if ("fecha_em" in corpo) mudanca.fecha_em = momento(corpo.fecha_em, "hora em que fecha");

  // Bloquear o setor INTEIRO. Diferente do bloqueio de faixa, que mora em outra
  // tabela: aqui a porta para de receber gente, e nao um lote de numeros.
  if ("bloqueado" in corpo) {
    // Booleano de verdade, e nao o que o JavaScript considera verdadeiro: a
    // palavra "sim" -- ou qualquer texto -- fecharia o setor sem que ninguem
    // tivesse pedido, e o dono so descobriria pela fila parada na porta.
    if (typeof corpo.bloqueado !== "boolean") {
      throw new Recusa(422, "bloqueado: verdadeiro ou falso");
    }
    mudanca.bloqueado = corpo.bloqueado;
    if (corpo.bloqueado) {
      // O motivo e o que o porteiro le em voz alta para quem esta na fila.
      // Bloqueio mudo vira "nao sei, o sistema nao deixou".
      mudanca.bloqueado_motivo = texto(
        corpo.bloqueado_motivo,
        "motivo do bloqueio",
        1,
        200,
      );
    } else {
      // Liberou, o motivo vai junto: motivo velho grudado num setor liberado
      // reapareceria na proxima recusa, falando de um bloqueio que ja acabou.
      mudanca.bloqueado_motivo = null;
    }
  }

  // Contra o que JA ESTA gravado, e nao so contra o que veio no corpo: a tela
  // manda apenas o que o dono mexeu. Comparar so os dois campos do corpo
  // deixaria uma janela invertida entrar pela porta dos fundos, um campo de
  // cada vez -- grava o `abre_em` tarde hoje, o `fecha_em` cedo em seguida, e
  // nenhuma das duas chamadas ve o par completo.
  if ("abre_em" in mudanca || "fecha_em" in mudanca) {
    conferirJanela(
      ("abre_em" in mudanca ? mudanca.abre_em : setor.abre_em) as string | null,
      ("fecha_em" in mudanca ? mudanca.fecha_em : setor.fecha_em) as string | null,
    );
  }

  if (Object.keys(mudanca).length) {
    await banco("PATCH", `producao_acesso_setores?id=eq.${setor.id}`, mudanca, "return=minimal");
  }
  return { ok: true, gravado: Object.keys(mudanca).sort() };
}

// ── Bloqueio de faixas ──────────────────────────────────────────────────────

/** `[de, ate]` conferidos, ou 422 dizendo o que esta errado. */
export function faixa(corpo: any, quantidade: number): [number, number] {
  const de = Number(corpo?.de);
  const ate = Number(corpo?.ate);
  if (!Number.isInteger(de) || !Number.isInteger(ate)) {
    throw new Recusa(422, "de/ate: escreva o primeiro e o ultimo ingresso da faixa");
  }
  // A tiragem comeca em 1. `de = 0` costuma ser o dono pensando em indice.
  if (de < 1) throw new Recusa(422, "o primeiro ingresso da faixa e o 1");
  // Faixa invertida nao bloqueia ingresso NENHUM -- o pior resultado possivel,
  // porque o dono acha que bloqueou e so descobre na porta.
  if (ate < de) {
    throw new Recusa(422, "o ultimo ingresso da faixa tem de vir depois do primeiro");
  }
  // Nao faz mal bloquear numero que nao existe, mas quase sempre e o dono
  // confundindo o setor -- e o silencio o deixaria achando que protegeu
  // ingresso que esta em outro lugar.
  if (quantidade && ate > quantidade) {
    throw new Recusa(
      422,
      `este setor tem ${quantidade} ingressos; a faixa nao pode passar disso`,
    );
  }
  return [de, ate];
}

export async function aplicarBloqueio(setor: any, corpo: any, autorId: string): Promise<any> {
  const [de, ate] = faixa(corpo, Number(setor.quantidade ?? 0));
  // Obrigatorio, e e a razao de tudo isto existir: um bloqueio sem motivo
  // aparece na portaria como "recusado" e ninguem sabe o que dizer para a
  // pessoa que esta na frente.
  const motivo = texto(corpo?.motivo, "motivo", 1, 200);

  await banco("POST", "producao_acesso_bloqueios", {
    evento_id: setor.evento_id,
    setor_id: setor.id,
    de,
    ate,
    motivo,
    status: "ativo",
    criado_por: autorId,
  }, "return=minimal");
  return { ok: true, de, ate };
}

export async function aplicarLiberacao(setor: any, bloqueioId: string): Promise<any> {
  // O bloqueio tem de pertencer A ESTE setor. Sem esta conferencia, o dono de
  // um evento liberaria o bloqueio de outro cliente mandando o id alheio pela
  // propria URL -- a guarda de cima so provou que o SETOR e dele.
  const alvo = ((await banco(
    "GET",
    `producao_acesso_bloqueios?id=eq.${bloqueioId}&select=id,setor_id`,
  )) ?? [])[0];
  if (!alvo || String(alvo.setor_id) !== String(setor.id)) {
    throw new Recusa(403, "bloqueio nao encontrado neste setor");
  }

  // `status='removido'`, nunca DELETE: "liberamos o lote as 22h40" e informacao
  // que a portaria vai querer ter depois.
  await banco(
    "PATCH",
    `producao_acesso_bloqueios?id=eq.${bloqueioId}`,
    { status: "removido" },
    "return=minimal",
  );
  return { ok: true, liberado: bloqueioId };
}

// ── Aparelhos da portaria ───────────────────────────────────────────────────

/** `secrets.choice` do Python vira `crypto.getRandomValues` aqui.
 *
 * `Math.random()` NAO serve: ele e previsivel a partir de saidas anteriores, e
 * este codigo e a unica coisa entre um estranho e a carga do evento. */
export function sortearCodigo(): string {
  const bytes = new Uint8Array(TAMANHO_CODIGO * 4);
  crypto.getRandomValues(bytes);
  let saida = "";
  let i = 0;
  while (saida.length < TAMANHO_CODIGO) {
    // Rejeicao do resto: usar `% 31` direto daria peso maior aos primeiros
    // simbolos do alfabeto. Com 31 simbolos o vies seria pequeno, mas de graca.
    const b = bytes[i++ % bytes.length];
    if (b < 248) saida += ALFABETO_CODIGO[b % ALFABETO_CODIGO.length];
  }
  return saida;
}

export async function salDoEvento(eventoId: string): Promise<string> {
  const linha = ((await banco(
    "GET",
    `producao_acesso_eventos?id=eq.${eventoId}&select=sal`,
  )) ?? [])[0];
  if (!linha?.sal) throw new Recusa(409, "evento sem sal; recadastre o pedido");
  return linha.sal;
}

/** O mesmo PBKDF2 de 10.000 voltas do QR Ideal, com o sal do evento. */
export function hashDoCodigo(codigo: string, sal: string): Promise<string> {
  return hashCodigo(codigo.trim().toUpperCase(), sal);
}

/**
 * `status=eq.ativo`, para o mesmo filtro que o painel ja aplica: sem ele, um
 * aparelho podia ser vinculado a um setor que a tela nunca mostra, e o dono
 * nunca teria como saber que aquele vinculo existe.
 */
export async function setoresDoEvento(eventoId: string): Promise<Set<string>> {
  const linhas = (await banco(
    "GET",
    `producao_acesso_setores?evento_id=eq.${eventoId}&status=eq.ativo&select=id`,
  )) ?? [];
  return new Set(linhas.map((s: any) => String(s.id)));
}

export async function conferirSetores(eventoId: string, setores: unknown): Promise<string[]> {
  const pedidos = ((setores as unknown[]) ?? []).map((s) => String(s));
  const validos = await setoresDoEvento(eventoId);
  if (pedidos.some((s) => !validos.has(s))) {
    throw new Recusa(422, "ha setor que nao e deste evento na lista do aparelho");
  }
  return pedidos;
}

export async function trocarSetores(aparelhoId: string, setores: string[]): Promise<void> {
  await banco(
    "DELETE",
    `producao_acesso_dispositivo_setores?dispositivo_id=eq.${aparelhoId}`,
    undefined,
    "return=minimal",
  );
  if (setores.length) {
    await banco(
      "POST",
      "producao_acesso_dispositivo_setores",
      setores.map((s) => ({ dispositivo_id: aparelhoId, setor_id: s })),
      "return=minimal",
    );
  }
}

export async function aplicarAparelhoNovo(eventoId: string, corpo: any): Promise<any> {
  const nome = texto(corpo?.nome, "nome do aparelho", 1, 60);
  const setores = await conferirSetores(eventoId, corpo?.setores);
  const codigo = sortearCodigo();

  const criado = (await banco("POST", "producao_acesso_dispositivos", {
    evento_id: eventoId,
    nome,
    codigo_hash: await hashDoCodigo(codigo, await salDoEvento(eventoId)),
  }))[0];
  await trocarSetores(criado.id, setores);

  // O codigo volta AQUI e nunca mais: o que fica guardado e o hash.
  return { id: criado.id, nome, codigo };
}

/**
 * O aparelho configurado NO PROPRIO APARELHO.
 *
 * Difere do `aplicarAparelhoNovo` numa coisa que muda tudo: nao sorteia codigo
 * nenhum. O dono esta com o celular do portao na mao e acabou de digitar a
 * senha; o token vai DIRETO para este aparelho. Nao ha por que existir um
 * segredo intermediario para alguem digitar -- e existir seria pior, porque
 * codigo guardado no banco e codigo que pearia um SEGUNDO celular naquele
 * portao.
 *
 * O token sai em claro UMA vez, nesta resposta. O banco guarda so o hash, pelo
 * mesmo `hashDoToken` com que a portaria o confere a cada leitura.
 *
 * `ultimo_visto` ja nasce preenchido: o aparelho comeca a trabalhar agora, e
 * deixa-lo nulo faria a tela do dono mostrar um portao que "nunca apareceu"
 * enquanto ele le ingresso.
 */
export async function aplicarAparelhoAqui(eventoId: string, corpo: any): Promise<any> {
  const nome = texto(corpo?.nome, "nome do aparelho", 1, 60);
  const setores = await conferirSetores(eventoId, corpo?.setores);
  const token = tokenNovo();

  const criado = (await banco("POST", "producao_acesso_dispositivos", {
    evento_id: eventoId,
    nome,
    codigo_hash: null,
    token_hash: await hashDoToken(token),
    ultimo_visto: "now()",
  }))[0];
  await trocarSetores(criado.id, setores);

  return { id: criado.id, nome, setores, token };
}

export async function aplicarAparelho(aparelho: any, corpo: any): Promise<any> {
  const mudanca: Record<string, unknown> = {};
  if ("nome" in corpo) mudanca.nome = texto(corpo.nome, "nome do aparelho", 1, 60);
  if ("status" in corpo) {
    // `revogado` saiu em 18/08/2026, por decisao do usuario: quem nao serve
    // mais e EXCLUIDO, e quem so vai parar um pouco e PAUSADO. Um estado do
    // meio -- desligado para sempre, mas ocupando a lista -- nao era nenhuma
    // das duas coisas que ele queria fazer.
    //
    // Linhas antigas com `revogado` continuam no banco e a portaria continua
    // recusando-as, porque ela exige `status=eq.ativo`. Elas so nao podem mais
    // ser CRIADAS por aqui.
    if (corpo.status !== "ativo" && corpo.status !== "pausado") {
      throw new Recusa(422, "status: ativo ou pausado");
    }
    mudanca.status = corpo.status;
  }
  if (Object.keys(mudanca).length) {
    await banco(
      "PATCH",
      `producao_acesso_dispositivos?id=eq.${aparelho.id}`,
      mudanca,
      "return=minimal",
    );
  }

  if ("setores" in corpo) {
    await trocarSetores(
      aparelho.id,
      await conferirSetores(aparelho.evento_id, corpo.setores),
    );
  }
  return { ok: true };
}

/**
 * O aparelho sai do banco, e nao da lista so.
 *
 * Decisao do usuario em 18/08/2026: "deve excluir definitivamente o aparelho e
 * sumir da listagem". O que acontece com o que apontava para ele esta escrito
 * em `sql/schema_acesso_excluir_aparelho.sql`, e vale repetir porque e a parte
 * que nao se ve:
 *
 *   os VINCULOS de setor vao junto        (`on delete cascade`)
 *   as LEITURAS ficam, sem dono           (`on delete set null`)
 *
 * O historico do evento nao pode depender de o aparelho continuar existindo: a
 * contagem que o dono ve ("4.812 entraram") sai de `evento_id`, e apagar as
 * leituras junto faria o numero da noite mudar por causa de uma faxina.
 *
 * O `DELETE` dos vinculos vem explicito ANTES do cascade fazer o mesmo. Nao e
 * redundancia inutil: se um dia esta funcao rodar contra um banco onde a
 * migracao nao passou, ela ainda faz a coisa certa em vez de falhar com um erro
 * de chave estrangeira que ninguem liga ao aparelho.
 */
export async function excluirAparelho(aparelho: any): Promise<any> {
  await banco(
    "DELETE",
    `producao_acesso_dispositivo_setores?dispositivo_id=eq.${aparelho.id}`,
    undefined,
    "return=minimal",
  );
  await banco(
    "DELETE",
    `producao_acesso_dispositivos?id=eq.${aparelho.id}`,
    undefined,
    "return=minimal",
  );
  return { ok: true, excluido: aparelho.id };
}

export async function aplicarNovoCodigo(aparelho: any): Promise<any> {
  const codigo = sortearCodigo();
  await banco(
    "PATCH",
    `producao_acesso_dispositivos?id=eq.${aparelho.id}`,
    { codigo_hash: await hashDoCodigo(codigo, await salDoEvento(aparelho.evento_id)) },
    "return=minimal",
  );
  return { codigo };
}

// ── Os codigos do proprio cliente ───────────────────────────────────────────

export async function aplicarCodigos(eventoId: string, corpo: any): Promise<any> {
  const brutos: unknown[] = corpo?.codigos ?? [];
  if (brutos.length > MAXIMO_CODIGOS) {
    throw new Recusa(413, `envie no maximo ${MAXIMO_CODIGOS} codigos por vez`);
  }

  const setorId = String(corpo?.setor_id ?? "");
  if (!(await setoresDoEvento(eventoId)).has(setorId)) {
    throw new Recusa(422, "escolha um setor deste evento");
  }

  // Aparar, subir para maiuscula e reduzir repetidos PRESERVANDO A ORDEM em que
  // o cliente colou -- a ordem e a unica pista que ele tem para conferir.
  const vistos = new Set<string>();
  const limpos: string[] = [];
  for (const bruto of brutos) {
    const codigo = String(bruto ?? "").trim().toUpperCase();
    if (!codigo || vistos.has(codigo)) continue;
    if (codigo.length > TAMANHO_MAXIMO_DO_CODIGO) {
      throw new Recusa(
        422,
        `ha codigo com mais de ${TAMANHO_MAXIMO_DO_CODIGO} caracteres`,
      );
    }
    vistos.add(codigo);
    limpos.push(codigo);
  }

  if (!limpos.length) return { gravados: 0, ja_existiam: 0 };

  const sal = await salDoEvento(eventoId);
  const linhas = [];
  for (const c of limpos) {
    linhas.push({
      evento_id: eventoId,
      setor_id: setorId,
      codigo_hash: await hashCodigo(c, sal),
      codigo_visivel: c,
      origem: "cliente",
    });
  }

  // `return=representation` e nao `return=minimal`: `limpos.length` conta o que
  // foi ENVIADO, nao o que foi ESCRITO. Reenviar a mesma lista -- o que um dono
  // faz depois de escolher o setor errado -- grava zero linha nova (a chave
  // unica ignora o repetido), e sem isto a tela diria "42 codigos entraram" nas
  // duas vezes.
  const gravadas = (await banco(
    "POST",
    "producao_acesso_credenciais?on_conflict=chave_dedup",
    linhas,
    "resolution=ignore-duplicates,return=representation",
  )) ?? [];
  return { gravados: gravadas.length, ja_existiam: limpos.length - gravadas.length };
}
