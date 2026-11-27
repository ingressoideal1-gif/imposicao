import { Recusa } from "./sessao.ts";
import { numeroDaPagina, tamanhoDaPagina, termoSeguro } from "./relatorio_puro.ts";
import { banco } from "./banco.ts";
import { setoresDoEvento } from "./painel_evento.ts";
import { dashboard, exportarLeiturasDoEvento, listarIngressos, leiturasDoEvento } from "./relatorio.ts";

// O mesmo relatório para conta e instalação autorizada por PIN.
export async function aoVivo(evento: any): Promise<any> {
  const setores = await setoresDoEvento(evento.id);
  const contratado = setores.reduce(
    (soma: number, s: any) => soma + Number(s.quantidade ?? 0),
    0,
  );
  const numeros = await dashboard(evento.id, setores, contratado);

  // `token_hash` NAO entra: e segredo, e o que a tela precisa saber e so se o
  // aparelho ja foi pareado e quando ele deu sinal pela ultima vez.
  const aparelhos = (await banco(
    "GET",
    `producao_acesso_dispositivos?evento_id=eq.${evento.id}` +
      "&select=id,nome,status,ultimo_visto&order=nome.asc",
  )) ?? [];

  return {
    evento: {
      id: evento.id,
      nome_evento: evento.nome_evento ?? null,
      data_evento: evento.data_evento ?? null,
      local_evento: evento.local_evento ?? null,
      status: evento.status ?? null,
      ao_vivo_na_leitura: evento.ao_vivo_na_leitura === true,
    },
    ...numeros,
    aparelhos,
    agora: new Date().toISOString(),
  };
}


export async function consultarRelatorio(evento: any, acao: string, parametros: URLSearchParams): Promise<any> {
  if (acao === "ao-vivo") return await aoVivo(evento);
  if (acao === "leituras") {
    if (parametros.get("exportar") === "1") return await exportarLeiturasDoEvento(evento.id);
    return await leiturasDoEvento(
      evento.id,
      numeroDaPagina(parametros.get("pagina") ?? 1),
      tamanhoDaPagina(parametros.get("por_pagina")),
    );
  }
  if (acao === "ingressos") {
    const setor = parametros.get("setor_id");
    if (setor && (!/^[a-f0-9-]{36}$/i.test(setor) || !(await banco("GET", `producao_acesso_setores?id=eq.${setor}&evento_id=eq.${evento.id}&select=id`))?.length)) throw new Recusa(403, "Setor de outro evento ou indisponível.");
    const busca = parametros.get("busca");
    return await listarIngressos(evento.id, setor, numeroDaPagina(parametros.get("pagina") ?? 1), tamanhoDaPagina(parametros.get("por_pagina")), busca === null ? null : termoSeguro(busca).trim());
  }
  throw new Recusa(404, "Relatório indisponível.");
}

export async function relatorioNaLeitura(aparelho: any, acao: string, parametros: URLSearchParams): Promise<any> {
  const evento = (await banco("GET", `producao_acesso_eventos?id=eq.${aparelho.evento_id}&select=id,nome_evento,data_evento,local_evento,status,ao_vivo_na_leitura`))?.[0];
  if (!evento || evento.ao_vivo_na_leitura !== true) throw new Recusa(403, "O AO VIVO não está liberado na leitura. Ative nas Configurações do evento.");
  return await consultarRelatorio(evento, acao, parametros);
}
