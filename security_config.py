# -*- coding: utf-8 -*-
"""
Configuração central de segurança — compartilhada pelo `app.py` (o motor da
estação da gráfica) e pelo agente local (NewProd.exe / local_print_agent.py).

Fica em um módulo único porque app.py e local_print_agent.py implementam os
mesmos endpoints separadamente; sem isto, uma correção aplicada em um dos
arquivos silenciosamente não vale para o outro.

Até 16/08/2026 este mesmo módulo servia também a uma cópia do `app.py` que
rodava num servidor na nuvem. Aquele servidor saiu em 17/08/2026: o que era
dele virou Edge Function em `supabase/functions/`, e o `app.py` ficou sendo só o
motor da estação.
"""

import os
from urllib.parse import urlparse

# ─── CORS ─────────────────────────────────────────────────────────────────────
# As duas origens em que o site atende. O painel servido pela estação chama o
# `/api/*` da própria máquina (same-origin), mas a tela do operador pode ter sido
# baixada de qualquer uma destas duas, e é a origem dela que o navegador manda.
#
# A origem do servidor que ficava na nuvem saiu daqui em 17/08/2026, junto com o
# servidor.
ALLOWED_ORIGINS = [
    "https://ideal-imposition.vercel.app",
    "https://imposicao.vercel.app",
]

# Cobre os deploys de preview do Vercel (URL dinâmica por branch) e o
# desenvolvimento local em qualquer porta.
ALLOWED_ORIGIN_REGEX = (
    r"https://(ideal-imposition|imposicao)(-[a-z0-9-]+)?\.vercel\.app"
    r"|http://(localhost|127\.0\.0\.1)(:\d+)?"
)


# ─── Auto-atualização do agente local ─────────────────────────────────────────
# Modelo pull: o agente consulta este manifesto sozinho, num endereço fixo
# compilado no binário. Nada externo escolhe o que ele baixa — foi justamente
# a URL vinda de fora que tornava o /api/update uma porta de execução remota.
#
# A URL do projeto fica literal de propósito: se viesse de variável de
# ambiente, quem controlasse o ambiente controlaria a origem da atualização.
SUPABASE_PROJETO = "https://vwbtitjlpelrcnsytzqw.supabase.co"
RELEASES_BASE_URL = f"{SUPABASE_PROJETO}/storage/v1/object/public/agent-releases/"
MANIFEST_URL = RELEASES_BASE_URL + "latest.json"


def is_allowed_release_url(url: str) -> bool:
    """Confere que o instalador apontado pelo manifesto está no nosso bucket.

    Segunda barreira: mesmo que o manifesto seja adulterado, o download só
    acontece se continuar dentro de agent-releases.
    """
    return (url or "").lower().startswith(RELEASES_BASE_URL.lower())


# ─── Painel servido pelo agente ───────────────────────────────────────────────
# O painel embutido no executável envelhecia a cada publicação do site, e
# atualizá-lo custava um release de agente por vez. Agora o agente baixa os
# arquivos do painel desta origem e serve a cópia local.
#
# ISSO NÃO MOVE A IMPOSIÇÃO PARA A NUVEM. O `API_BASE_URL` do supabase-config.js
# é vazio SEMPRE, e vazio quer dizer "quem serviu a página responde": servido
# pelo agente na 9000, `${API_BASE_URL}/api/impose` é o motor da própria máquina.
# Baixar o arquivo da nuvem não altera essa decisão — e não existe mais nenhum
# endereço de nuvem para onde a imposição pudesse cair.
#
# Origem literal pelo mesmo motivo do manifesto: vinda de fora, quem controlasse
# o ambiente controlaria o código que roda na estação.
#
# `ideal-imposition`, e não `imposicao`, desde 17/08/2026. O site atende pelos
# DOIS endereços (os dois estão em ALLOWED_ORIGINS logo acima), mas o aplicativo
# instalável mora no primeiro — é dele que o cliente instala o Ideal Control, e é
# a origem em que ficam o chaveiro dos portões e o service worker dele.
#
# Enquanto o QR do Pedido era cunhado com `imposicao`, quem TOCAVA no link no
# WhatsApp — em vez de lê-lo pela câmera do aplicativo — caía no outro endereço,
# numa aba de navegador: outra origem, outro `localStorage`, e o celular ainda
# oferecia instalar uma SEGUNDA cópia do aplicativo. Duas cópias do mesmo sistema
# no mesmo celular, cada uma com os seus portões.
#
# QR já emitido continua valendo: `imposicao.vercel.app` segue servindo o site.
# O que muda é só o que se cunha daqui para a frente.
PAINEL_BASE_URL = "https://ideal-imposition.vercel.app"

# Só o que a estação precisa. As fontes (fonts_local) ficam de fora: são ~140 MB
# e já têm o próprio sincronismo, pelo Storage.
#
# A REGRA: todo arquivo local que index.html, producao.html ou cliente.html
# carregam tem de estar aqui. Arquivo de fora desta lista nunca se atualiza na
# estação — o `_semear_painel` do app.py o copia da cópia embutida e a
# sincronização não o baixa. Se ele nasceu depois do build do agente, dá 404; se
# mudou depois, fica congelado, e o `?v=NNN` do HTML ainda por cima anuncia a
# versão nova. Foi assim que o `amostra-modal.js` passou a dar 404 em toda
# estação e o `csv-editor.js` ficou três releases atrás sem ninguém notar.
# `tests/test_painel_estacao.py` compara esta lista com o que o HTML pede.
PAINEL_ARQUIVOS = [
    "index.html",
    "producao.html",
    "cliente.html",
    "acesso-conta.js",
    # O fundo da casa do Ideal Control (24/08/2026). O `controle.html`
    # que a estacao baixa ja pede este script: sem o nome aqui, a estacao
    # serviria a pagina nova com um 404 no lugar dele.
    "fundo-do-app.js",
    "controle.html",
    "controle.js",
    "controle.css",
    # A fonte da identidade visual do Ideal Control (18/08/2026), pedida pelo
    # controle.css e pelo portaria.html. Sem ela aqui a estacao serviria a casa
    # com a letra do sistema -- funciona, mas nao e a tela que foi publicada.
    "ideal-control.woff2",
    "ideal-control.js",
    "script.js",
    "pedido.js",
    # A tela do Painel do Acabamento (20/08/2026). Ela mora em arquivo
    # proprio, e o `index.html` que a estacao baixa ja tem a tag <script>
    # apontando para ela: sem este nome aqui, a estacao serviria a pagina
    # nova pedindo um script que da 404, e o menu novo abriria em branco.
    "acabamento.js",
    # O Quadro de Avisos (23/08/2026): a barra na base dos dois paineis e a aba
    # do ADM. Mesmo caso do acabamento.js -- o `index.html` que a estacao baixa
    # ja pede este script, e sem o nome aqui a estacao serviria a pagina nova
    # com um 404 no lugar da barra.
    "avisos.js",
    "cliente.js",
    # Os sete arquivos do Portal do Pedido (20/08/2026). A pagina do cliente
    # deixou de ser um funil de aprovacao e virou cinco secoes; cada uma mora no
    # seu arquivo, e a `cliente.html` carrega todos. Sem eles aqui, a estacao
    # serviria a pagina antiga -- ou daria 404 em sete scripts de uma vez.
    "cliente-dados.js",
    "cliente-shell.js",
    "cliente-confirmacoes.js",
    "cliente-entrega.js",
    "cliente-faturamento.js",
    "cliente-orcamento.js",
    "cliente-pagamento.js",
    # A logo da forma de envio, compartilhada entre o painel (coluna de frete da
    # lista de pedidos) e a aba de Entrega do Portal do Pedido, desde 20/08/2026.
    "logo-do-frete.js",
    "criador-arte.js",
    "cor-numeracao-do-modelo.js",
    "arte-de-impressao.js",
    "qr-canvas.js",
    # A conta do numero que cada pagina da visualizacao combinada mostra
    # (21/08/2026). O `index.html` e o `cliente.html` ja tem a tag <script>
    # apontando para ela: sem este nome aqui, a estacao serviria as duas
    # paginas pedindo um script que da 404, e o card do modelo pararia de
    # desenhar a numeracao.
    "numero-da-pagina.js",
    "qr-ideal-colunas.js",
    "qr-ideal-hash.js",
    "fonte-canvas.js",
    "fonte-nome.js",
    "csv-editor.js",
    "texto-ajuste.js",
    "foto-lib.js",
    "gerenciador-fotos.js",
    "editor-foto.js",
    "amostra-modal.js",
    "mapas.js",
    "supabase-config.js",
    "pdf-lib.min.js",
    # Vendorizados em 16/08/2026, quando sairam do CDN: sem eles aqui, a
    # estacao serviria uma tela que referencia arquivo que ela nao tem, e a
    # pagina abriria quebrada SO na maquina da grafica.
    "supabase-js.min.js",
    "qrcode-generator.min.js",
    # A camera entrou aqui pelo "+ Novo Evento" da casa do Ideal Control, que
    # em 17/08/2026 virou "Meus Pedidos" e deixou de ler QR. Nesta mesma data
    # saem da lista o `ler-qr.js` (o leitor do QR do Pedido) e o `instalar.js`
    # (o convite de instalar so aparecia no `evento.html`, que saiu junto) --
    # os dois arquivos foram apagados do disco.
    "jsqr.min.js",
    "portaria-camera.js",
    "sw-registro.js",
    "aparelho.js",
    # A tela nova do Ideal Control (v613): o `controle.js` se partiu em quatro
    # arquivos com uma responsabilidade cada -- o chaveiro dos portoes deste
    # aparelho, a lista de eventos da tela inicial, o toque que vira portao e a
    # parede que exige o aplicativo instalado. Os quatro entram juntos: um deles
    # de fora e a estacao servindo uma tela que referencia arquivo que ela nao
    # tem.
    "chaveiro.js",
    "lista-eventos.js",
    # O estado de espera de um botao (18/08/2026): texto trocado, disabled e
    # aria-busy enquanto uma chamada de rede corre. Sai junto com `conta.js`,
    # que e quem o usa primeiro -- e carrega ANTES dele no controle.html.
    "botao-espera.js",
    "conta.js",
    # O olho de mostrar/ocultar senha (18/08/2026), em cada campo de senha da
    # casa. Sai junto com `conta.js`: e o mesmo arquivo que o `controle.html`
    # carrega logo depois dele.
    "mostrar-senha.js",
    "virar-portao.js",
    "fila-presa.js",
    "caixa-confirmar.js",
    "menu-geral.js",
    "parede-pwa.js",
    # "Meus Pedidos" (17/08/2026): a barra que era "Novo Evento" deixou de
    # abrir a camera e passou a listar os pedidos ja impressos do cliente.
    "meus-pedidos.js",
    # A caixa do Carregar: a ficha da arte, a senha e a pergunta do aparelho.
    # Sai junto com o `meus-pedidos.js`, que e quem a abre -- um dos dois de
    # fora e a estacao servindo uma tela cujo botao nao faz nada.
    "carregar-pedido.js",
    # O deposito entra JUNTO com eles, embora seja da portaria: antes de trocar
    # de evento, o "virar portao" pergunta a ele quantas leituras ainda nao
    # subiram, e sem essa conta a troca perderia contagem que o cliente pagou
    # para ter. A tela inicial passou a carrega-lo por isso.
    "portaria-deposito.js",
    # A tela de leitura nova (v615). O aviso sonoro e o relogio de cinco
    # minutos moram em arquivos proprios porque sao responsabilidades
    # inteiramente separadas do resto da portaria -- e as duas trabalham
    # justamente quando nao ha rede.
    "aviso-sonoro.js",
    "portaria-sincronismo.js",
    "style.css",
]


# ─── Proxy de arquivos (/api/proxy) ───────────────────────────────────────────
# Usado como fallback para buscar PDFs quando o fetch direto falha por CORS.
# Na prática só aponta para o Storage do Supabase.
PROXY_ALLOWED_HOST_SUFFIXES = (".supabase.co", ".supabase.in")

# Legado do Firebase: 3 elementos em producao_numeracoes.elements[].pdf_content
# ainda apontam para o bucket antigo (numerações "87x54 - Amostra", "- Ovaide" e
# "- Registro") e os PDFs seguem online. Liberado apenas o bucket do projeto,
# não o host inteiro. Remover quando esses registros forem migrados.
PROXY_ALLOWED_LEGACY_PREFIXES = (
    "https://firebasestorage.googleapis.com/v0/b/ideal-arte-e64f6.firebasestorage.app/",
)


def is_allowed_proxy_url(url: str) -> bool:
    """Aceita http(s) do Storage do Supabase e o bucket legado do Firebase."""
    try:
        parsed = urlparse(url or "")
    except Exception:
        return False
    if parsed.scheme not in ("http", "https"):
        return False
    host = (parsed.hostname or "").lower()
    if any(host.endswith(suffix) for suffix in PROXY_ALLOWED_HOST_SUFFIXES):
        return True
    return (url or "").lower().startswith(PROXY_ALLOWED_LEGACY_PREFIXES)


# ─── Contexto de execução ─────────────────────────────────────────────────────
def is_cloud_runtime() -> bool:
    """True quando este `app.py` NÃO está rodando na estação da gráfica.

    Desde 17/08/2026 isto é sempre False em produção: não há mais cópia do
    `app.py` na nuvem, e o que era dela virou Edge Function. A função continua
    porque é um freio que falha para o lado seguro — se um dia alguém subir este
    arquivo num serviço hospedado, a auto-atualização e os caminhos que exigem a
    LAN da gráfica continuam desligados sem ninguém precisar lembrar.

    As variáveis conferidas são as que o antigo serviço definia sozinho. Não são
    nossas, e é isso que as torna difíceis de forjar por acidente.
    """
    return bool(os.environ.get("RENDER") or os.environ.get("RENDER_SERVICE_ID"))
