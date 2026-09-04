# -*- coding: utf-8 -*-
"""O lote sai enquanto o motor ainda gera -- do motor ate o navegador (27/08/2026).

O usuario relatou, no dia seguinte a entrega por bloco entrar no ar:

    "esta gerando em blocos e ou em folhas, mas esta enviando ao hotfolder ou a
     impressora somente apos o termino da imposicao de todas as paginas,
     recaptulando, cada pagina ou bloco deve ser gerado individualmente e
     enviado ao destino imediatamente"

O motor cortava certo -- os testes de `test_engine_entrega_por_bloco.py`
provavam isso. Quem nao consumia o corte era a tela: ela juntava todos os
arquivos do streaming numa fila e so chamava o envio depois que o laco de
leitura terminava. Ou seja, o recurso inteiro era anulado no ultimo metro.

A esteira tem tres trechos, e cada um tinha o seu problema:

    motor  ->  app.py  ->  navegador  ->  hot folder / impressora
             (1)         (2)          (3)

    (1) O `on_file_gen` dormia 1,2 s a cada arquivo, uma pausa fixa para o
        event loop despachar o anterior. Com capa e miolo eram dois arquivos.
        Com a entrega por bloco sao centenas: 350 lotes viravam sete minutos de
        espera pura, dentro do recurso que existe para o papel sair antes.
    (3) A tela acumulava. Esse e o defeito que o usuario viu.

Este arquivo mede (1) e (2) de ponta a ponta, com o endpoint de verdade: o
primeiro lote tem de chegar ao cliente muito antes de o trabalho terminar. O
trecho (3) e medido pelo `entrega_imediata_harness.js`, porque so existe no
navegador.
"""
import io
import json
import os
import subprocess
import time

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "entrega_imediata_harness.js")


def _ler(rel):
    with io.open(os.path.join(RAIZ, rel), encoding="utf-8") as f:
        return f.read()


# ─── A tela: entrega dentro do laco, e nao depois ──────────────────────────

def test_o_harness_da_entrega_imediata_passa():
    assert os.path.exists(HARNESS), "o harness da entrega imediata sumiu"

    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=120,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    assert r.returncode == 0, "o harness falhou:" + (r.stdout or "") + (r.stderr or "")
    assert "OK:" in (r.stdout or ""), "o harness nao relatou sucesso:" + (r.stdout or "")


# ─── O app.py: contrapressao no lugar da pausa adivinhada ──────────────────

def test_o_motor_nao_dorme_mais_a_cada_arquivo():
    """A pausa fixa era barata com dois arquivos e cara com trezentos.

    1,2 s por arquivo nao aparece em teste nenhum de motor: o corte continua
    correto, as folhas continuam todas la. So aparece no relogio do operador,
    que e onde este recurso foi pedido.
    """
    # So o codigo: o comentario CITA a pausa antiga para explicar por que ela
    # saiu, e citar nao e fazer. Sem tirar os comentarios o arquivo se acusa e a
    # protecao nasce reprovada -- a mesma armadilha do `test_paralelismo.py`.
    app = " ".join(
        linha for linha in _ler("app.py").splitlines()
        if not linha.strip().startswith("#")
    )
    assert "time.sleep(1.2)" not in app, (
        "voltou a pausa fixa por arquivo: com a entrega por bloco sao centenas "
        "de lotes, e cada um passa a custar 1,2 s de espera pura"
    )


def test_a_contrapressao_limita_quantos_lotes_ficam_na_memoria():
    """Sem a pausa, e preciso algo que segure o motor -- mas pela razao certa.

    Sem freio nenhum o motor correria na frente do navegador e a fila encheria
    de base64: exatamente o acumulo de memoria que a entrega por bloco existe
    para evitar, so que mudado de lugar. A vaga volta quando o lote anterior ja
    saiu na resposta, entao o freio e o consumo real, e nao um numero chutado.
    """
    app = _ler("app.py")
    assert "threading.Semaphore(2)" in app, "a conta de vagas sumiu"

    i = app.index("def on_file_gen(file_info):")
    corpo = app[i:app.index("engine = ImpositionEngine(config, on_file_generated=on_file_gen)", i)]
    assert "esperar_vaga()" in corpo, (
        "o motor voltou a empurrar lote na fila sem esperar vaga"
    )
    assert corpo.index("esperar_vaga()") < corpo.index("loop.call_soon_threadsafe"), (
        "a espera tem de vir ANTES de pendurar o lote na fila"
    )

    j = app.index("async def event_generator():")
    gerador = app[j:app.index("return StreamingResponse(", j)]
    assert "vagas.release()" in gerador, (
        "a vaga nunca volta: o motor travaria no terceiro lote"
    )
    assert "cliente_saiu.set()" in gerador, (
        "sem isto, fechar a aba no meio deixa a thread do motor presa esperando "
        "uma vaga que nunca mais vem"
    )


# ─── De ponta a ponta, pelo endpoint de verdade ────────────────────────────

FORMATO = {
    "name": "Ticket 100x50",
    "width_mm": 100, "height_mm": 50,
    "cols": 2, "rows": 2,
    "gap_h_mm": 0, "gap_v_mm": 0,
    "offset_h_mm": 0, "offset_v_mm": 0,
    "rotations": {},
}
SAIDA = {"name": "A3", "width_mm": 300, "height_mm": 300}


def _payload(itens, por_bloco, entregar):
    return {
        "formato": FORMATO,
        "saida": SAIDA,
        "numeracao": {"tipo": "SEQUENCIAL", "elements": []},
        "seq_start": 1,
        "seq_end": itens,
        "seq_increment": 1,
        "sheets_per_block": por_bloco,
        "entregar_por_bloco": entregar,
        "stream": True,
        "suggested_filename": "teste.pdf",
    }


# O SERVIDOR TEM DE SER DE VERDADE.
#
# A primeira versao deste teste usava o `TestClient` do FastAPI, e ele reprovou
# a correcao que ja estava funcionando: os dez lotes marcavam o MESMO instante,
# o do fim. O transporte do TestClient junta a resposta inteira antes de
# devolver -- ele nao consegue medir streaming, que e justamente o que aqui se
# mede. Um servidor de mentira que acumula reprovaria para sempre qualquer
# entrega progressiva, por mais correta que fosse.
#
# Entao sobe um uvicorn de verdade, numa porta livre. Nunca a 9000: ali mora o
# NewProd.exe do usuario, com uma copia propria do frontend embutida.

@pytest.fixture(scope="module")
def servidor():
    import socket
    import sys

    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        porta = s.getsockname()[1]

    proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app:app", "--host", "127.0.0.1",
         "--port", str(porta), "--log-level", "warning"],
        cwd=RAIZ, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    base = f"http://127.0.0.1:{porta}"
    try:
        import urllib.error
        import urllib.request
        limite = time.monotonic() + 120
        while time.monotonic() < limite:
            if proc.poll() is not None:
                raise RuntimeError("o servidor morreu antes de atender")
            try:
                urllib.request.urlopen(base + "/app/index.html", timeout=2).read(1)
                break
            except (urllib.error.URLError, OSError):
                time.sleep(0.5)
        else:
            raise RuntimeError("o servidor nao subiu em 120 s")
        yield base
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=20)
        except subprocess.TimeoutExpired:
            proc.kill()


def _correr(base, payload):
    """Devolve (instantes de chegada de cada arquivo, instante do fim)."""
    import urllib.request
    import uuid

    limite = uuid.uuid4().hex
    corpo = (
        f"--{limite}\r\nContent-Disposition: form-data; name=\"payload\"\r\n\r\n"
        + json.dumps(payload) + f"\r\n--{limite}--\r\n"
    ).encode("utf-8")
    req = urllib.request.Request(
        base + "/api/impose", data=corpo,
        headers={"Content-Type": f"multipart/form-data; boundary={limite}"},
    )

    chegadas = []
    t0 = time.monotonic()
    with urllib.request.urlopen(req, timeout=280) as r:
        for linha in r:
            if linha.startswith(b"event: file"):
                chegadas.append(time.monotonic() - t0)
    return chegadas, time.monotonic() - t0


def test_o_primeiro_lote_chega_muito_antes_do_fim(servidor):
    """O que o usuario pediu, medido no relogio.

    200 itens, 4 por folha = 50 folhas; bloco de 5 -> 10 lotes. O primeiro tem
    de estar na mao do cliente enquanto os outros nove ainda estao sendo
    desenhados. Antes desta correcao os dez chegavam juntos, no fim -- o
    primeiro instante era igual ao ultimo.
    """
    chegadas, fim = _correr(servidor, _payload(200, 5, True))

    assert len(chegadas) == 10, f"esperava 10 lotes, vieram {len(chegadas)}"

    # ── Por que a regua nao e uma PROPORCAO do relogio (03/09/2026) ────────
    #
    # Ate esta data a cobranca era `chegadas[0] < fim * 0.5`. Ela compara um
    # custo FIXO -- subir o pedido, abrir a arte, montar o pool, e a cauda depois
    # do ultimo lote -- com um custo VARIAVEL, o desenho das 50 folhas. Os dois
    # nao crescem juntos: medido nesta maquina, o espalhamento dos dez lotes fica
    # em ~1,0 s sempre, enquanto o `fim` vai de 1,4 s ocioso a 5,3 s com a suite
    # inteira rodando em paralelo. A proporcao despenca sem que nada tenha
    # regredido -- e foi o que aconteceu quando a suite passou a subir um Chrome
    # de verdade: este teste falhava junto e passava sozinho.
    #
    # O que o usuario pediu, e o que a correcao entrega, e o ESPALHAMENTO: o
    # primeiro lote na mao do cliente enquanto os outros nove ainda estao sendo
    # desenhados. Antes da correcao os dez marcavam o MESMO instante, o do fim --
    # entao e o intervalo entre eles que separa o certo do errado, e ele nao
    # depende de quanto a maquina esta carregada.
    espalhamento = chegadas[-1] - chegadas[0]
    assert espalhamento > 0.3, (
        "os dez lotes chegaram numa rajada so: a esteira voltou a entregar tudo "
        f"no fim (do primeiro ao ultimo, {espalhamento:.2f}s; o trabalho inteiro "
        f"levou {fim:.1f}s)"
    )

    # E eles chegam UM A UM, e nao metade no meio e metade no fim. O intervalo
    # tipico entre lotes consecutivos e de ~0,11 s; numa rajada seria zero.
    intervalos = sorted(b - a for a, b in zip(chegadas, chegadas[1:]))
    tipico = intervalos[len(intervalos) // 2]
    assert tipico > 0.02, (
        f"os lotes chegaram amontoados: intervalo tipico de {tipico:.3f}s entre "
        "um lote e o seguinte"
    )


def test_sem_a_escolha_o_trabalho_continua_saindo_num_arquivo_so(servidor):
    """A recusa que protege quem nao pediu nada.

    Mesmo trabalho, mesma esteira, sem `entregar_por_bloco`: um arquivo, no
    fim. E o comportamento de sempre, e ele nao pode ter mudado de tabela junto.
    """
    chegadas, _ = _correr(servidor, _payload(200, 5, False))
    assert len(chegadas) == 1, f"esperava 1 arquivo, vieram {len(chegadas)}"
