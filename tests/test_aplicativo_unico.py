# -*- coding: utf-8 -*-
"""O aplicativo unico: as tres telas do cliente e do portao numa pagina so.

O que estes testes protegem: que a pagina ABRA SEM REDE (nenhum arquivo de
fora), que o roteador leve cada QR a tela certa, e que o endereco que ja circula
por WhatsApp continue valendo.
"""

import os
import re

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRENTE = os.path.join(RAIZ, "frontend")

# `app.html` entra aqui na Tarefa 3, quando nascer. A lista e explicita, e nao
# "todo html que existir", para que apagar uma tela por engano quebre o teste em
# vez de passar em silencio.
PAGINAS_DO_APLICATIVO = ("controle.html", "evento.html", "portaria.html")


def _ler(caminho):
    with open(os.path.join(RAIZ, caminho), encoding="utf-8") as f:
        return f.read()


def test_nenhuma_tela_do_aplicativo_carrega_arquivo_de_fora():
    """A regra que a portaria ja tinha, valendo para o aplicativo inteiro.

    Um `<script>` de outra origem que nao carrega derruba a pagina -- e cache
    nao salva, porque resposta de outra origem e opaca. Fora isso, buscar o
    codigo de autenticacao num terceiro significa que quem controlar aquele
    endereco controla o portao.
    """
    for nome in PAGINAS_DO_APLICATIVO:
        html = _ler("frontend/" + nome)
        externos = re.findall(
            r'<(?:script|link|img)[^>]+(?:src|href)=["\'](?:https?:)?//[^"\']+',
            html, flags=re.IGNORECASE)
        assert not externos, nome + " carrega arquivo de fora: " + str(externos)


def test_o_sdk_e_o_gerador_de_qr_sao_servidos_daqui():
    for nome in ("supabase-js.min.js", "qrcode-generator.min.js"):
        caminho = os.path.join(FRENTE, nome)
        assert os.path.exists(caminho), nome + " nao foi vendorizado"
        # Arquivo pequeno demais quase sempre e uma pagina de erro do CDN salva
        # com nome de script -- e ela "carrega" sem erro nenhum no navegador.
        assert os.path.getsize(caminho) > 3000, nome + " veio vazio ou truncado"


def test_a_estacao_sincroniza_os_arquivos_novos():
    """Sem isto, a estacao serve uma tela que referencia arquivo que ela nao
    tem -- e a pagina abre quebrada so na maquina da grafica."""
    import security_config

    for nome in ("supabase-js.min.js", "qrcode-generator.min.js"):
        assert nome in security_config.PAINEL_ARQUIVOS, nome
