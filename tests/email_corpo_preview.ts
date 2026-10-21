/** Gera uma mensagem revisável com o pedido sintético do harness; não envia e-mail. */
import { montarEmailArtesNoCorpo, validarModelosEmail } from "../supabase/functions/_compartilhado/email_artes_corpo.ts";
import { mensagemMime } from "../supabase/functions/_compartilhado/smtp_artes.ts";

const pasta = Deno.args[0] || "design/email-corpo-preview";
const entrada = JSON.parse(await Deno.readTextFile(`${pasta}/pedido-sintetico.json`));
const registros = [
  { id: 1, nome_modelo: "Ingresso — Setor A", quantidade: 100, padrao: "Azul", gabarito_operacional: "001 a 100", verso_tipo: "FxVerso" },
  { id: 2, nome_modelo: "Credencial", quantidade: 20, padrao: "Verde" },
];
const mensagem = { to: "cliente@example.com", subject: "Artes do pedido #11 — Exemplo",
  ...await montarEmailArtesNoCorpo(entrada.body_text, "vibe_11", validarModelosEmail(entrada.modelos), async () => registros) };
await Deno.writeTextFile(`${pasta}/email-exemplo.eml`, mensagemMime(
  { host: "smtp.example.com", usuario: "sintetico", senha: "sintetica", remetente: "arte@example.com", nome: "Ingresso Ideal" }, mensagem));
let html = mensagem.html;
for (const i of mensagem.imagens) html = html.replace(`cid:${i.cid}`, `data:${i.tipo};base64,${i.base64}`);
await Deno.writeTextFile(`${pasta}/email-exemplo.html`, html);
console.log("Prévia HTML e mensagem EML sintéticas geradas, sem envio.");
