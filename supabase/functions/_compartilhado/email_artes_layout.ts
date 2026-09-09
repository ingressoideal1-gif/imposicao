/** HTML de e-mail gerado no servidor. Conteúdo editável sempre escapado. */
const WHATSAPP = "555195343478"; // Mesmo atendimento de frontend/cliente-entrega.js.
const escapar = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

function linhaHtml(linha: string): string {
  // URLs de artes viram links legíveis. Nunca interpretar HTML do editor.
  const partes = linha.split(/(https?:\/\/[^\s<>"']+)/g);
  return partes.map((parte, i) => {
    if (i % 2 === 0) return escapar(parte);
    try {
      const url = new URL(parte);
      if (url.protocol !== "https:" || url.username || url.password) return escapar(parte);
      return `<a href="${escapar(url.href)}" style="color:#087f8c;text-decoration:underline;">Abrir arquivo da arte</a>`;
    } catch { return escapar(parte); }
  }).join("");
}

export function layoutEmailArte(texto: string, portal: string, link?: string, numero?: string, orcamento?: string) {
  // Também remove o bloco padrão de mensagens preparadas por abas antigas.
  const fonte = texto.split(/\r?\n/);
  const inicioResumo = fonte.findIndex(l => /^\s*RESUMO DOS MODELOS DO PEDIDO:\s*$/i.test(l));
  const inicioAprovacao = fonte.findIndex((l, i) => i > inicioResumo && /^\s*LINK DE APROVAÇÃO INTERATIVA:\s*$/i.test(l));
  if (inicioResumo >= 0 && inicioAprovacao > inicioResumo) fonte.splice(inicioResumo, inicioAprovacao - inicioResumo);
  texto = fonte.join("\n");
  const whatsapp = "https://api.whatsapp.com/send?phone=" + WHATSAPP + "&text=" + encodeURIComponent(
    numero ? `Olá! Preciso de atendimento sobre a aprovação das artes do Pedido #${numero}.` : "Olá! Preciso de atendimento sobre a aprovação das artes.");
  const destino = link || portal;
  const pagamento = link ? link + "#pagamento" : "";
  const titulo = link ? "Suas artes estão prontas!" : "Seu e-mail de teste chegou.";
  const acao = link ? "Abrir aprovação interativa" : "Abrir painel";
  const linhas = fonte.filter(linha => !/^\s*-{3,}\s*$/.test(linha) && (!link || linha.trim() !== link));
  const aprovacao = linhas.findIndex(linha => /^\s*LINK DE APROVAÇÃO INTERATIVA:\s*$/i.test(linha));
  const render = (ls: string[]) => ls.join("\n").trim().split(/\n\s*\n/).filter(Boolean).map(bloco => {
    const linhas = bloco.split("\n");
    return `<p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#334155;overflow-wrap:anywhere;">${linhas.map(l =>
      /^\s*\[\d+\]/.test(l) || /^RESUMO DOS MODELOS DO PEDIDO:/i.test(l.trim())
        ? `<strong style="color:#102b3f;">${linhaHtml(l)}</strong>` : linhaHtml(l)).join("<br>")}</p>`;
  }).join("");
  const intro = render(aprovacao >= 0 ? linhas.slice(0, aprovacao) : linhas);
  const detalhes = aprovacao >= 0 ? render(linhas.slice(aprovacao + 1)) : "";
  // Negrito do WhatsApp somente depois de escapar; valores e condições intactos.
  const resumoHtml = orcamento ? escapar(orcamento).replace(/\*(\S(?:[^*]*\S)?)\*/g, '<strong>$1</strong>').replace(/\r?\n/g, '<br>') : "";
  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapar(titulo)}</title></head>
<body style="margin:0;padding:0;background:#edf3f5;font-family:Arial,Helvetica,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${link ? "Confira suas artes e aprove ou solicite ajustes pelo botão." : "O envio pela nuvem está funcionando."}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#edf3f5;"><tr><td align="center" style="padding:24px 12px;">
<!--[if mso]><table role="presentation" width="600"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border:1px solid #dde7eb;border-radius:16px;overflow:hidden;">
<tr><td style="background:#102b3f;padding:24px 28px;border-bottom:4px solid #11b3b8;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="64"><img src="${escapar(portal)}/logo.png" width="56" height="56" alt="Ingresso Ideal" style="display:block;border:0;border-radius:12px;"></td><td style="color:#fff;font-family:Arial,Helvetica,sans-serif;"><strong style="font-size:23px;letter-spacing:-0.5px;">Ingresso Ideal</strong><br><span style="font-size:12px;color:#b7d9e4;">APROVAÇÃO DE ARTES</span></td></tr></table>
</td></tr>
<tr><td style="padding:30px 28px 8px;">
${numero ? `<p style="margin:0 0 12px;font-size:12px;font-weight:bold;letter-spacing:1px;color:#087f8c;">PEDIDO #${escapar(numero)}</p>` : ""}
<h1 style="margin:0 0 20px;font-size:28px;line-height:1.2;color:#102b3f;">${escapar(titulo)}</h1>
${intro}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:6px 0 24px;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td align="center" bgcolor="#087f8c" style="border-radius:8px;mso-padding-alt:16px 24px;"><a href="${escapar(destino)}" style="display:inline-block;padding:16px 24px;font-size:16px;font-weight:bold;line-height:22px;color:#fff;text-decoration:none;border:1px solid #087f8c;border-radius:8px;">${escapar(acao)} &rarr;</a></td></tr></table>
${link ? '<p style="margin:12px 0 0;font-size:13px;line-height:1.6;color:#64748b;">Confira o visual final, aprove ou solicite ajustes. Tudo no mesmo link.</p>' : ""}
</td></tr></table>
${resumoHtml ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;"><tr><td style="padding:20px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;"><h2 style="margin:0 0 14px;color:#102b3f;font-size:18px;">Resumo do Orçamento</h2><div style="color:#334155;font-size:14px;line-height:1.75;overflow-wrap:anywhere;">${resumoHtml}</div></td></tr></table>` : ""}
${pagamento ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:24px;"><tr><td align="center" bgcolor="#102b3f" style="border-radius:8px;mso-padding-alt:14px 22px;"><a href="${escapar(pagamento)}" style="display:inline-block;padding:14px 22px;border:1px solid #102b3f;border-radius:8px;font-size:15px;font-weight:bold;line-height:22px;color:#fff;text-decoration:none;">Realizar Pagamento &rarr;</a></td></tr></table>` : ""}
${detalhes ? `<div style="border-top:1px solid #e2e8f0;padding-top:22px;">${detalhes}</div>` : ""}
</td></tr>
<tr><td style="padding:0 28px 26px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:20px;background:#f0f8f7;border:1px solid #d5eae5;border-radius:10px;"><strong style="font-size:16px;color:#102b3f;">Precisa de ajuda com as artes?</strong><p style="margin:8px 0 12px;font-size:14px;line-height:1.6;color:#475569;">Nossa equipe de atendimento pode ajudar você.</p><a href="${escapar(whatsapp)}" style="font-size:14px;font-weight:bold;color:#12664b;text-decoration:underline;">Falar com atendente pelo WhatsApp &rarr;</a></td></tr></table></td></tr>
<tr><td style="padding:22px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.7;color:#64748b;">Se o botão não abrir, copie este endereço no navegador:<br><a href="${escapar(destino)}" style="color:#087f8c;word-break:break-all;">${escapar(destino)}</a><br><br>Ingresso Ideal &middot; Atendimento e aprovação de artes</td></tr>
</table><!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
  return { html, text: texto + (orcamento ? "\n\nRESUMO DO ORÇAMENTO:\n" + orcamento : "") + (pagamento ? "\n\nRealizar Pagamento:\n" + pagamento : "") + "\n\nFalar com atendente pelo WhatsApp:\n" + whatsapp };
}
