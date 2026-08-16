# -*- coding: utf-8 -*-
"""As colunas que bloqueiam um setor inteiro.

Bloquear FAIXA de numeros ja existia. Bloquear o setor inteiro e outra coisa: o
dono desliga a porta no meio do evento e escreve o motivo que o porteiro le em
voz alta para quem esta na fila.

Por que coluna nova, e nao a coluna `status` que ja existe: o painel do dono
filtra os setores por `status=eq.ativo`. Marcar o setor como bloqueado ali o
faria SUMIR da tela -- o dono bloquearia o setor e perderia o proprio botao de
desbloquear, sem uma palavra que explicasse.
"""

import os

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SQL = os.path.join(RAIZ, "sql", "schema_acesso_setor_bloqueado.sql")


def _sql():
    with open(SQL, encoding="utf-8") as f:
        return f.read()


def _sem_comentarios():
    """O SQL de verdade, sem as linhas `--`.

    O arquivo explica a armadilha do `status` citando-o de proposito. Sem tirar
    os comentarios, o teste acusaria a explicacao como se fosse o defeito.
    """
    return "\n".join(
        linha for linha in _sql().splitlines()
        if not linha.lstrip().startswith("--")
    )


def test_o_arquivo_existe():
    assert os.path.exists(SQL)


def test_cria_as_duas_colunas_na_tabela_de_setores():
    texto = _sem_comentarios().lower()
    assert "alter table producao_acesso_setores" in texto
    assert "bloqueado" in texto
    assert "bloqueado_motivo" in texto


def test_e_repetivel():
    """Rodar duas vezes no editor do Supabase nao pode quebrar nada."""
    assert "if not exists" in _sem_comentarios().lower()


def test_o_padrao_e_desbloqueado():
    """Coluna nova nao pode desligar setor que ja esta trabalhando.

    A tabela tem setores em evento de verdade agora. Um DEFAULT true, ou um
    NOT NULL sem default, fecharia porta que ninguem mandou fechar.
    """
    assert "default false" in _sem_comentarios().lower()


def test_nao_toca_na_coluna_status():
    assert "status" not in _sem_comentarios().lower()


def test_diz_como_desfazer():
    assert "desfazer" in _sql().lower()
