"""Rotação de metadados; nunca remove pacotes, objetos ou histórico de impressão."""
import json


class CatalogoCheio(ValueError):
    pass


def reservar_vaga(con, limite, protegidas):
    """Executado na transação IMMEDIATE da admissão, com as preparações travadas."""
    quantidade = con.execute('SELECT COUNT(*) FROM catalogo').fetchone()[0]
    if quantidade < limite:
        return
    protegidas = set(protegidas)
    digests = set()
    if con.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='revisoes_pedidos_piloto'").fetchone():
        # Não carregar snapshots inteiros (bancos de numeração podem ser grandes).
        for itens, pacotes in con.execute("SELECT json_extract(conteudo, '$.itens'), "
                                         "json_extract(conteudo, '$.pacotes') FROM revisoes_pedidos_piloto"):
            if itens is None or pacotes is None:
                raise ValueError('Referências locais incompletas; catálogo preservado.')
            for item in json.loads(itens):
                digests.add((item['modelo'], item['observacao']['digest']))
            for pacote in json.loads(pacotes):
                protegidas.add((pacote['modelo'], pacote['revisao']))
    candidatos = []
    # A última revisão admitida de cada modelo permanece no catálogo.
    for modelo, revisao, texto in con.execute('''
            SELECT c.modelo,c.revisao,c.conteudo FROM catalogo c
            WHERE EXISTS(SELECT 1 FROM catalogo n WHERE n.modelo=c.modelo AND n.rowid>c.rowid)
            ORDER BY c.rowid'''):
        registro = json.loads(texto)
        m = registro['manifesto']
        cfg = m['configuracao']
        if (cfg.get('tipo') != 'antecipacao_online'
                or (modelo, revisao) in protegidas
                or (modelo, cfg.get('observacao', {}).get('digest')) in digests):
            continue
        # Pacotes derivados continuam acessíveis e não são removidos.
        derivados = con.execute('SELECT manifesto FROM coletas WHERE modelo=? AND entrada=?',
                                (modelo, revisao)).fetchall()
        if any((modelo, json.loads(d[0])['revisao']) in protegidas for d in derivados):
            continue
        candidatos.append((modelo, revisao, texto))
        if len(candidatos) >= quantidade - limite + 1:
            break
    if len(candidatos) < quantidade - limite + 1:
        raise CatalogoCheio('Limite atingido: catálogo local cheio, sem revisão segura para arquivar.')
    for modelo, revisao, texto in candidatos:
        anterior = con.execute('SELECT conteudo FROM catalogo_arquivo WHERE modelo=? AND revisao=?',
                               (modelo, revisao)).fetchone()
        if anterior and json.loads(anterior[0])['manifesto'] != json.loads(texto)['manifesto']:
            raise ValueError('Revisão imutável.')
        con.execute('INSERT OR IGNORE INTO catalogo_arquivo VALUES (?,?,?)', (modelo, revisao, texto))
        con.execute('DELETE FROM catalogo WHERE modelo=? AND revisao=?', (modelo, revisao))
