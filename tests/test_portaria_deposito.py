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


def test_a_fila_ordena_por_MOMENTO_e_nao_pela_chave_id_local():
    """`getAll(query, count)` corta pela ordem da CHAVE PRIMARIA (`id_local`, um
    UUID sem relacao com o tempo), nao pela ordem de chegada. Este teste usa
    `id_local` DE PROPOSITO fora de ordem em relacao a `momento` -- z e o mais
    antigo, a e o mais novo -- porque o teste acima (`a,b,c` na mesma ordem
    alfabetica dos momentos) mascarava esse defeito: cortar pela chave dava a
    mesma resposta que cortar pelo momento, por acidente."""
    assert rodar("""
        await d.enfileirar({id_local: 'z', momento: '2026-08-20T21:00:00Z'});
        await d.enfileirar({id_local: 'y', momento: '2026-08-20T21:01:00Z'});
        await d.enfileirar({id_local: 'a', momento: '2026-08-20T21:02:00Z'});
        const f = await d.lerFila(2);
        return f.map(x => x.id_local).join(',');
    """) == "z,y"


def test_enfileirar_o_mesmo_id_local_duas_vezes_nao_duplica():
    """`id_local` e a chave de idempotencia que o servidor tambem usa. Duplicar
    aqui inflaria a lotacao antes mesmo de sair do celular.

    Os dois `momento` sao DIFERENTES de proposito: se as duas chamadas usassem
    o mesmo instante, o teste passaria mesmo com a loja chaveada por `momento`
    em vez de `id_local` -- foi exatamente esse acidente que a revisao achou."""
    assert rodar("""
        await d.enfileirar({id_local: 'a', momento: '2026-08-20T21:00:00Z'});
        await d.enfileirar({id_local: 'a', momento: '2026-08-20T21:05:00Z'});
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


def test_gravar_entradas_do_servidor_nao_apaga_as_locais():
    """A fila local pode ter leituras que ainda nao subiram. Substituir o mapa
    inteiro pelo do servidor apagaria justamente as que faltam contar: o
    servidor nao sabe delas ainda, e sem elas a regra 5 (`ja_entrou`) deixaria a
    mesma credencial entrar duas vezes."""
    assert rodar("""
        await d.enfileirar({id_local: 'a', credencial_id: 'c-local',
                            resultado: 'permitido', momento: '2026-08-20T21:14:00Z'});
        await d.gravarEntradas({'c-de-fora': '2026-08-20T22:10:00Z'});
        const e = await d.entradasPermitidas();
        return Object.keys(e).sort().join(',') + '|' + e['c-local'];
    """) == "c-de-fora,c-local|2026-08-20T21:14:00Z"


def test_entrada_local_mais_antiga_vence_a_do_servidor():
    """Quem entrou primeiro entrou primeiro. O outro portao pode ter registrado
    a mesma credencial depois, ou o relogio do servidor pode chegar atrasado --
    nenhum dos dois reescreve um horario que ESTE aparelho ja tinha."""
    assert rodar("""
        await d.enfileirar({id_local: 'a', credencial_id: 'c1',
                            resultado: 'permitido', momento: '2026-08-20T21:00:00Z'});
        await d.gravarEntradas({'c1': '2026-08-20T22:10:00Z'});
        const e = await d.entradasPermitidas();
        return e['c1'];
    """) == "2026-08-20T21:00:00Z"


def test_entrada_do_servidor_mais_antiga_corrige_a_local():
    """O contrario tambem vale, e e o caso comum: a pessoa entrou no OUTRO
    portao antes. O horario certo e o de la, e e ele que a faixa vermelha mostra
    quando o porteiro pergunta 'ja entrou quando?'."""
    assert rodar("""
        await d.enfileirar({id_local: 'a', credencial_id: 'c1',
                            resultado: 'permitido', momento: '2026-08-20T22:10:00Z'});
        await d.gravarEntradas({'c1': '2026-08-20T21:00:00Z'});
        const e = await d.entradasPermitidas();
        return e['c1'];
    """) == "2026-08-20T21:00:00Z"


def test_totais_sobrevivem_ao_fechar_o_aplicativo():
    """O contador nao pode nascer zerado a cada abertura -- no meio do evento
    isso e um numero errado na tela do porteiro, e ele nao tem como desconfiar.

    A leitura aqui e feita por FORA do modulo, numa conexao propria: se os
    totais estivessem so numa variavel em memoria, esta consulta nao acharia
    nada -- que e exatamente o que acontece depois de fechar o aplicativo."""
    assert rodar("""
        await d.gravarTotais({'s-pista': 120, 's-vip': 8});
        return await new Promise((ok, erro) => {
            const req = indexedDB.open('ideal-portaria');
            req.onsuccess = () => {
                const b = req.result;
                const t = b.transaction('totais', 'readonly');
                const r = t.objectStore('totais').get('s-pista');
                t.oncomplete = () => { b.close(); ok(r.result); };
                t.onerror = () => erro(t.error);
            };
            req.onerror = () => erro(req.error);
        });
    """) == 120


def test_ler_totais_sem_nada_gravado_devolve_mapa_vazio():
    """Aparelho recem-pareado tem contador zerado, nao contador quebrado."""
    assert rodar("return Object.keys(await d.lerTotais()).length;") == 0


def test_gravar_totais_nao_apaga_setor_que_nao_veio_desta_vez():
    """O sincronismo manda so o que mudou. Zerar na tela o setor que ficou
    parado seria inventar uma queda de publico que nao houve."""
    assert rodar("""
        await d.gravarTotais({'s-pista': 120, 's-vip': 8});
        await d.gravarTotais({'s-pista': 131});
        const t = await d.lerTotais();
        return t['s-pista'] + '/' + t['s-vip'];
    """) == "131/8"


def test_o_banco_ANTIGO_ganha_a_loja_nova_sem_perder_a_fila():
    """O celular do porteiro ja tem o banco da versao anterior. Subir a versao
    do IndexedDB sem recriar as tres lojas antigas apagaria leitura que ainda
    nao subiu -- e o defeito so apareceria no portao, no meio do evento, que e o
    pior lugar para descobrir.

    Este teste monta o banco velho na mao (VERSAO 1, tres lojas) antes de o
    modulo abrir, e confere que a migracao preserva fila e entradas."""
    assert rodar("""
        // O aparelho que ja rodava a versao anterior.
        await new Promise((ok, erro) => {
            const req = indexedDB.open('ideal-portaria', 1);
            req.onupgradeneeded = () => {
                const b = req.result;
                b.createObjectStore('carga');
                b.createObjectStore('fila', {keyPath: 'id_local'});
                b.createObjectStore('entradas');
            };
            req.onsuccess = () => {
                const b = req.result;
                const t = b.transaction(['carga', 'fila', 'entradas'], 'readwrite');
                t.objectStore('carga').put({evento: {id: 'e1', nome: 'Festa'}}, 'unica');
                t.objectStore('fila').put({id_local: 'a', momento: '2026-08-20T21:00:00Z'});
                t.objectStore('entradas').put('2026-08-20T21:00:00Z', 'c1');
                // Fecha: conexao aberta na versao velha BLOQUEIA a migracao.
                t.oncomplete = () => { b.close(); ok(); };
                t.onerror = () => erro(t.error);
            };
            req.onerror = () => erro(req.error);
        });
        await d.gravarTotais({'s-pista': 3});
        const carga = await d.lerCarga();
        const entradas = await d.entradasPermitidas();
        const totais = await d.lerTotais();
        return [await d.contarFila(), carga.evento.nome,
                entradas['c1'] || 'PERDEU', totais['s-pista']].join('/');
    """) == "1/Festa/2026-08-20T21:00:00Z/3"


def test_limpar_apaga_carga_e_fila():
    """Despareamento nao pode deixar o evento anterior no celular."""
    assert rodar("""
        await d.gravarCarga({evento: {id: 'e1'}});
        await d.enfileirar({id_local: 'a'});
        await d.limpar();
        const c = await d.lerCarga();
        return (c === null ? 'sem-carga' : 'SOBROU') + '/' + await d.contarFila();
    """) == "sem-carga/0"


def test_limpar_apaga_tambem_os_totais():
    """Contador do evento anterior no aparelho despareado seria numero de outro
    cliente na tela deste."""
    assert rodar("""
        await d.gravarTotais({'s-pista': 120});
        await d.limpar();
        return Object.keys(await d.lerTotais()).length;
    """) == 0
