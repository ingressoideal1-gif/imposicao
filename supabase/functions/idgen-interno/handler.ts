import { comCors, origemPermitida, respostaDePreflight } from '../_compartilhado/cors.ts';

type Dependencias = {
  usuario: (authorization: string) => Promise<string>;
  operar: (usuario: string, acao: string, dados: unknown) => Promise<unknown>;
};
export function handler(deps: Dependencias) {
  return async (req: Request): Promise<Response> => {
    const origem = origemPermitida(req.headers.get('origin'));
    const responder = (body: unknown, status = 200) => comCors(new Response(JSON.stringify(body), {
      status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    }), origem);
    if (req.headers.has('origin') && !origem) return responder({ erro: 'Origem não permitida' }, 403);
    if (req.method === 'OPTIONS') return respostaDePreflight(origem, 'POST, OPTIONS');
    if (req.method !== 'POST') return responder({ erro: 'Método não permitido' }, 405);
    try {
      const auth = req.headers.get('authorization') || '';
      if (!/^Bearer \S+$/i.test(auth)) return responder({ erro: 'Entre no Imposition' }, 401);
      const usuario = await deps.usuario(auth);
      if (!usuario) return responder({ erro: 'Sessão inválida' }, 401);
      if (!req.headers.get('content-type')?.startsWith('application/json')) return responder({ erro: 'Envie JSON' }, 415);
      // Limite aplicado também ao fluxo: Content-Length pode estar ausente ou incorreto.
      const reader = req.body?.getReader();
      if (!reader) return responder({ erro: 'Corpo obrigatório' }, 400);
      const chunks: Uint8Array[] = []; let tamanho = 0;
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        tamanho += value.length;
        if (tamanho > 16777216) { await reader.cancel(); return responder({ erro: 'Pedido excede 16 MB' }, 413); }
        chunks.push(value);
      }
      const bytes = new Uint8Array(tamanho); let pos = 0;
      for (const chunk of chunks) { bytes.set(chunk, pos); pos += chunk.length; }
      let body;
      try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { return responder({ erro: 'JSON inválido' }, 400); }
      if (!body || !['clientes', 'listar', 'criar', 'abrir', 'salvar'].includes(body.acao)
          || !body.dados || typeof body.dados !== 'object' || Array.isArray(body.dados)) {
        return responder({ erro: 'Operação inválida' }, 400);
      }
      return responder(await deps.operar(usuario, body.acao, body.dados));
    } catch (e) {
      const code = (e as { code?: string }).code;
      const status = code === '42501' ? 403 : code === 'PT409' || code === '40001' || code === '23505' ? 409
        : code === 'P0002' ? 404 : code === '22023' || code === '22P02' || code === '23514' || code === '23502' ? 400
        : code === 'AUTH' ? 401 : 502;
      return responder({ erro: status === 409 ? 'O pedido mudou. Reabra antes de salvar.'
        : status === 403 ? 'Seu acesso não permite editar pedidos IdGen.'
        : status === 401 ? 'Entre novamente no Imposition.' : 'Não foi possível concluir a operação IdGen.' }, status);
    }
  };
}
