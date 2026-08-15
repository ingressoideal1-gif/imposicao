# -*- coding: utf-8 -*-
"""O `/api/status` tem de dizer ONDE está rodando, e o painel tem de acreditar nisso.

O QUE ESTE TESTE PREVINE, E QUE JÁ ACONTECEU

Em 15/08/2026 a nuvem se apresentava como se fosse o agente da estação:

    https://imposicao.vercel.app/api/status
    → {"status":"running","message":"NewProd Agent ativo","version":"NewProd 1.2.77", ...}

É o mesmo `app.py` servindo os dois lugares, então a resposta era idêntica. O painel
procura o agente testando três endereços, e o PRIMEIRO da lista é o endereço da própria
página — que na Vercel leva ao Render. O painel acreditava, parava de procurar, e mandava a
imposição para a nuvem **mostrando na tela o selo "⚡ AGENTE LOCAL"**.

O estrago:

- **O QR Ideal não conseguia ser impresso por caminho nenhum.** A nuvem não tem o
  `qr_ideal_pool.bin` — e nunca vai ter, porque ele é o segredo mestre do controle de
  acesso — então o trabalho parava com "falta a lista de codigos desta estacao".
- **A imposição rodava na nuvem sem ninguém saber**, contra a razão de o agente existir:
  o operador está de pé na frente da impressora, e o agente foi criado por tempo.
- **A faixa de credenciais não subia**, porque quem impõe na nuvem não é um agente com
  faixa a publicar.

O modo de falhar foi o de sempre neste projeto: a tela dizia uma coisa e o papel era outra.
"""

import importlib
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent


def _status(monkeypatch, no_render: bool):
    """O corpo do `/api/status`, com e sem o ambiente do Render."""
    import security_config
    monkeypatch.delenv("RENDER", raising=False)
    monkeypatch.delenv("RENDER_SERVICE_ID", raising=False)
    if no_render:
        monkeypatch.setenv("RENDER", "true")
    importlib.reload(security_config)
    import app
    return app.read_root()


def test_na_estacao_o_status_diz_local(monkeypatch):
    assert _status(monkeypatch, no_render=False)["onde"] == "local"


def test_na_nuvem_o_status_diz_nuvem(monkeypatch):
    """É esta palavra que impede a nuvem de se passar pelo agente."""
    assert _status(monkeypatch, no_render=True)["onde"] == "nuvem"


def test_o_status_continua_respondendo_o_que_respondia(monkeypatch):
    """Compatibilidade: agente antigo e painel antigo continuam se entendendo."""
    s = _status(monkeypatch, no_render=False)
    assert s["status"] == "running"
    assert "version" in s and "capabilities" in s


def test_o_local_print_agent_tambem_se_identifica():
    """Ele implementa os mesmos endpoints por fora do app.py. Uma correção que
    vale só para um dos dois some sem avisar — foi por isso que o
    `security_config.py` existe."""
    texto = (RAIZ / "local_print_agent.py").read_text(encoding="utf-8")
    assert '"onde"' in texto, "o local_print_agent nao diz onde esta rodando"
    # As duas rotas que respondem status têm de sair do MESMO lugar. Enquanto
    # forem dois `return` escritos à mão, uma delas pode perder o campo sem
    # ninguém notar — que é a forma como este projeto costuma quebrar.
    assert texto.count("_status_do_agente()") >= 3, (
        "as rotas de status do local_print_agent nao compartilham o mesmo corpo"
    )


def test_TODA_sondagem_do_painel_recusa_quem_se_declara_nuvem():
    """A regra do painel, lida dos próprios arquivos.

    Recusa por `onde !== 'nuvem'`, e NÃO exige `onde === 'local'`: um agente
    antigo, que ainda não conhece o campo, precisa continuar sendo aceito
    enquanto as estações não atualizarem. A nuvem, essa, se declara — e é ela
    que precisa ser barrada.

    Varre TODOS os `.js` do frontend, e não só o `script.js`, porque a sondagem
    está duplicada: existe uma cópia no `pedido.js`. Corrigir uma e esquecer a
    outra deixaria metade das telas impondo na nuvem — e este projeto já perdeu
    uma madrugada com quatro cópias divergentes da regra da numeração.
    """
    culpados = []
    for arquivo in sorted((RAIZ / "frontend").glob("*.js")):
        texto = arquivo.read_text(encoding="utf-8")
        for numero, linha in enumerate(texto.splitlines(), 1):
            if not re.search(r"""status\s*===\s*['"]running['"]""", linha):
                continue
            if re.search(r"""onde\s*!==\s*['"]nuvem['"]""", linha):
                continue
            culpados.append(f"{arquivo.name}:{numero}")

    assert not culpados, (
        "sondagem do agente que aceita qualquer 'running', inclusive a nuvem — "
        "a imposicao volta a rodar no Render achando que e a estacao, e o QR "
        "Ideal fica impossivel de imprimir:\n  " + "\n  ".join(culpados)
    )
