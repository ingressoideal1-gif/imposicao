# -*- coding: utf-8 -*-
"""Os testes das Edge Functions rodam junto com o resto da suíte.

## Por que este arquivo existe

As funções do Supabase são TypeScript, e os testes delas são `deno test`. Até
04/09/2026 nada os disparava: quem quisesse rodá-los tinha de saber o comando e
lembrar de digitá-lo. São 181 testes cobrindo a assinatura da elevação, a
configuração do evento, a deduplicação da faixa e agora as contas do relatório —
tudo o que decide se um ingresso abre a porta.

Um teste que ninguém roda é pior do que teste nenhum: ele dá a sensação de
cobertura sem dar a cobertura. E o custo de corrigir isso é de três segundos por
rodada, medido nesta máquina — barato demais para continuar de fora.

## Por que ele pula em vez de falhar quando não há Deno

A suíte roda também nas estações da gráfica, onde não há Node nem Deno
instalados e não deve haver: a estação imprime, não desenvolve. Falhar ali
transformaria uma ferramenta ausente num defeito do produto, e a primeira coisa
que alguém faria seria ignorar a suíte inteira.

Na máquina de desenvolvimento, onde o `package.json` declara o Deno como
dependência, ele roda de verdade.
"""

import os
import shutil
import subprocess

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FUNCOES = os.path.join(RAIZ, "supabase", "functions")

# `--allow-env` porque o dublê de banco põe SUPABASE_URL no ambiente antes de
# chamar o módulo; `--allow-read` porque dois testes leem os arquivos de casos
# gravados (`hora_casos.json`, `momento_casos.json`). Nenhuma permissão de rede:
# um teste destes que precisasse da internet estaria testando outra coisa.
PERMISSOES = ["--allow-env", "--allow-read"]


def _comando():
    """O Deno, do jeito que esta máquina o tem — ou None."""
    direto = shutil.which("deno")
    if direto:
        return [direto]
    # O `package.json` o declara como devDependency: numa instalação feita,
    # ele está aqui mesmo sem estar no PATH.
    for nome in ("deno.cmd", "deno.exe", "deno"):
        local = os.path.join(RAIZ, "node_modules", ".bin", nome)
        if os.path.exists(local):
            return [local]
    npx = shutil.which("npx") or shutil.which("npx.cmd")
    return [npx, "deno"] if npx else None


def test_os_testes_das_edge_functions_passam():
    comando = _comando()
    if not comando:
        pytest.skip("Deno não está nesta máquina (estação da gráfica, por exemplo)")
    if not os.path.isdir(FUNCOES):
        pytest.skip("as funções não estão neste repositório")

    r = subprocess.run(
        comando + ["test", *PERMISSOES, "--quiet"],
        cwd=FUNCOES,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=300,
    )
    assert r.returncode == 0, (
        "os testes das Edge Functions falharam. Saída do Deno:\n"
        + (r.stdout or "")[-4000:]
        + "\n"
        + (r.stderr or "")[-2000:]
    )


def test_todo_arquivo_de_teste_do_deno_esta_onde_o_deno_procura():
    """`deno test` sem argumento colhe `*_test.ts`. Nome fora do padrão não roda.

    É a mesma armadilha que este arquivo existe para fechar, um nível abaixo:
    um teste chamado `relatorio.test.ts` ou `teste_relatorio.ts` seria ignorado
    em silêncio, e ninguém descobre um teste que não roda.
    """
    fora = []
    for pasta, _, arquivos in os.walk(FUNCOES):
        for nome in arquivos:
            if not nome.endswith(".ts"):
                continue
            eh_teste = "test" in nome.lower()
            if eh_teste and not nome.endswith("_test.ts"):
                fora.append(os.path.relpath(os.path.join(pasta, nome), RAIZ))
    assert not fora, f"o `deno test` não colhe estes arquivos: {fora}"
