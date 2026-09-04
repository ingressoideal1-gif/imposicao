# -*- coding: utf-8 -*-
"""Todo arquivo `.js` do frontend tem de ser JavaScript válido.

## O que este teste previne, e que acabou de acontecer

Em 04/09/2026 uma aspa mal fechada entrou no `ideal-control.js` — uma string
partida em duas linhas, que o navegador recusa inteira. O arquivo deixou de
carregar, `window.IdealControl` nunca nasceu, e a tela da gráfica ficou em
branco. Vinte e seis testes daquela tela quebraram de uma vez, todos com a mesma
mensagem inútil: "Waiting failed: 30000ms exceeded".

O defeito custou caro por dois motivos, e os dois se repetiriam:

1. **A causa não aparece na falha.** Nada dizia "erro de sintaxe" — dizia que a
   página não terminou de carregar, que é o sintoma de dez coisas diferentes.
2. **Só as telas COM teste de navegador o pegam.** Um arquivo novo sem teste
   próprio quebraria em silêncio, e o primeiro a descobrir seria quem abrisse a
   tela — na gráfica, ou no portão.

Um `node --check` por arquivo custa uns segundos e responde a pergunta certa,
com o número da linha.

## O que ele NÃO cobre

Erro de execução. Um `undefined.foo` continua passando aqui: isto é a gramática,
não o comportamento. Quem prova comportamento são os arnês de navegador de cada
tela — e é justamente por eles serem caros que vale ter esta rede grossa antes.
"""

import os
import shutil
import subprocess

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRONTEND = os.path.join(RAIZ, "frontend")

# Bibliotecas vendorizadas ficam de fora: elas não são código nosso, algumas são
# módulos ES (que o `--check` do Node avalia com outra gramática) e nenhuma
# muda sem ser trocada inteira por uma versão nova.
DE_FORA = (".min.js",)


def arquivos():
    return sorted(
        nome for nome in os.listdir(FRONTEND)
        if nome.endswith(".js") and not nome.endswith(DE_FORA)
    )


def test_ha_arquivos_para_conferir():
    """Guarda o próprio teste: uma lista vazia passaria por vácuo, aprovando
    tudo sem olhar nada."""
    achados = arquivos()
    assert len(achados) > 30, f"só achei {len(achados)} arquivos em frontend/"
    assert "ao-vivo.js" in achados
    assert "ideal-control.js" in achados


@pytest.mark.parametrize("nome", arquivos())
def test_o_arquivo_e_javascript_valido(nome):
    if not shutil.which("node"):
        pytest.skip("Node não está nesta máquina")
    r = subprocess.run(
        ["node", "--check", os.path.join(FRONTEND, nome)],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
        timeout=60,
    )
    assert r.returncode == 0, (
        f"frontend/{nome} não é JavaScript válido — a tela que o carrega abre "
        f"em branco:\n{(r.stderr or '')[:1500]}"
    )
