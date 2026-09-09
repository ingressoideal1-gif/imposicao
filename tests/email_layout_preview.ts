// Gera apenas artefatos locais com dados fictícios; não envia e-mail.
import { layoutEmailArte } from "../supabase/functions/_compartilhado/email_artes_layout.ts";
const portal = "https://imposition.ai-ideal.com.br";
const link = portal + "/cliente/10000-exemplo";
const corpo = `Olá, Cliente de Exemplo!

Suas artes relativas ao Pedido #10000 (Festival de Exemplo) já estão prontas para sua conferência e aprovação.

--------------------------------------------------
RESUMO DOS MODELOS DO PEDIDO:
--------------------------------------------------

[01] PULSEIRA TRIBAND
     • Quantidade: 5000
     • Cor: Padrão
     • Numeração: SEQUENCIAL
     • Imagem da Arte (Frente): https://example.com/arte-frente.pdf

--------------------------------------------------
LINK DE APROVAÇÃO INTERATIVA:
${link}
--------------------------------------------------

Por favor, acesse o link acima para conferir o visual final, aprovar ou indicar alterações necessárias.

Atenciosamente,
Equipe Ingresso Ideal / Atendimento`;
await Deno.mkdir("design", {recursive:true});
await Deno.writeTextFile("design/email-aprovacao-preview.html", layoutEmailArte(corpo, portal, link, "10000").html);
