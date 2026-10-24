import { strict as assert } from 'node:assert';
import { exigirVersaoNewprod } from './newprod_versao.ts';
import { operarPilotoEstacao } from './piloto_estacao.ts';

Deno.test('versao minima: antiga, ausente e malformada recusadas; atual e superior aceitas', () => {
  for (const v of ['', '1.3.35', '1.3.999', '1.4', 'fake', '1.4.0-piloto']) {
    assert.throws(() => exigirVersaoNewprod(new Request('https://teste.invalid', {
      headers: { 'x-newprod-versao': v },
    }), '1.4.0'), {status:426});
  }
  for (const v of ['1.4.0', '1.4.1', '1.10.0', '2.0.0']) {
    exigirVersaoNewprod(new Request('https://teste.invalid', {headers:{'x-newprod-versao':v}}), '1.4.0');
  }
  exigirVersaoNewprod(new Request('https://teste.invalid'), '');
  assert.throws(() => exigirVersaoNewprod(new Request('https://teste.invalid'), 'invalida'), {status:503});
});

Deno.test('versao minima: autenticacao precede bloqueio e nenhuma consulta com cliente antigo', async () => {
  const get = Deno.env.get;
  Deno.env.get = n => n === 'NEWPROD_VERSAO_MINIMA' ? '1.4.0' : undefined;
  try {
    for (const acao of ['abrir-pedido','conferir-pedido','conferir','confirmar-offline']) {
      let autenticacoes = 0;
      await assert.rejects(operarPilotoEstacao(acao, new Request('https://teste.invalid'), async () => {autenticacoes++;}), {status:426});
      assert.equal(autenticacoes, 1);
    }
    await assert.rejects(operarPilotoEstacao('abrir-pedido', new Request('https://teste.invalid'), async () => {throw new Error('autenticacao');}), /autenticacao/);
    // Rotas de recuperacao/coleta nao passam pela barreira: seguem a configuracao existente.
    for (const acao of ['listar', 'base-qr-v2'])
      await assert.rejects(operarPilotoEstacao(acao, new Request('https://teste.invalid'), async () => {}), {status:503});
  } finally {Deno.env.get = get;}
});
