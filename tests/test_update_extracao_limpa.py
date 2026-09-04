# -*- coding: utf-8 -*-
"""O agente novo tem de extrair os proprios arquivos, e nao herdar a pasta do velho.

## O caso, 04/09/2026

Tres versoes seguidas do agente sairam para levar a `mfc140u.dll` para dentro do
executavel, e na estacao a impressao continuou recusando com a mesma mensagem.
O executavel publicado tinha as DLLs -- conferido dentro do arquivo. A estacao
rodava a versao nova -- conferido pelo heartbeat. E mesmo assim, no disco, ao
lado do `win32ui.pyd` dela, nao havia DLL nenhuma.

## Por que

O agente e' um executavel "onefile": ao subir, ele extrai tudo o que carrega
para uma pasta temporaria (`_MEIxxxxxx`) e roda de la. Quem faz a extracao e' o
processo pai, que avisa o filho por variaveis de ambiente
(`_PYI_APPLICATION_HOME_DIR`, `_PYI_ARCHIVE_FILE`, `_PYI_PARENT_PROCESS_LEVEL`):
"ja extrai, use aquela pasta". O filho entao NAO extrai nada.

O update roda por um `.bat` que o proprio agente dispara -- e o `.bat` herda o
ambiente de quem o disparou, com essas variaveis dentro. Quando ele termina o
`msiexec` e chama o executavel NOVO, o bootloader ve as variaveis, se julga
filho de uma extracao que ja aconteceu e reaproveita a pasta ANTIGA -- que o
processo velho, ao morrer, ja apagou quase inteira.

O resultado e' a combinacao mais enganosa possivel: o CODIGO e' o novo (ele sai
de dentro do proprio .exe, e por isso a versao reportada esta certa), mas os
arquivos de apoio sao os velhos, ou nenhum. Foi medido nesta maquina: processo
iniciado as 10:57 rodando com a pasta de extracao das 07:04, na qual so
sobrevivera o `win32ui.pyd` -- justamente o arquivo que estava carregado em
memoria e por isso nao pode ser apagado.

## O alcance disto, que e maior que a impressao

Vale para TUDO que viaja no executavel: as DLLs, os PPDs, o pool do QR Ideal.
Qualquer arquivo novo que uma versao acrescente pode nao chegar ao disco da
estacao depois de um auto-update -- e a versao reportada dira que chegou.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import agent_worker


# Nomes do bootloader do PyInstaller 6 (lidos do proprio run.exe). O _MEIPASS2 e
# do PyInstaller 5 e antes: fica na lista porque limpar variavel que nao existe
# nao custa nada, e um dia o agente pode ser compilado por uma versao mais velha.
VARIAVEIS = ("_PYI_APPLICATION_HOME_DIR", "_PYI_ARCHIVE_FILE",
             "_PYI_PARENT_PROCESS_LEVEL", "_MEIPASS2")


def test_o_script_de_update_limpa_a_heranca_antes_de_subir_a_versao_nova():
    script = agent_worker._script_de_update(r"C:\App\NewProd.exe", r"C:\tmp\novo.msi")

    inicio_do_start = script.index("start ")
    for nome in VARIAVEIS:
        assert nome in script, f"o .bat nao limpa {nome}"
        assert script.index(nome) < inicio_do_start, (
            f"{nome} e limpo DEPOIS do start -- tarde demais, o executavel novo "
            "ja teria herdado a pasta de extracao do velho"
        )


def test_o_script_de_update_continua_fazendo_o_que_fazia():
    """A limpeza e um acrescimo. Se ela custar o resto, a estacao nao atualiza."""
    script = agent_worker._script_de_update(r"C:\App\NewProd.exe", r"C:\tmp\novo.msi")
    assert "taskkill" in script and "NewProd.exe" in script
    assert r'msiexec /i "C:\tmp\novo.msi" /qn' in script
    assert r'start "" "C:\App\NewProd.exe"' in script
    assert "del " in script


def test_a_ordem_e_encerrar_instalar_e_so_entao_subir():
    script = agent_worker._script_de_update(r"C:\App\NewProd.exe", r"C:\tmp\novo.msi")
    assert script.index("taskkill") < script.index("msiexec") < script.index("start ")
