# -*- coding: utf-8 -*-
"""A coluna que marca quando as entradas de um evento foram zeradas.

Apagar as entradas no servidor nao zera nada no portao. Cada celular ja tem as
entradas baixadas no IndexedDB, e o sincronismo de cinco minutos so ACRESCENTA
-- ele nunca remove. Sem uma marca de tempo que o aparelho compare com a que
guardou, o contador continuaria mostrando o publico do teste e a regra
`ja_entrou` continuaria barrando quem ja entrou. O dono zeraria no painel e nada
mudaria na porta.
"""

import os

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SQL = os.path.join(RAIZ, "sql", "schema_acesso_zerar_entradas.sql")


def _sql():
    with open(SQL, encoding="utf-8") as f:
        return f.read()


def _sem_comentarios():
    """O SQL de verdade, sem as linhas `--`.

    O arquivo explica por que NAO ha default, e a explicacao cita a palavra de
    proposito. Sem tirar os comentarios, o teste acusaria a explicacao como se
    fosse o defeito. O mesmo vale para o `DROP COLUMN` do "COMO DESFAZER", que
    esta comentado e nao deve contar como coisa que este arquivo apaga.
    """
    return "\n".join(
        linha for linha in _sql().splitlines()
        if not linha.lstrip().startswith("--")
    )


def test_o_arquivo_existe():
    assert os.path.exists(SQL)


def test_cria_a_coluna_na_tabela_de_eventos():
    texto = _sem_comentarios().lower()
    assert "alter table producao_acesso_eventos" in texto
    assert "entradas_zeradas_em" in texto


def test_guarda_instante_com_fuso():
    """TIMESTAMP sem fuso seria lido como hora da maquina do banco.

    O aparelho COMPARA esta marca com a que ele guardou; um instante sem fuso
    faria a comparacao depender de onde cada lado esta, e o portao zeraria cedo
    demais ou nunca.
    """
    assert "timestamptz" in _sem_comentarios().lower()


def test_e_repetivel():
    """Rodar duas vezes no editor do Supabase nao pode quebrar nada."""
    assert "if not exists" in _sem_comentarios().lower()


def test_nasce_NULA_e_nao_com_a_hora_da_migracao():
    """Nulo quer dizer "este evento nunca foi zerado".

    Um DEFAULT now() carimbaria a migracao inteira com o instante em que o
    arquivo rodou, e no sincronismo seguinte TODO portao em campo acharia que
    acabara de receber uma ordem de zerar -- as entradas de um evento
    acontecendo agora sumiriam do celular do porteiro.
    """
    assert "default" not in _sem_comentarios().lower()


def test_nao_apaga_nada_ao_rodar():
    """Migracao de esquema nao destroi dado. Quem apaga as entradas e a rota
    `POST /eventos/{id}/zerar-entradas`, com elevacao e confirmacao do dono."""
    texto = _sem_comentarios().lower()
    for perigo in ("delete", "drop", "truncate", "update"):
        assert perigo not in texto, f"o arquivo executa um {perigo.upper()}"


def test_nao_toca_nas_tabelas_de_entrada_e_leitura():
    """Este arquivo so acrescenta a marca. As linhas continuam onde estao."""
    texto = _sem_comentarios().lower()
    assert "producao_acesso_entradas_unicas" not in texto
    assert "producao_acesso_leituras" not in texto


def test_diz_como_rodar_e_como_desfazer():
    texto = _sql().lower()
    assert "como rodar" in texto
    assert "desfazer" in texto
