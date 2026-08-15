# -*- coding: utf-8 -*-
"""A carga e a fila do aparelho da portaria.

A FILA E O QUE IMPEDE A GRAFICA DE PERDER LEITURA. O celular fica tres horas sem
rede no portao, acumula centenas de entradas, e depois manda tudo. Se uma linha
se perder ali, a contagem que o cliente pagou para ter sai errada -- e ninguem
descobre, porque nao ha com o que comparar.

Roda num navegador de verdade porque IndexedDB nao existe no Node.
"""

import json
import os
import subprocess

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "portaria_deposito_harness.js")


def rodar(roteiro):
    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=300, capture_output=True, text=True,
        input=json.dumps({"roteiro": roteiro}),
    )
    if r.returncode != 0:
        pytest.fail(f"o harness falhou:\n{r.stdout}\n{r.stderr}")
    return json.loads(r.stdout)


def test_a_carga_volta_igual_ao_que_entrou():
    assert rodar("""
        await d.gravarCarga({evento: {id: 'e1', nome: 'Festa'}, credenciais: [{h: 'x'}]});
        const c = await d.lerCarga();
        return c.evento.nome + '/' + c.credenciais.length;
    """) == "Festa/1"


def test_sem_carga_gravada_a_leitura_devolve_nulo():
    """O aparelho recem-pareado tem de saber que ainda nao baixou nada, em vez
    de operar com uma carga vazia achando que todo ingresso e desconhecido."""
    assert rodar("return await d.lerCarga();") is None


def test_gravar_de_novo_SUBSTITUI_a_carga_inteira():
    """Recarregar depois de o dono mudar um setor nao pode deixar credencial
    velha convivendo com nova."""
    assert rodar("""
        await d.gravarCarga({evento: {id: 'e1'}, credenciais: [{h: 'a'}, {h: 'b'}]});
        await d.gravarCarga({evento: {id: 'e1'}, credenciais: [{h: 'c'}]});
        const c = await d.lerCarga();
        return c.credenciais.map(x => x.h).join(',');
    """) == "c"


def test_a_fila_sai_na_ordem_em_que_entrou():
    """Primeira a entrar, primeira a subir: se a rede cair no meio do envio, o
    que fica para tras e o mais recente, que e o mais facil de reconstituir."""
    assert rodar("""
        await d.enfileirar({id_local: 'a', momento: '2026-08-20T21:00:00Z'});
        await d.enfileirar({id_local: 'b', momento: '2026-08-20T21:01:00Z'});
        await d.enfileirar({id_local: 'c', momento: '2026-08-20T21:02:00Z'});
        const f = await d.lerFila(2);
        return f.map(x => x.id_local).join(',');
    """) == "a,b"


def test_enfileirar_o_mesmo_id_local_duas_vezes_nao_duplica():
    """`id_local` e a chave de idempotencia que o servidor tambem usa. Duplicar
    aqui inflaria a lotacao antes mesmo de sair do celular."""
    assert rodar("""
        await d.enfileirar({id_local: 'a', momento: '2026-08-20T21:00:00Z'});
        await d.enfileirar({id_local: 'a', momento: '2026-08-20T21:00:00Z'});
        return await d.contarFila();
    """) == 1


def test_remover_da_fila_tira_so_o_que_o_servidor_confirmou():
    """A linha so sai depois da confirmacao. Remover antes seria perder leitura
    quando a resposta se perde no caminho."""
    assert rodar("""
        await d.enfileirar({id_local: 'a'});
        await d.enfileirar({id_local: 'b'});
        await d.enfileirar({id_local: 'c'});
        await d.removerDaFila(['a', 'c']);
        const f = await d.lerFila(10);
        return f.map(x => x.id_local).join(',');
    """) == "b"


def test_entradas_permitidas_ignora_as_negadas():
    """A regra 5 (`ja_entrou`) so pode olhar para quem entrou. Contar recusa
    faria a segunda tentativa de um ingresso bom ser recusada por 'ja entrou'."""
    assert rodar("""
        await d.enfileirar({id_local: 'a', credencial_id: 'c1',
                            resultado: 'permitido', momento: '2026-08-20T21:14:00Z'});
        await d.enfileirar({id_local: 'b', credencial_id: 'c2',
                            resultado: 'negado', momento: '2026-08-20T21:15:00Z'});
        const e = await d.entradasPermitidas();
        return Object.keys(e).join(',') + '|' + e['c1'];
    """) == "c1|2026-08-20T21:14:00Z"


def test_entradas_permitidas_sobrevive_ao_envio_para_o_servidor():
    """A regra 5 tem de continuar valendo depois de a fila esvaziar: a pessoa
    entrou as 21h, a fila subiu as 21h05, e as 22h ela tenta entrar de novo."""
    assert rodar("""
        await d.enfileirar({id_local: 'a', credencial_id: 'c1',
                            resultado: 'permitido', momento: '2026-08-20T21:14:00Z'});
        await d.removerDaFila(['a']);
        const e = await d.entradasPermitidas();
        return e['c1'] || 'PERDEU';
    """) == "2026-08-20T21:14:00Z"


def test_limpar_apaga_carga_e_fila():
    """Despareamento nao pode deixar o evento anterior no celular."""
    assert rodar("""
        await d.gravarCarga({evento: {id: 'e1'}});
        await d.enfileirar({id_local: 'a'});
        await d.limpar();
        const c = await d.lerCarga();
        return (c === null ? 'sem-carga' : 'SOBROU') + '/' + await d.contarFila();
    """) == "sem-carga/0"
