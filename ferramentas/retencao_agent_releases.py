"""Retencao restrita de MSIs: plano, backup local por 30 dias e exclusao conferida.

Nao importa db, nao carrega .env, nao compila e nao apaga backups locais.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import time
import urllib.request

PROJETO = 'https://vwbtitjlpelrcnsytzqw.supabase.co'
STORAGE = PROJETO + '/storage/v1'
BASE = STORAGE + '/object/public/agent-releases/'
FAMILIAS = ('NewProd_Setup', 'NewProdPiloto_Setup', 'NewProd_Original_Retorno',
            'NewProdPiloto_Oficial', 'NewProdPiloto_Teste')
MANIFESTOS = ('latest.json', 'newprod-piloto-oficial.json', 'newprod-piloto-teste.json')
PADRAO = re.compile(r'(' + '|'.join(map(re.escape, FAMILIAS)) + r')_v(\d+\.\d+\.\d+(?:\.\d+)?)\.msi')


def agora():
    return datetime.now(timezone.utc)


def gravar(path, dados):
    temporario = path.with_suffix(path.suffix + '.tmp')
    temporario.write_text(json.dumps(dados, ensure_ascii=False, indent=2), encoding='utf-8')
    temporario.replace(path)


def hash_arquivo(path):
    with path.open('rb') as arquivo:
        return hashlib.file_digest(arquivo, 'sha256').hexdigest()


def nome_manifesto(dados):
    url = dados.get('url', '')
    nome = url.removeprefix(BASE)
    if not url.startswith(BASE) or not PADRAO.fullmatch(nome):
        raise ValueError('Manifesto aponta para destino inesperado; nenhuma exclusao.')
    if not re.fullmatch('[0-9a-f]{64}', dados.get('sha256', '')):
        raise ValueError('Manifesto sem SHA-256 valido.')
    tamanho = dados.get('bytes', dados.get('size'))
    if type(tamanho) is not int or tamanho <= 0:
        raise ValueError('Manifesto sem tamanho valido.')
    return nome


def planejar(objetos, manifestos):
    if set(manifestos) != set(MANIFESTOS):
        raise ValueError('Os tres manifestos sao obrigatorios.')
    nomes = [r['name'] for r in objetos]
    if len(set(nomes)) != len(nomes):
        raise ValueError('Inventario duplicado; nenhuma exclusao.')
    protegidos = {nome_manifesto(m) for m in manifestos.values()}
    if not protegidos.issubset(nomes):
        raise ValueError('MSI referenciado ausente do inventario.')
    manter = set(protegidos)
    reconhecidos = set()
    for familia in FAMILIAS:
        grupo = []
        for r in objetos:
            m = PADRAO.fullmatch(r['name'])
            if m and m[1] == familia:
                if not r.get('id') or type((r.get('metadata') or {}).get('size')) is not int:
                    raise ValueError('MSI sem identidade/tamanho no Storage.')
                versao = tuple(map(int, m[2].split('.')))
                grupo.append((versao + (0,) * (4 - len(versao)), r['name']))
                reconhecidos.add(r['name'])
        # Empates numericos preservados; nunca desempatar removendo uma versao atual.
        versoes = sorted({v for v, _ in grupo}, reverse=True)[:3]
        manter.update(n for v, n in grupo if v in versoes)
    excluir = [r for r in objetos if r['name'] in reconhecidos - manter]
    return dict(schema=1, projeto=PROJETO, bucket='agent-releases', familias=list(FAMILIAS),
                criado_em=agora().isoformat(), manifestos=manifestos, inventario=objetos,
                preservar=sorted(set(nomes) - {r['name'] for r in excluir}), excluir=excluir,
                bytes_candidatos=sum(r['metadata']['size'] for r in excluir))


class Storage:
    def __init__(self, chave):
        if not chave:
            raise ValueError('SUPABASE_SERVICE_KEY ausente.')
        self.chave = chave

    def json(self, caminho, dados=None, method=None):
        headers = {'apikey': self.chave, 'Authorization': 'Bearer ' + self.chave,
                   'Content-Type': 'application/json', 'Cache-Control': 'no-cache'}
        req = urllib.request.Request(STORAGE + caminho, headers=headers, method=method,
                                     data=None if dados is None else json.dumps(dados).encode())
        with urllib.request.urlopen(req, timeout=60) as resposta:
            return json.load(resposta)

    def listar(self):
        objetos = []
        for offset in range(0, 100000, 1000):
            pagina = self.json('/object/list/agent-releases', dict(prefix='', limit=1000,
                               offset=offset, sortBy=dict(column='name', order='asc')))
            if not isinstance(pagina, list):
                raise ValueError('Inventario invalido.')
            objetos.extend(pagina)
            if len(pagina) < 1000:
                return objetos
        raise ValueError('Inventario excedeu limite seguro.')

    def manifestos(self):
        resultado = {}
        for nome in MANIFESTOS:
            req = urllib.request.Request(BASE + nome + '?retencao=' + str(time.time_ns()),
                                         headers={'Cache-Control': 'no-cache'})
            with urllib.request.urlopen(req, timeout=30) as resposta:
                raw = resposta.read(65537)
            if len(raw) > 65536:
                raise ValueError('Manifesto excede limite.')
            resultado[nome] = json.loads(raw)
            nome_manifesto(resultado[nome])
        return resultado

    def baixar(self, nome, destino=None):
        if not PADRAO.fullmatch(nome):
            raise ValueError('Download fora das familias autorizadas.')
        req = urllib.request.Request(BASE + nome, headers={'Cache-Control': 'no-cache'})
        h = hashlib.sha256()
        total = 0
        arquivo = destino.open('wb') if destino else None
        try:
            with urllib.request.urlopen(req, timeout=120) as resposta:
                while chunk := resposta.read(1024 * 1024):
                    h.update(chunk)
                    total += len(chunk)
                    if arquivo:
                        arquivo.write(chunk)
            if arquivo:
                arquivo.flush()
                os.fsync(arquivo.fileno())
        finally:
            if arquivo:
                arquivo.close()
        return dict(bytes=total, sha256=h.hexdigest())

    def excluir(self, nomes):
        if not nomes or any(not PADRAO.fullmatch(n) for n in nomes):
            raise ValueError('Exclusao fora das familias autorizadas.')
        return self.json('/object/agent-releases', {'prefixes': nomes}, method='DELETE')


def assinatura(objetos):
    # last_accessed_at muda durante o backup e nao identifica o conteudo.
    return {r['name']: (r.get('id'), r.get('updated_at'), r.get('metadata')) for r in objetos}


def conferir_estado(storage, plano, apagados=()):
    if storage.manifestos() != plano['manifestos']:
        raise ValueError('Manifestos mudaram; exclusao interrompida.')
    esperado = assinatura([r for r in plano['inventario'] if r['name'] not in apagados])
    if assinatura(storage.listar()) != esperado:
        raise ValueError('Inventario mudou; exclusao interrompida.')


def conferir_publicos(storage, manifestos):
    provas = {}
    for m in manifestos.values():
        nome = nome_manifesto(m)
        if nome not in provas:
            provas[nome] = storage.baixar(nome)
        if provas[nome] != dict(bytes=m.get('bytes', m.get('size')), sha256=m['sha256']):
            raise ValueError('Download do MSI referenciado diverge do manifesto.')
    return provas


def preparar(storage, raiz):
    raiz = Path(raiz).expanduser().resolve()
    if str(raiz).startswith(('\\\\', '//')):
        raise ValueError('Backup deve estar em disco local fora do Supabase.')
    raiz.mkdir(parents=True, exist_ok=True)
    plano = planejar(storage.listar(), storage.manifestos())
    if shutil.disk_usage(raiz).free < plano['bytes_candidatos'] + 1024**3:
        raise ValueError('Espaco local insuficiente para backup e margem de 1 GiB.')
    pasta = raiz / agora().strftime('%Y%m%dT%H%M%S%fZ')
    pasta.mkdir()
    (pasta / 'msi').mkdir()
    plano['guardar_ate'] = (agora() + timedelta(days=30)).isoformat()
    gravar(pasta / 'plano.json', plano)
    (pasta / 'candidatos.txt').write_text('\n'.join(r['name'] for r in plano['excluir']) + '\n', encoding='utf-8')
    print(f'PLANO={pasta} OBJETOS={len(plano["excluir"])} BYTES={plano["bytes_candidatos"]}', flush=True)
    return pasta


def backup(storage, pasta):
    pasta = Path(pasta).resolve()
    plano = json.loads((pasta / 'plano.json').read_text(encoding='utf-8'))
    conferir_estado(storage, plano)
    parcial_json = pasta / 'backup-parcial.json'
    provas = json.loads(parcial_json.read_text(encoding='utf-8')) if parcial_json.exists() else {}
    def copiar(r):
        nome = r['name']
        parcial = pasta / 'msi' / (nome + '.part')
        destino = pasta / 'msi' / nome
        anterior = provas.get(nome)
        if (anterior and destino.is_file() and destino.stat().st_size == r['metadata']['size']
                and anterior['bytes'] == r['metadata']['size'] and hash_arquivo(destino) == anterior['sha256']):
            return nome, anterior
        for tentativa in range(3):
            try:
                prova = storage.baixar(nome, parcial)
                break
            except (OSError, TimeoutError):
                if tentativa == 2:
                    raise
                time.sleep(2 * (tentativa + 1))
        if prova['bytes'] != r['metadata']['size'] or hash_arquivo(parcial) != prova['sha256']:
            raise ValueError('Backup divergente: ' + nome)
        parcial.replace(destino)
        return nome, prova
    with ThreadPoolExecutor(max_workers=8) as pool:
        pendentes = [pool.submit(copiar, r) for r in plano['excluir']]
        try:
            for futuro in as_completed(pendentes):
                nome, prova = futuro.result()
                provas[nome] = prova
                print(f'BACKUP {len(provas)}/{len(plano["excluir"])} {nome}', flush=True)
                gravar(parcial_json, provas)
        except Exception:
            for futuro in pendentes:
                futuro.cancel()
            raise
    conferir_estado(storage, plano)
    gravar(pasta / 'backup.json', provas)
    return provas


def executar(storage, pasta):
    pasta = Path(pasta).resolve()
    # Exclusao mutua entre processos desta maquina; falha fechada apos queda.
    trava = pasta.parent / '.retencao-em-execucao'
    try:
        fd = os.open(trava, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError:
        raise ValueError('Outra retencao iniciada; confira a trava local antes de retomar.') from None
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as arquivo:
            arquivo.write(str(pasta))
        return _executar(storage, pasta)
    finally:
        trava.unlink()


def _executar(storage, pasta):
    plano = json.loads((pasta / 'plano.json').read_text(encoding='utf-8'))
    # Recalcula o conjunto: um plano editado nao amplia a autorizacao.
    recalculado = planejar(plano['inventario'], plano['manifestos'])
    if plano['excluir'] != recalculado['excluir'] or plano['projeto'] != PROJETO or plano['bucket'] != 'agent-releases':
        raise ValueError('Plano fora da politica autorizada.')
    if (pasta / 'resultado.json').exists():
        raise ValueError('Execucao ja iniciada; revise o resultado antes de retomar.')
    provas = json.loads((pasta / 'backup.json').read_text(encoding='utf-8'))
    for r in plano['excluir']:
        nome = r['name']
        path = pasta / 'msi' / nome
        if (provas[nome]['bytes'] != r['metadata']['size'] or path.stat().st_size != provas[nome]['bytes']
                or hash_arquivo(path) != provas[nome]['sha256']):
            raise ValueError('Backup ausente ou alterado: ' + nome)
    conferir_estado(storage, plano)
    publicos = conferir_publicos(storage, plano['manifestos'])
    plano['guardar_ate'] = (agora() + timedelta(days=30)).isoformat()
    gravar(pasta / 'plano.json', plano)
    resultado = dict(apagados=[], bytes_liberados=0, completo=False, publicos_antes=publicos)
    gravar(pasta / 'resultado.json', resultado)
    for r in plano['excluir']:
        conferir_estado(storage, plano, resultado['apagados'])
        nome = r['name']
        # Grava intencao antes da chamada para reconciliar queda/timeout sem repetir cegamente.
        resultado['em_exclusao'] = nome
        gravar(pasta / 'resultado.json', resultado)
        resposta = storage.excluir([nome])
        if not isinstance(resposta, list) or [x.get('name') for x in resposta] != [nome]:
            raise ValueError('Storage nao confirmou exatamente o objeto; revisar resultado.')
        resultado['apagados'].append(nome)
        resultado['bytes_liberados'] += r['metadata']['size']
        resultado.pop('em_exclusao')
        gravar(pasta / 'resultado.json', resultado)
        print(f'APAGADO {len(resultado["apagados"])} {nome}', flush=True)
    conferir_estado(storage, plano, resultado['apagados'])
    resultado['publicos_depois'] = conferir_publicos(storage, plano['manifestos'])
    resultado.update(completo=True, concluido_em=agora().isoformat(), guardar_ate=plano['guardar_ate'])
    gravar(pasta / 'resultado.json', resultado)
    return resultado


def apos_publicacao(resultado):
    if not resultado.get('download_conferido') or not resultado.get('ativado'):
        raise ValueError('Retencao exige download e manifestos confirmados.')
    raiz = Path(os.environ.get('NEWPROD_RELEASE_BACKUP_DIR', str(Path.home() / 'NewProd-Release-Backups')))
    storage = Storage(os.environ.get('SUPABASE_SERVICE_KEY'))
    pasta = preparar(storage, raiz)
    backup(storage, pasta)
    return dict(pasta=str(pasta), **executar(storage, pasta))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('acao', choices=['preparar', 'backup', 'executar'])
    parser.add_argument('--pasta', type=Path, required=True)
    args = parser.parse_args()
    cliente = Storage(os.environ.get('SUPABASE_SERVICE_KEY'))
    if args.acao == 'preparar':
        preparar(cliente, args.pasta)
    elif args.acao == 'backup':
        backup(cliente, args.pasta)
    else:
        print(json.dumps(executar(cliente, args.pasta), ensure_ascii=False))
