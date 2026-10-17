"""Publica o mesmo MSI nos aliases historicos e libera todas as estacoes."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sys
import time
import urllib.request

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ferramentas.publicar_pacote_oficial import conferir_upload, requisicao
from manifesto_oficial import BASE, validar


def publicar(msi):
    msi = Path(msi).resolve(strict=True)
    versao = msi.stem.removeprefix('NewProdPiloto_Oficial_v')
    dados = msi.read_bytes()
    manifesto = dict(schema=1, produto='NewProdPilotoOficial', version=versao,
        url=BASE + msi.name, sha256=hashlib.sha256(dados).hexdigest(),
        bytes=len(dados), size=len(dados),
        notes='NewProd unico: Montagem com filtros por setor, Textil padrao e sugestao de uma folha com composicao e repeticoes. Disponivel para todas as estacoes.')
    validar(manifesto)
    teste = {**manifesto, 'produto': 'NewProdPilotoTeste',
        'url': BASE + 'NewProdPiloto_Teste_v' + versao + '.msi'}
    destinos = {'newprod-piloto-oficial.json': manifesto, 'latest.json': manifesto,
        'newprod-piloto-teste.json': teste}
    anteriores = {}
    for nome in destinos:
        with requisicao(BASE + nome + '?t=' + str(time.time_ns())) as r:
            anterior = json.load(r)
        if tuple(map(int, anterior['version'].split('.'))) > tuple(map(int, versao.split('.'))):
            raise ValueError('Manifesto mais recente; publicacao interrompida.')
        anteriores[nome] = anterior
    prova = msi.parent / ('publicacao-unica-' + versao + '-' + str(time.time_ns()))
    prova.mkdir()
    (prova / 'manifestos-anteriores.json').write_text(json.dumps(anteriores, indent=2), encoding='utf8')
    chave = os.environ.get('SUPABASE_SERVICE_KEY')
    if not chave:
        req = urllib.request.Request(
            'https://api.supabase.com/v1/projects/vwbtitjlpelrcnsytzqw/api-keys',
            headers={'Authorization': 'Bearer ' + os.environ['SUPABASE_ACCESS_TOKEN']})
        with urllib.request.urlopen(req, timeout=30) as r:
            chaves = json.load(r)
        chave = next(c['api_key'] for c in chaves if c['name'] == 'service_role')
    # Ambos os nomes apontam para bytes identicos. Nenhum manifesto e ativado
    # antes dos dois downloads publicos completos passarem por hash e tamanho.
    for item in (manifesto, teste):
        conferir_upload(msi, item, dados, chave)
    (prova / 'downloads-conferidos.json').write_text(json.dumps(
        {'oficial': manifesto, 'alias_legado': teste}, indent=2), encoding='utf8')
    for nome, item in destinos.items():
        # Recusa sobrescrever uma publicacao concorrente.
        with requisicao(BASE + nome + '?t=' + str(time.time_ns())) as r:
            atual = json.load(r)
        if atual != anteriores[nome]:
            raise ValueError('Manifesto alterado por outra publicacao: ' + nome)
        with requisicao((BASE + nome).replace('/object/public/', '/object/'),
                dados=json.dumps(item).encode(), chave=chave, substituir=True) as r:
            r.read()
        with requisicao(BASE + nome + '?t=' + str(time.time_ns())) as r:
            confirmado = json.load(r)
        if confirmado != item or 'estacoes' in confirmado:
            raise ValueError('Manifesto divergente: ' + nome)
        print(nome + ': ' + versao + ' liberada para todas as estacoes', flush=True)
    (prova / 'publicacao-confirmada.json').write_text(json.dumps(destinos, indent=2), encoding='utf8')
    return destinos


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--msi', required=True)
    args = parser.parse_args()
    publicar(args.msi)
