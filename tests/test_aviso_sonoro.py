# -*- coding: utf-8 -*-
"""O aviso sonoro do portao: o bipe e a vibracao de cada leitura.

O porteiro segura o aparelho, mas nem sempre olha para ele -- e no portao o som
some no barulho. Por isso os dois avisos existem juntos, e por isso os dois
precisam ser DIFERENTES um do outro: se liberado e barrado soarem igual, o som
nao serve para nada e o porteiro volta a depender da tela.

Duas coisas aqui nao podem errar:

  1. NADA PODE LANCAR. iPhone nao tem `navigator.vibrate`, navegador antigo nao
     tem `AudioContext`, e tocar audio antes de um gesto do usuario falha. Som e
     enfeite; uma excecao no enfeite derruba a leitura do portao inteira.

  2. O SOM NAO NASCE LIBERADO. Navegador nenhum toca audio antes de a pessoa
     encostar na tela. Tentar assim mesmo falha EM SILENCIO -- que e justamente
     o modo de errar que esta tela existe para evitar.
"""

import json
import os
import re
import subprocess

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "aviso_sonoro_harness.js")
ARQUIVO = os.path.join(RAIZ, "frontend", "aviso-sonoro.js")


def chamar(nome, *argumentos, sem_audio=False, sem_vibrar=False, sem_liberar=False):
    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=300, capture_output=True, text=True,
        input=json.dumps({
            "chamada": nome,
            "argumentos": list(argumentos),
            "sem_audio": sem_audio,
            "sem_vibrar": sem_vibrar,
            "sem_liberar": sem_liberar,
        }),
    )
    if r.returncode != 0:
        pytest.fail(f"o harness falhou:\n{r.stdout}\n{r.stderr}")
    return json.loads(r.stdout)


def fonte():
    with open(ARQUIVO, encoding="utf-8") as f:
        return f.read()


def codigo():
    """O arquivo SEM os comentarios de bloco.

    O cabecalho precisa citar o `.mp3` que NAO existe -- e o que impede alguem
    de acrescentar um sem saber por que ele foi recusado. Uma busca crua leria
    essa prosa como se fosse o defeito de volta.
    """
    return re.sub(r"/\*.*?\*/", "", fonte(), flags=re.S)


# ── Os dois avisos precisam ser distinguiveis de ouvido ─────────────────────

def test_liberado_e_barrado_soam_diferente():
    """O porteiro nao esta olhando a tela. Se os dois sons forem iguais, o som
    nao serve para nada."""
    a = chamar("liberado")
    b = chamar("barrado")
    assert a["osciladores"][0]["frequencia"] != b["osciladores"][0]["frequencia"]
    assert a["osciladores"][0]["duracao"] < b["osciladores"][0]["duracao"]


def test_liberado_e_agudo_e_barrado_e_grave():
    """Grave e a convencao de erro, e ela sobrevive melhor ao barulho da fila."""
    assert chamar("liberado")["osciladores"][0]["frequencia"] > 800
    assert chamar("barrado")["osciladores"][0]["frequencia"] < 400


def test_barrado_vibra_mais_que_liberado():
    assert sum(chamar("barrado")["vibracao"]) > sum(chamar("liberado")["vibracao"])


def test_liberado_vibra_uma_vez_so():
    """Um toque curto: e confirmacao, nao alarme. Quem passou ja passou."""
    assert len(chamar("liberado")["vibracao"]) == 1


def test_cada_leitura_produz_um_aviso_e_nao_uma_sequencia():
    """Numa fila rapida os avisos se atropelam. Um bipe por leitura."""
    assert len(chamar("liberado")["osciladores"]) == 1
    assert len(chamar("barrado")["osciladores"]) == 1


# ── Nada aqui pode lancar ───────────────────────────────────────────────────

def test_navegador_sem_vibrar_NAO_lanca():
    """iPhone nao tem `navigator.vibrate`. Uma excecao aqui derrubaria a
    leitura inteira por causa de um enfeite."""
    r = chamar("liberado", sem_vibrar=True)
    assert r["lancou"] is None


def test_navegador_sem_vibrar_AINDA_APITA():
    """Perder a vibracao nao pode custar o som: no iPhone ele e o unico aviso."""
    assert len(chamar("liberado", sem_vibrar=True)["osciladores"]) == 1


def test_navegador_sem_audio_NAO_lanca():
    r = chamar("liberado", sem_audio=True)
    assert r["lancou"] is None


def test_navegador_sem_audio_AINDA_VIBRA():
    """Vibracao nao depende de `AudioContext`, e no bolso ela e o aviso que
    chega."""
    assert chamar("liberado", sem_audio=True)["vibracao"] == [40]


def test_barrado_tambem_nao_lanca_sem_nada():
    r = chamar("barrado", sem_audio=True, sem_vibrar=True)
    assert r["lancou"] is None


def test_liberar_sem_audio_nenhum_nao_lanca_e_diz_que_nao_esta_pronto():
    r = chamar("liberar", sem_audio=True)
    assert r["lancou"] is None
    assert r["resultado"] is False
    assert r["pronto"] is False


# ── O toque que destrava o som ──────────────────────────────────────────────

def test_antes_de_liberar_nao_toca():
    """Navegador nenhum toca audio antes de um gesto. Tentar assim mesmo falha
    em silencio -- e silencio e o modo de errar que esta tela evita."""
    r = chamar("liberado", sem_liberar=True)
    assert r["osciladores"] == []
    assert r["pronto"] is False


def test_antes_de_liberar_a_leitura_SEGUE():
    """Sem o toque o aviso some, mas nao vira excecao: a fila continua andando
    e o porteiro descobre pela tela."""
    assert chamar("liberado", sem_liberar=True)["lancou"] is None


def test_liberar_deixa_pronto():
    r = chamar("pronto")
    assert r["resultado"] is True


def test_liberar_destrava_com_silencio_e_nao_com_um_bipe():
    """O gesto que destrava o audio acontece na tela "Toque para comecar a
    ler". Um bipe ali seria um aviso que nao corresponde a leitura nenhuma."""
    r = chamar("pronto")
    assert r["osciladores"] == []
    assert r["buffers"] == 1


def test_liberar_duas_vezes_nao_cria_dois_contextos():
    """O porteiro sai da leitura e volta. Cada `AudioContext` e um recurso do
    aparelho, e o navegador limita quantos existem."""
    r = chamar("liberar")   # o harness ja chamou `liberar` uma vez antes
    assert r["contextos"] == 1


# ── A regra da tela: nada de baixar arquivo ─────────────────────────────────

def test_o_bipe_e_gerado_no_aparelho_sem_arquivo_de_som():
    """Esta tela abre sem rede. Um `.mp3` seria um download no caminho de uma
    leitura -- e um aviso mudo no portao onde ele falhasse."""
    texto = codigo()
    for proibido in (".mp3", ".ogg", ".wav", "new Audio", "fetch("):
        assert proibido not in texto, f"o aviso sonoro nao pode depender de {proibido}"


def test_o_bipe_sai_do_web_audio():
    """A contraparte do teste acima: nao basta nao baixar, tem de sintetizar."""
    texto = codigo()
    assert "createOscillator" in texto
    assert "AudioContext" in texto


def test_o_arquivo_e_ES5():
    """Regra do frontend deste projeto: sem build, sem `let`/`const`/arrow."""
    texto = codigo()
    for proibido in ("let ", "const ", "=>", "`"):
        assert proibido not in texto, f"ES5: {proibido!r} nao entra aqui"
