import { Recusa } from './sessao.ts';

export function exigirVersaoNewprod(req: Request, minima = Deno.env.get('NEWPROD_VERSAO_MINIMA')) {
  if (!minima) return;
  const partes = (v: string) => /^\d+\.\d+\.\d+$/.test(v) ? v.split('.').map(Number) : null;
  const alvo = partes(minima), atual = partes(req.headers.get('x-newprod-versao') || '');
  if (!alvo) throw new Recusa(503, 'politica de versao NewProd indisponivel');
  const aceita = atual && (atual[0] > alvo[0] || (atual[0] === alvo[0] &&
    (atual[1] > alvo[1] || (atual[1] === alvo[1] && atual[2] >= alvo[2]))));
  if (!aceita) throw new Recusa(426, `Atualizacao obrigatoria: instale o NewProd ${minima} antes de iniciar novos trabalhos.`);
}
