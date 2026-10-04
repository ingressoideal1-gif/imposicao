"""Consulta autenticada na nuvem; sessão fica apenas na requisição em memória."""
from datetime import datetime, timezone
import json
import urllib.request

from pacotes_download import SemRedirecionamento


class ConferenciaIndisponivel(ValueError):
    pass


class ConferidorPiloto:
    def __init__(self, host, *, abrir=None):
        self.url = 'https://' + host + '/functions/v1/piloto-local/conferir-sessao'
        self.abrir = abrir or urllib.request.build_opener(SemRedirecionamento()).open

    def __call__(self, item, authorization):
        if (not isinstance(authorization, str) or not authorization.startswith('Bearer ')
                or not authorization[7:].strip() or len(authorization) > 16384
                or any(c in authorization for c in '\r\n')):
            raise ConferenciaIndisponivel('Sessão online necessária para conferir a origem.')
        corpo = {k: item[k] for k in ('empresa', 'modelo', 'fontes')}
        corpo['digest'] = item['observacao']['digest']
        req = urllib.request.Request(self.url, data=json.dumps(corpo).encode(), method='POST',
            headers={'Content-Type': 'application/json', 'Authorization': authorization})
        try:
            with self.abrir(req, timeout=20) as resposta:
                if getattr(resposta, 'status', 200) != 200:
                    raise ValueError()
                conteudo = resposta.read(16385)
                if len(conteudo) > 16384:
                    raise ValueError()
                recibo = json.loads(conteudo)
            return self.validar(item, recibo)
        except Exception:
            raise ConferenciaIndisponivel('Origem não confirmada na nuvem; confira sessão e configuração do piloto.') from None

    @staticmethod
    def validar(item, recibo):
        try:
            if (not isinstance(recibo, dict) or recibo.get('empresa') != item['empresa']
                    or recibo.get('modelo') != item['modelo']
                    or recibo.get('digest') != item['observacao']['digest']
                    or recibo.get('aprovacao') != item['observacao']['aprovacao']
                    or recibo.get('execucao_offline') is not False
                    or recibo.get('aprovacao_versionada') is not False):
                raise ValueError()
            quando = datetime.fromisoformat(recibo['conferido_em'])
            if quando.tzinfo is None or abs((datetime.now(timezone.utc) - quando).total_seconds()) > 120:
                raise ValueError()
            return recibo['conferido_em']
        except Exception:
            # Nunca propagar corpo remoto, JWT ou detalhe da requisição.
            raise ConferenciaIndisponivel('Origem não confirmada na nuvem; confira sessão e configuração do piloto.') from None
