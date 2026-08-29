# -*- coding: utf-8 -*-
"""O banner "Atualizar Agora" do agente local.

Relato do usuario em 29/08/2026: *"Erro ao atualizar agente: Failed to fetch"*.

O banner carregava DOIS contratos mortos:

  1. mandava um `download_url` apontando para
     `https://ideal-imposition.vercel.app/app/ideal-imposition-agent.exe`.
     Conferido: aquele endereco da **404**. O agente virou MSI no Storage do
     Supabase, publicado pelo `publicar_agente.ps1` com manifesto e sha256.
  2. o proprio `/api/update` deixou de aceitar esse campo de PROPOSITO — aceitar
     a origem do download vinda da requisicao transformava o endpoint numa porta
     de execucao remota: qualquer site aberto no navegador do operador conseguia
     mandar o agente baixar e executar um binario arbitrario. Hoje a origem vem
     do manifesto de URL fixa compilada no binario.

O "Failed to fetch" e' falha de REDE, e o banner nao dizia para onde tinha
tentado nem o que fazer. As tres correcoes abaixo atacam isso.
"""
import io
import os

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _ler(rel):
    with io.open(os.path.join(RAIZ, rel), encoding="utf-8") as f:
        return f.read()


def _sem_comentarios(texto):
    """O codigo sem as linhas de comentario.

    Os comentarios CITAM os contratos mortos de proposito, para registrar o que
    saiu e por que. Procurar a citacao e' o mesmo erro de quem procura a palavra
    em vez da chamada -- ja aconteceu com o `onPedHotFolderToggle`.
    """
    linhas = []
    for linha in texto.split("\n"):
        if linha.strip().startswith("//"):
            continue
        linhas.append(linha)
    return "\n".join(linhas)


def _bloco_do_banner():
    js = _ler("frontend/script.js")
    i = js.index("function showAgentUpdateWarning(")
    f = js.index("window.showAgentUpdateWarning =")
    return _sem_comentarios(js[i:f])


def test_o_banner_nao_manda_mais_a_url_morta():
    bloco = _bloco_do_banner()
    assert "ideal-imposition-agent.exe" not in bloco, (
        "o banner voltou a apontar para o .exe na Vercel, que da 404 desde que "
        "o agente virou MSI no Storage"
    )
    assert "download_url" not in bloco, (
        "o banner voltou a mandar download_url; o endpoint o IGNORA de proposito "
        "-- aceitar a origem do download vinda da requisicao era porta de "
        "execucao remota"
    )


def test_o_pedido_e_uma_requisicao_simples():
    """Sem Content-Type nao ha preflight, e sem preflight nao ha falha de CORS.

    `Content-Type: application/json` torna a requisicao NAO-SIMPLES e obriga um
    OPTIONS antes. Cada preflight e' mais um jeito de dar "Failed to fetch" sem
    dizer por que -- e o corpo que ele carregava nem era lido.
    """
    bloco = _bloco_do_banner()
    i = bloco.index("/api/update")
    trecho = bloco[max(0, i - 400):i + 200]
    assert "Content-Type" not in trecho, (
        "o POST do banner voltou a mandar Content-Type e a exigir preflight"
    )
    assert "body:" not in trecho, "o POST do banner voltou a mandar corpo"


def test_o_banner_acha_o_agente_na_hora_do_clique():
    """O `baseUrl` capturado na criacao pode nao ser o do agente.

    O banner e' mostrado por DOIS caminhos, e um deles sonda uma lista que
    comeca pelo endereco da PROPRIA PAGINA. Pedir a atualizacao para a Vercel
    nao atualiza agente nenhum -- e falha exatamente como "Failed to fetch".
    """
    js = _ler("frontend/script.js")
    assert "async function _baseDoAgenteAgora(" in js, (
        "a busca do agente no momento do clique sumiu"
    )

    corpo = js[js.index("async function _baseDoAgenteAgora(preferido) {"):]
    corpo = corpo[:corpo.index("\n}") + 2]

    assert "127.0.0.1:9000" in corpo and "localhost:9000" in corpo
    assert "/api/status" in corpo, "deixou de conferir se ha agente de verdade ali"
    assert "'nuvem'" in corpo, (
        "deixou de recusar a nuvem; agente da nuvem nao se atualiza e nem existe "
        "mais -- foi ele que ja fez o painel imprimir fora da estacao"
    )

    assert "_baseDoAgenteAgora(baseUrl)" in _bloco_do_banner(), (
        "o botao voltou a usar o baseUrl capturado na criacao do banner"
    )


def test_a_falha_diz_a_saida():
    """Trava que impede o operador de seguir precisa dizer como sair dela.

    "Failed to fetch" nao diz nada a quem esta na estacao. O menu da bandeja
    sempre funciona -- aquele caminho nao passa pelo navegador.
    """
    bloco = _bloco_do_banner()
    assert "bandeja" in bloco, (
        "a mensagem de erro deixou de apontar o menu da bandeja, que e' a saida "
        "que sempre funciona"
    )


def test_o_endpoint_continua_recusando_origem_de_fora():
    """A trava do lado do agente, que e' a que importa de verdade.

    O frontend parar de mandar `download_url` e' higiene; o que impede a
    execucao remota e' o endpoint nao aceitar parametro nenhum.
    """
    app = _ler("app.py")
    corpo = app[app.index('@app.post("/api/update")'):]
    corpo = corpo[:corpo.index("\n@app.")]

    assert "async def trigger_update():" in corpo, (
        "o /api/update voltou a receber parametro: qualquer site aberto no "
        "navegador do operador poderia escolher o que o agente baixa e executa"
    )
    # Pela LEITURA do campo, e nao pela palavra: a propria docstring do endpoint
    # cita `download_url` para registrar o que foi removido e por que. Procurar a
    # palavra reprova a explicacao junto com o defeito -- foi assim que o teste
    # do `onPedHotFolderToggle` falhou hoje cedo, pelo mesmo motivo.
    assert 'get("download_url")' not in corpo and "get('download_url')" not in corpo, (
        "o endpoint voltou a LER a origem do download da requisicao"
    )
    assert "agent_worker.verificar_atualizacao" in corpo, (
        "o endpoint deixou de disparar a verificacao pelo manifesto"
    )
