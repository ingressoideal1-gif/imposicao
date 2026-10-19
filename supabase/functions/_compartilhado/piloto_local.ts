/** Conferência somente leitura. Não aprova arte, não reserva modelo e não libera offline. */
import { banco } from './banco.ts';
import { Recusa } from './sessao.ts';

const aprovados = new Set(['APROVADO', 'APROVADA', 'APROVADA_CLIENTE', 'LIBERADA', 'ARTE_APROVADA', 'ARTE APROVADA']);
const normal = (v: unknown) => String(v ?? '').trim().toUpperCase();
export function fontesPiloto(m: any, nums: any[], consumidores = new Map<any, any[]>()) {
  const fontes: Record<string, string> = {}, extras = new Set<string>();
  // A arte pode ser composta no gabarito, sem arte_url no modelo. Apenas
  // um PDF visivel na frente concede essa entrada; fotos/fontes/verso nao.
  // Os demais PDFs continuam nos recursos e a composicao permanece intacta.
  const pdfGabarito = nums.flatMap(n => Array.isArray(n?.elements) ? n.elements : [])
    .find(el => el?.type === 'PDF' && (!el.face || el.face === 'front' || el.face === 'both')
      && typeof el.pdf_content === 'string' && el.pdf_content.startsWith('https://'))?.pdf_content;
  const frente = m.arte_url || m.url_arquivo_arte || m.url_arquivo || pdfGabarito;
  const verso = m.verso_arte_url || m.url_arquivo_arte_verso || m.verso_url_arquivo;
  if (typeof frente === 'string' && frente.startsWith('https://')) fontes.frente = frente;
  if (typeof verso === 'string' && verso.startsWith('https://')) fontes.verso = verso;
  function visitar(v: any, recurso = true) {
    if (typeof v === 'string' && v.startsWith('https://')) { if (recurso) extras.add(v); }
    else if (Array.isArray(v)) v.forEach(dado=>visitar(dado,recurso));
    else if (v && typeof v === 'object') Object.values(v).forEach(dado=>visitar(dado,recurso));
  }
  const tiposConteudo = new Set(['QR', 'QR_IDEAL', 'TEXT', 'FIXED', 'BARCODE']);
  for (const registro of nums) {
    if (!registro || typeof registro !== 'object') { visitar(registro); continue; }
    const elementos = consumidores.get(registro) ?? registro.elements ?? [];
    const conteudo = new Set<string>(), arquivos = new Set<string>();
    for (const el of elementos) {
      if (el?.source !== 'database') continue;
      const coluna = String(el.csv_column || '').trim();
      if (coluna) (tiposConteudo.has(el.type) ? conteudo : arquivos).add(coluna);
    }
    for (const [chave, valor] of Object.entries(registro)) {
      // A origem da importacao nao e necessaria se as linhas ja vieram.
      if (chave === 'csv_url' && Array.isArray(registro.csv_data)) continue;
      if (chave === 'csv_data' && Array.isArray(valor)) {
        for (const linha of valor) {
          if (!linha || typeof linha !== 'object' || Array.isArray(linha)) { visitar(linha); continue; }
          for (const [coluna, dado] of Object.entries(linha)) {
            // O Gerenciador guarda URL e recorte em __fotos[coluna].
            // Sao dependencias das colunas FOTO, nao colunas auxiliares de QR.
            if (coluna === '__fotos' && consumidores.has(registro)) {
              if (dado && typeof dado === 'object' && !Array.isArray(dado)) {
                for (const foto of arquivos) visitar((dado as Record<string, any>)[foto]);
              }
              continue;
            }
            // Com vinculos resolvidos, so colunas consumidas como arquivo
            // precisam de download. O banco integral permanece no snapshot.
            if (consumidores.has(registro) && !arquivos.has(coluna)) continue;
            if (!conteudo.has(coluna) || arquivos.has(coluna)) visitar(dado);
          }
        }
      } else if (chave === 'elements' && Array.isArray(valor)) {
        for (const el of valor) {
          if (!el || !tiposConteudo.has(el.type)) { visitar(el); continue; }
          for (const [campo, dado] of Object.entries(el)) {
            visitar(dado,!['fixed_value', 'prefix', 'suffix'].includes(campo));
          }
        }
      } else visitar(valor);
    }
  }
  extras.delete(frente); extras.delete(verso);
  [...extras].sort().forEach((url, i) => { fontes['recurso_' + i] = url; });
  return fontes;
}
function canonico(v: any): any {
  if (Array.isArray(v)) return v.map(canonico);
  return v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonico(v[k])])) : v;
}
export async function digestPiloto(v: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(canonico(v)));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
}
export async function produtoPiloto(m: any, ler: (query: string) => Promise<any[]>) {
  let produto = m.id_produto;
  if (!/^[1-9][0-9]*$/.test(String(produto)) && /^[1-9][0-9]*$/.test(String(m.id_produto_proposta_origem))) {
    const origens = await ler(`produtos_proposta?id=eq.${m.id_produto_proposta_origem}&id_int=eq.${m.id_int}&select=*&limit=2`);
    produto = origens.length === 1 ? origens[0].id_produto : null;
  }
  if (!/^[1-9][0-9]*$/.test(String(produto))) return null;
  const produtos = await ler(`produtos?id_produto=eq.${produto}&select=*&limit=2`);
  return produtos.length === 1 ? produtos[0] : null;
}

export async function conferirPiloto(entrada: any, permissoes: any, consultar = banco,
  empresa = Deno.env.get('PILOTO_LOCAL_EMPRESA'), empresaId = Deno.env.get('PILOTO_LOCAL_EMPRESA_ID'), permitirImpressos = false) {
  if (!permissoes || permissoes.perm_producao_view !== true || permissoes.perm_imprimir !== true) {
    throw new Recusa(403, 'operador sem permissao de producao e impressao');
  }
  if (!empresa?.trim()) throw new Recusa(503, 'empresa do piloto nao configurada no servidor');
  const empresaOperador = permissoes.empresa_id ?? permissoes.id_empresa;
  if (empresaOperador != null && (!empresaId || String(empresaOperador) !== empresaId)) {
    throw new Recusa(403, 'operador de outra empresa');
  }
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)
      || Object.keys(entrada).some(k => !['empresa', 'modelo', 'digest', 'fontes'].includes(k))
      || entrada.empresa !== empresa || typeof entrada.modelo !== 'string' || !/^[1-9][0-9]*$/.test(entrada.modelo)
      || !Number.isSafeInteger(Number(entrada.modelo)) || typeof entrada.digest !== 'string' || !/^[a-f0-9]{64}$/.test(entrada.digest)
      || !entrada.fontes || typeof entrada.fontes !== 'object' || Array.isArray(entrada.fontes)) {
    throw new Recusa(422, 'conferencia invalida');
  }
  const ler = async (caminho: string) => {
    let linhas;
    try { linhas = await consultar('GET', caminho); }
    catch { throw new Recusa(503, 'consulta do piloto indisponivel'); }
    if (!Array.isArray(linhas)) throw new Recusa(503, 'consulta do piloto incompleta');
    for (const linha of linhas) {
      const id = linha.empresa_id ?? linha.id_empresa;
      // Não inventar associação para linhas multiempresa; exige vínculo explícito.
      if (id != null && (!empresaId || String(id) !== empresaId)) throw new Recusa(403, 'empresa divergente');
    }
    return linhas;
  };
  const modelos = await ler(`pedidos_modelos?id=eq.${entrada.modelo}&select=*&limit=2`);
  if (modelos.length !== 1 || String(modelos[0].id) !== entrada.modelo) throw new Recusa(409, 'modelo ausente ou ambiguo');
  const m = modelos[0], aprovacao = normal(m.status_arte);
  const impresso = permitirImpressos && normal(m.status_impressao || m.status_producao) === 'IMPRESSO';
  if (!aprovados.has(aprovacao) || (!impresso && !['', 'AGUARDANDO', 'PENDENTE'].includes(normal(m.status_impressao || m.status_producao)))) {
    throw new Recusa(409, 'modelo fora da fila aprovada');
  }
  if (!/^[1-9][0-9]*$/.test(String(m.id_int))) throw new Recusa(409, 'pedido invalido');
  const pedidos = await ler(`propostas?id_int=eq.${m.id_int}&select=*&limit=2`);
  if (pedidos.length !== 1 || !impresso && !['EM PRODUCAO', 'EM PRODUÇÃO', 'EM IMPRESSAO', 'EM IMPRESSÃO', 'EM ACABAMENTO'].includes(normal(pedidos[0].status_interno))) {
    throw new Recusa(409, 'pedido fora da producao');
  }
  if ((await produtoPiloto(m, ler))?.is_estoque === true) throw new Recusa(409, 'produto de prateleira nao exige copia');
  const numero = m.amostra_num_id || m.numeracao_id;
  if (numero && !/^[a-zA-Z0-9-]+$/.test(String(numero))) throw new Recusa(409, 'numeracao invalida');
  const nums = numero ? await ler(`producao_numeracoes?id=eq.${numero}&select=*&limit=2`) : [];
  if (numero && nums.length !== 1) throw new Recusa(409, 'numeracao incompleta');
  if (await digestPiloto([m, nums]) !== entrada.digest) throw new Recusa(409, 'revisao mudou');
  const fontes = fontesPiloto(m, nums);
  if (JSON.stringify(canonico(fontes)) !== JSON.stringify(canonico(entrada.fontes))) {
    throw new Recusa(409, 'fontes divergentes do cadastro');
  }
  const modelosAtuais = await ler(`pedidos_modelos?id=eq.${entrada.modelo}&select=*&limit=2`);
  const numsAtuais = numero ? await ler(`producao_numeracoes?id=eq.${numero}&select=*&limit=2`) : [];
  const pedidosAtuais = await ler(`propostas?id_int=eq.${m.id_int}&select=*&limit=2`);
  if (modelosAtuais.length !== 1 || await digestPiloto([modelosAtuais[0], numsAtuais]) !== entrada.digest
      || await digestPiloto(pedidosAtuais) !== await digestPiloto(pedidos)) {
    throw new Recusa(409, 'dados mudaram durante a conferencia');
  }
  return { empresa, modelo: String(m.id), digest: entrada.digest, aprovacao,
    conferido_em: new Date().toISOString(), execucao_offline: false, aprovacao_versionada: false };
}
