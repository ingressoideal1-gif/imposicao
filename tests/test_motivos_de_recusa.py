# -*- coding: utf-8 -*-
"""Todo motivo que a portaria grava tem de ter nome de gente no relatório.

## O que este teste previne, e que já aconteceu

A tabela `MOTIVOS` nasceu com seis motivos, quando o validador da portaria tinha
seis regras. Depois entraram `evento_inativo` (o dono desligou o evento inteiro)
e `setor_bloqueado` (o dono desligou aquela porta) — e ninguém voltou à tabela.

O resultado não quebrava nada, e é exatamente por isso que passou: o relatório
escrevia `setor_bloqueado`, o nome cru da coluna, no meio de frases em
português. Ninguém abre um relatório procurando um erro de tradução, e agora
quem o abre também é o dono do evento, no celular, sem nenhuma obrigação de
saber o que o banco escreve lá dentro.

## Por que a lista sai do validador, e não de uma segunda lista

O `frontend/portaria-validacao.js` é a única fonte de quais recusas existem: é
ele que decide, no celular, o que gravar em `producao_acesso_leituras.motivo`.
Escrever aqui uma lista à mão criaria uma terceira cópia — e o defeito voltaria
na próxima regra nova, que é justamente como ele apareceu.
"""

import os
import re

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

VALIDADOR = os.path.join(RAIZ, "frontend", "portaria-validacao.js")
MOTIVOS_TS = os.path.join(
    RAIZ, "supabase", "functions", "_compartilhado", "relatorio_puro.ts"
)


def _ler(caminho):
    with open(caminho, encoding="utf-8") as f:
        return f.read()


def motivos_do_validador():
    """Os motivos que o celular da portaria consegue gravar.

    Sai das chamadas `negado('<motivo>'` — a única forma de o validador produzir
    uma recusa. Um motivo novo, para não ser visto por este teste, teria de
    inventar um caminho de recusa que não passa por ali.
    """
    return set(re.findall(r"negado\(\s*'([a-z_]+)'", _ler(VALIDADOR)))


def motivos_com_rotulo():
    """As chaves da tabela `MOTIVOS` do relatório."""
    bloco = re.search(
        r"export const MOTIVOS[^{]*\{(.*?)\n\};", _ler(MOTIVOS_TS), re.S
    )
    assert bloco, "não achei a tabela MOTIVOS em relatorio_puro.ts"
    return set(re.findall(r"^\s*([a-z_]+):", bloco.group(1), re.M))


def test_o_validador_produz_pelo_menos_as_oito_regras():
    """Guarda o próprio teste: se o `negado(` mudar de forma, ele para de ver.

    Sem esta conferência, uma refatoração do validador que trocasse a chamada
    por outra coisa faria `motivos_do_validador()` devolver conjunto vazio — e
    o teste seguinte passaria por vácuo, aprovando qualquer tabela.
    """
    achados = motivos_do_validador()
    assert len(achados) >= 7, f"o validador deveria recusar por vários motivos: {achados}"
    assert "desconhecido" in achados
    assert "setor_nao_autorizado" in achados


def test_todo_motivo_da_portaria_tem_nome_de_gente_no_relatorio():
    faltando = motivos_do_validador() - motivos_com_rotulo()
    assert not faltando, (
        "estes motivos a portaria grava e o relatório mostraria com o nome cru "
        f"da coluna: {sorted(faltando)}. Acrescente-os à tabela MOTIVOS de "
        "supabase/functions/_compartilhado/relatorio_puro.ts."
    )


def test_o_relatorio_nao_inventa_motivo_que_a_portaria_nao_grava():
    """Rótulo sem motivo correspondente não quebra nada — e é lixo que engana.

    Quem for ler a tabela para saber o que a portaria recusa acreditaria numa
    recusa que não existe. As três exceções abaixo são motivos que o SERVIDOR
    grava (a portaria os recebe prontos ou os herdou de versões anteriores), e
    por isso continuam com rótulo mesmo sem aparecer no validador.
    """
    do_servidor = {"cancelado", "fora_do_evento"}
    sobrando = motivos_com_rotulo() - motivos_do_validador() - do_servidor
    assert not sobrando, (
        f"rótulos sem recusa correspondente na portaria: {sorted(sobrando)}"
    )
