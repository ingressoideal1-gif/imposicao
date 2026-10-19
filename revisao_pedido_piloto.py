"""Cache privado de revisoes completas, com revalidacao quando ha conexao."""
from datetime import datetime, timezone
import json
import re

from conferencia_piloto import ConferenciaIndisponivel


def validar_recibo(dados, empresa, pedido, anterior):
    codigo = 'revisao_invalida'
    try:
        if (not isinstance(dados, dict) or dados.get('empresa') != empresa or dados.get('pedido') != pedido
                or not re.fullmatch('[a-f0-9]{64}', dados.get('revisao', ''))
                or type(dados.get('sem_mudanca')) is not bool
                or dados['sem_mudanca'] != (dados['revisao'] == anterior)
                or dados.get('execucao_offline') is not False):
            raise ValueError()
        quando = datetime.fromisoformat(dados['conferido_em'])
        if quando.tzinfo is None or abs((datetime.now(timezone.utc)-quando).total_seconds()) > 120:
            codigo = 'relogio_divergente'
            raise ValueError()
        if not dados['sem_mudanca'] and (not isinstance(dados.get('itens'), list) or len(dados['itens']) > 128):
            raise ValueError()
    except (ValueError, TypeError, KeyError) as erro:
        from diagnostico_estacao import registrar
        falha = ConferenciaIndisponivel('Revisao do pedido nao confirmada na nuvem.')
        falha.diagnostico_id = registrar(erro, codigo, 'recibo', pedido=pedido)
        raise falha from None
    return dados


class CacheRevisaoPedido:
    def __init__(self, servico):
        self.servico = servico
        con = servico._db()
        try:
            con.execute('CREATE TABLE IF NOT EXISTS revisoes_pedidos_piloto ('
                        'pedido TEXT PRIMARY KEY, conteudo TEXT NOT NULL)')
            con.commit()
        finally:
            con.close()

    def obter(self, pedido):
        con = self.servico._db()
        try:
            row = con.execute('SELECT conteudo FROM revisoes_pedidos_piloto WHERE pedido=?', (pedido,)).fetchone()
            return json.loads(row[0]) if row else None
        finally:
            con.close()

    def salvar(self, pedido, revisao, itens, pacotes, snapshot=None):
        registro = {'empresa':self.servico.empresa,'pedido':pedido,'revisao':revisao,'itens':itens,'pacotes':pacotes}
        registro['fontes_gabarito'] = 1
        registro['conferido_em'] = datetime.now(timezone.utc).isoformat()
        if snapshot is not None:
            registro.update(protocolo=2, snapshot=snapshot, offline_schema=1)
        con = self.servico._db()
        try:
            con.execute('INSERT OR REPLACE INTO revisoes_pedidos_piloto VALUES (?,?)',
                        (pedido,json.dumps(registro,ensure_ascii=False)))
            con.commit()
        finally:
            con.close()

    def bloquear_offline(self, pedido):
        # Preserva a copia anterior, mas uma revisao ja invalidada pela nuvem
        # nao pode voltar a ser usada porque a conexao caiu durante a atualizacao.
        registro = self.obter(pedido)
        if registro is None:
            return
        registro['offline_bloqueado'] = True
        con = self.servico._db()
        try:
            con.execute('UPDATE revisoes_pedidos_piloto SET conteudo=? WHERE pedido=?',
                        (json.dumps(registro, ensure_ascii=False), pedido))
            con.commit()
        finally:
            con.close()


def versoes_confiaveis(item):
    versoes = item.get('versoes_fontes')
    return (isinstance(versoes, dict) and set(versoes) == set(item['fontes'])
            and all(isinstance(v, dict) and set(v) == {'revisao','etag'}
                    and re.fullmatch('[a-f0-9]{64}', v.get('revisao',''))
                    and isinstance(v.get('etag'), str) and 1 <= len(v['etag']) <= 1024
                    and all(32 <= ord(c) < 127 for c in v['etag']) for v in versoes.values()))
