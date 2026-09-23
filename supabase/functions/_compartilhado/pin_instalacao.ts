import { banco } from "./banco.ts";
import { hashDoToken } from "./hash.ts";
import { Recusa } from "./sessao.ts";
import { segredo } from "./segredos.ts";
import { gerarElevacao } from "./assinatura.ts";

function chaveValida(v: unknown): asserts v is string {
  if (typeof v !== "string" || !/^[a-f0-9]{64}$/.test(v)) throw new Recusa(422, "Identificação do celular inválida.");
}
function pinValido(v: unknown): asserts v is string {
  if (typeof v !== "string" || !/^[0-9]{6}$/.test(v)) throw new Recusa(422, "A senha deve ter exatamente 6 números.");
}
async function chave(): Promise<Uint8Array<ArrayBuffer>> {
  const valor = await segredo("IDEAL_CONTROL_PIN_CHAVE");
  if (!valor || !/^[a-f0-9]{64}$/i.test(valor)) throw new Recusa(503, "A senha de edição ainda não foi habilitada pela gráfica.");
  return Uint8Array.from(valor.match(/../g)!, (v) => parseInt(v, 16));
}
async function hashPin(pin: string, identificador: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", await chave(), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const assinatura = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode("pin:" + identificador + ":" + pin));
  return Array.from(new Uint8Array(assinatura), (v) => v.toString(16).padStart(2, "0")).join("");
}
export async function cifrarPin(pin: string, identificador: string): Promise<string> {
  pinValido(pin);
  const k = await crypto.subtle.importKey("raw", await chave(), "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cifrado = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(identificador) }, k, new TextEncoder().encode(pin));
  return btoa(String.fromCharCode(...iv, ...new Uint8Array(cifrado)));
}
export async function decifrarPin(cifrado: string, identificador: string): Promise<string> {
  const bytes = Uint8Array.from(atob(cifrado), (v) => v.charCodeAt(0));
  const k = await crypto.subtle.importKey("raw", await chave(), "AES-GCM", false, ["decrypt"]);
  const aberto = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12), additionalData: new TextEncoder().encode(identificador) }, k, bytes.slice(12));
  const pin = new TextDecoder().decode(aberto); pinValido(pin); return pin;
}
export async function instalacao(chaveBruta: unknown): Promise<any> {
  chaveValida(chaveBruta);
  const linhas = await banco("GET", "producao_acesso_instalacoes?chave_hash=eq." + await hashDoToken(chaveBruta) + "&select=id");
  if (linhas?.length !== 1) throw new Recusa(403, "Configure a senha deste celular primeiro.");
  return linhas[0];
}
export async function registrarPin(corpo: any): Promise<any> {
  chaveValida(corpo?.chave); pinValido(corpo?.pin);
  const chaveHash = await hashDoToken(corpo.chave), pinHash = await hashPin(corpo.pin, chaveHash);
  await banco("POST", "producao_acesso_instalacoes?on_conflict=chave_hash", {
    chave_hash: chaveHash, pin_hash: pinHash, pin_cifrado: await cifrarPin(corpo.pin, chaveHash),
  }, "resolution=ignore-duplicates,return=representation");
  // Confirmar também no reenvio após perda da resposta. Nunca substituir um PIN existente.
  const id = await banco("POST", "rpc/producao_acesso_conferir_pin", { p_chave_hash: chaveHash, p_pin_hash: pinHash });
  if (!id) throw new Recusa(403, "A senha não confere ou houve muitas tentativas. Aguarde 15 minutos.");
  return { id };
}
export async function elevarPin(corpo: any, aparelho: any): Promise<any> {
  chaveValida(corpo?.chave); pinValido(corpo?.pin);
  const i = await instalacao(corpo.chave);
  if (aparelho.instalacao_id !== i.id) throw new Recusa(403, "Este evento não pertence à instalação deste celular.");
  const chaveHash = await hashDoToken(corpo.chave);
  const id = await banco("POST", "rpc/producao_acesso_conferir_pin", {
    p_chave_hash: chaveHash, p_pin_hash: await hashPin(corpo.pin, chaveHash),
  });
  if (id !== i.id) throw new Recusa(403, "A senha não confere ou houve muitas tentativas. Aguarde 15 minutos.");
  const r = await gerarElevacao(aparelho.evento_id, "pin-" + i.id, aparelho.id);
  return { token: r.token, expira_em: r.expira };
}
export async function consultarPinDaGrafica(aparelhoId: string, autorId: string): Promise<any> {
  const aparelhos = await banco("GET", "producao_acesso_dispositivos?id=eq." + aparelhoId + "&select=id,evento_id,instalacao_id,nome");
  const a = aparelhos?.[0];
  if (!a?.instalacao_id) throw new Recusa(404, "Este aparelho não tem senha de edição por celular.");
  const rows = await banco("GET", "producao_acesso_instalacoes?id=eq." + a.instalacao_id + "&select=chave_hash,pin_cifrado");
  if (rows?.length !== 1) throw new Recusa(404, "Senha indisponível.");
  const auditoria = await banco("POST", "producao_acesso_auditoria_pin", {
    instalacao_id: a.instalacao_id, dispositivo_id: a.id, evento_id: a.evento_id,
    consultado_por: autorId, rota: "senha-edicao", metodo: "CONSULTA", resultado: "consultado",
  });
  if (auditoria?.length !== 1 || !auditoria[0].id) throw new Error("consulta de senha nao auditada");
  return { aparelho_id: a.id, nome: a.nome, pin: await decifrarPin(rows[0].pin_cifrado, rows[0].chave_hash) };
}
