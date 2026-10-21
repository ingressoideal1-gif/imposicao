/** Segunda opção: modelos completos, HTML escapado e imagens incorporadas por CID. */
import { banco } from "./banco.ts";
import { Recusa } from "./sessao.ts";
import type { ImagemEmail } from "./smtp_artes.ts";

const escapar = (valor: unknown) => String(valor ?? "").replace(/[&<>"']/g,
  c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
type Face = { face: "frente" | "verso"; pagina: number; dados: string };
type Modelo = { id: string; imagens: Face[] };

export function validarModelosEmail(entrada: unknown): Modelo[] {
  if (!Array.isArray(entrada) || !entrada.length || entrada.length > 100) {
    throw new Recusa(422, "Prepare de 1 a 100 modelos para o e-mail.");
  }
  let tamanho = 0, quantidade = 0;
  const ids = new Set<string>();
  return entrada.map(m => {
    if (!m || typeof m !== "object" || Object.keys(m).some(k => !["id", "imagens"].includes(k)) ||
        typeof m.id !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(m.id) || ids.has(m.id) ||
        !Array.isArray(m.imagens) || !m.imagens.length) {
      throw new Recusa(422, "Modelo inválido ou repetido no e-mail.");
    }
    ids.add(m.id);
    const paginas = { frente: 0, verso: 0 };
    const imagens = m.imagens.map((i: Face) => {
      if (!i || Object.keys(i).some(k => !["face", "pagina", "dados"].includes(k)) ||
          !["frente", "verso"].includes(i.face) || !Number.isSafeInteger(i.pagina) ||
          i.pagina !== paginas[i.face] + 1 || typeof i.dados !== "string" || i.dados.length > 1500000 ||
          !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(i.dados)) {
        throw new Recusa(422, "Imagem inválida. Prepare novamente as prévias dos modelos.");
      }
      const dados = i.dados.split(",")[1];
      if (dados.length % 4 !== 0) throw new Recusa(422, "Imagem incompleta. Prepare novamente as prévias.");
      const bytes = atob(dados.slice(0, 16));
      if (!(i.dados.startsWith("data:image/png;") ? bytes.startsWith("\x89PNG\r\n\x1a\n") : bytes.startsWith("\xff\xd8\xff"))) {
        throw new Recusa(422, "O conteúdo da imagem não corresponde ao formato informado.");
      }
      tamanho += i.dados.length;
      quantidade++;
      if (tamanho > 11000000 || quantidade > 100) throw new Recusa(413, "As artes excedem o limite deste e-mail. Use a opção com link.");
      paginas[i.face]++;
      return { face: i.face, pagina: i.pagina, dados: i.dados };
    });
    if (!paginas.frente) throw new Recusa(422, "Todos os modelos precisam da imagem da frente.");
    return { id: m.id, imagens };
  });
}

export async function montarEmailArtesNoCorpo(texto: string, osId: string, modelos: Modelo[], consultar = banco) {
  if (/\/cliente\/|LINK DE APROVAÇÃO INTERATIVA/i.test(texto)) {
    throw new Recusa(422, "Esta opção não inclui o link do cliente. Retire o link da mensagem.");
  }
  let linhas, numero = osId.startsWith("vibe_") ? osId.slice(5) : "";
  try {
    if (!numero) {
      const ordens = await consultar("GET", `producao_ordens_servico?id=eq.${encodeURIComponent(osId)}&select=id,numero&limit=2`);
      if (!Array.isArray(ordens) || ordens.length !== 1 || ordens[0].id !== osId || !/^[1-9][0-9]*$/.test(String(ordens[0].numero))) {
        throw new Recusa(409, "Não foi possível identificar o pedido deste e-mail.");
      }
      numero = String(ordens[0].numero);
    }
    linhas = await consultar("GET", `pedidos_modelos?id_int=eq.${numero}&select=id,nome_modelo,quantidade,padrao,gabarito_operacional,verso_tipo&order=ordem.asc,id.asc&limit=101`);
  } catch (e) {
    if (e instanceof Recusa) throw e;
    throw new Recusa(503, "Não foi possível conferir todos os modelos do pedido.");
  }
  if (!Array.isArray(linhas) || !linhas.length || linhas.length !== modelos.length ||
      new Set(linhas.map(m => String(m.id))).size !== modelos.length ||
      linhas.some(m => !modelos.some(enviado => enviado.id === String(m.id)))) {
    throw new Recusa(409, "Os modelos do pedido mudaram. Reabra o e-mail e prepare todas as artes novamente.");
  }
  const imagens: ImagemEmail[] = [];
  const textos: string[] = [texto];
  const cards = linhas.map((m, idx) => {
    const modelo = modelos.find(enviado => enviado.id === String(m.id))!;
    const verso = String(m.verso_tipo || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    if (["FXVERSO", "VERSO COMUM", "VERSO VARIAVEL", "FRENTE E VERSO"].includes(verso) && !modelo.imagens.some(i => i.face === "verso")) {
      throw new Recusa(409, `Falta a imagem do verso do modelo ${idx + 1}.`);
    }
    const nome = String(m.nome_modelo || `Modelo ${idx + 1}`);
    const detalhes = `Quantidade: ${m.quantidade ?? "—"} | Cor: ${m.padrao || "Padrão"} | Numeração: ${m.gabarito_operacional || "Padrão"}`;
    textos.push(`[${idx + 1}] ${nome}\n${detalhes}\nImagens de ${modelo.imagens.map(i => `${i.face}, página ${i.pagina}`).join("; ")} incorporadas na versão visual deste e-mail.`);
    const fotos = modelo.imagens.map(i => {
      const cid = `arte-${idx + 1}-${i.face}-${i.pagina}`;
      imagens.push({ cid, tipo: i.dados.startsWith("data:image/png;") ? "image/png" : "image/jpeg", base64: i.dados.split(",")[1] });
      return `<p style="margin:16px 0 8px;font-weight:bold;">${i.face === "frente" ? "Frente" : "Verso"} · Página ${i.pagina}</p><img src="cid:${cid}" width="552" alt="${escapar(nome)} — ${i.face}, página ${i.pagina}" style="display:block;width:100%;max-width:552px;height:auto;border:0;">`;
    }).join("");
    return `<tr><td style="padding:24px;border-top:1px solid #dbe4eb;"><h2 style="margin:0 0 12px;font-size:20px;">${idx + 1}. ${escapar(nome)}</h2><p style="line-height:1.6;">${escapar(detalhes)}</p>${fotos}</td></tr>`;
  }).join("");
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#edf3f5;font-family:Arial,Helvetica,sans-serif;color:#243449;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:20px 12px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;"><tr><td style="padding:24px;background:#1c8de2;color:#fff;"><strong style="font-size:24px;">Ingresso Ideal</strong><p>Artes do pedido #${escapar(numero)}</p></td></tr><tr><td style="padding:24px;line-height:1.7;overflow-wrap:anywhere;">${escapar(texto).replace(/\r?\n/g, "<br>")}</td></tr>${cards}<tr><td style="padding:24px;background:#f8fafc;line-height:1.6;">Responda a este e-mail para aprovar as artes ou solicitar ajustes, indicando o modelo.<br>Ingresso Ideal · Atendimento</td></tr></table></td></tr></table></body></html>`;
  return { html, text: textos.join("\n\n") + "\n\nResponda a este e-mail para aprovar ou solicitar ajustes, indicando o modelo.", imagens };
}
