"""Perfil do produto oficial. Mantem identidade/credenciais e reutiliza dados do Piloto.

Nao importa app/worker, nao imprime e nao acessa a nuvem. Configuracoes sao
preparadas antes da troca pelo instalador; a partida apenas configura o ambiente.
"""
import json
import os
from pathlib import Path
import socket


def conferir_processos(base):
    import win32api
    import win32con
    import win32process
    with socket.socket() as teste:
        teste.settimeout(1)
        if teste.connect_ex(('127.0.0.1',9001)) == 0:
            raise ValueError('Painel anterior ainda ativo; encerre antes de migrar.')
    raizes = [str(base / nome).casefold() + os.sep for nome in ('NewProd Agent','NewProd Piloto')]
    for pid in win32process.EnumProcesses():
        if not pid or pid == os.getpid():
            continue
        handle = None
        try:
            handle = win32api.OpenProcess(win32con.PROCESS_QUERY_INFORMATION | win32con.PROCESS_VM_READ, False, pid)
            caminho = win32process.GetModuleFileNameEx(handle, 0).casefold()
        except Exception:
            continue  # Outros usuarios/SYSTEM nao sao alvos desta instalacao per-user.
        finally:
            if handle: handle.Close()
        if (Path(caminho).name in ('newprod.exe','newprodpiloto.exe')
                and any(caminho.startswith(r) for r in raizes)):
            raise ValueError('Encerre os agentes desta conta antes de migrar; nenhuma fila foi alterada.')


def preparar(base, *, conferir=conferir_processos, backup=None):
    from piloto_instalacao import sem_links, sha, CONFIGURACOES, copiar_conferido
    from persistencia_local import gravar_json_atomico
    from backup_gestao import executar
    base = sem_links(base)
    raiz = sem_links(base / 'NewProd Agent')
    piloto = sem_links(base / 'NewProd Piloto')
    marcador = sem_links(raiz / 'perfil-oficial.json')
    conferir(base)
    if marcador.exists():
        perfil = json.loads(marcador.read_text(encoding='utf-8'))
        if (perfil.get('schema') != 1 or perfil.get('estacao') != socket.gethostname()
                or perfil.get('dados') not in ('NewProd Agent/dados', 'NewProd Piloto/dados')):
            raise ValueError('Perfil oficial divergente.')
        backup = backup or executar
        backup(raiz, raiz)
        if perfil['dados'] == 'NewProd Piloto/dados':
            backup(piloto, raiz)
        return perfil
    backup = backup or executar
    origem = raiz
    dados = 'NewProd Agent/dados'
    ativa = piloto / 'versao-ativa.json'
    if ativa.is_file():
        ativo = json.loads(ativa.read_text(encoding='utf-8-sig'))
        relativo = Path(ativo['executavel'])
        if relativo.is_absolute() or '..' in relativo.parts:
            raise ValueError('Runtime do Piloto fora da instalacao.')
        exe = sem_links(piloto / relativo)
        if exe.name != 'NewProdPiloto.exe' or not exe.is_relative_to(piloto / 'versoes') or sha(exe) != ativo['sha256']:
            raise ValueError('Runtime anterior divergente; dados preservados.')
        origem = exe.parent
        backup(piloto, origem)
        dados = 'NewProd Piloto/dados'
    raiz.mkdir(parents=True, exist_ok=True)
    backup(raiz, raiz)
    # Perfis mantem o caminho relativo usado pelos mapas. Recusar colisao antes
    # de alterar configuracao; nunca substituir um perfil diferente silenciosamente.
    adicionais = []
    if origem != raiz:
        for nome in ('perfis_icc', 'ppds'):
            pasta = sem_links(origem / nome)
            if pasta.is_dir():
                for fonte in pasta.rglob('*'):
                    sem_links(fonte)
                    if fonte.is_file():
                        alvo = sem_links(raiz / fonte.relative_to(origem))
                        if alvo.exists() and sha(alvo) != sha(fonte):
                            raise ValueError('Perfil de impressao divergente; migracao recusada.')
                        adicionais.append((fonte, alvo))
        for fonte, alvo in adicionais:
            alvo.parent.mkdir(parents=True, exist_ok=True)
            copiar_conferido(fonte, alvo)
    antes = {}
    try:
        if origem != raiz:
            for nome in (*CONFIGURACOES, 'printer_icc_map.json', 'printer_ppd_map.json'):
                fonte, alvo = sem_links(origem / nome), sem_links(raiz / nome)
                if not fonte.is_file(): continue
                # Validar antes de substituir; nao importar configuracao corrompida.
                conteudo = json.loads(fonte.read_text(encoding='utf-8-sig'))
                antes[alvo] = alvo.read_bytes() if alvo.is_file() else None
                gravar_json_atomico(alvo, conteudo)
        perfil = dict(schema=1, estacao=socket.gethostname(), dados=dados,
                      produto='NewProd Piloto', identidade='NewProd Agent/agent_config.json')
        gravar_json_atomico(marcador, perfil)
    except BaseException:
        for alvo, conteudo in antes.items():
            if conteudo is None:
                alvo.unlink(missing_ok=True)  # Apenas copia nova criada nesta transacao.
            else:
                alvo.write_bytes(conteudo)
        raise
    return perfil


def configurar(base=None):
    from piloto_instalacao import sem_links, token_local
    base = sem_links(base or os.environ['LOCALAPPDATA'])
    raiz = sem_links(base / 'NewProd Agent')
    marcador = sem_links(raiz / 'perfil-oficial.json')
    if not marcador.is_file():
        raise ValueError('Migracao para o produto oficial nao preparada; execute o instalador.')
    perfil = json.loads(marcador.read_text(encoding='utf-8'))
    if perfil.get('schema') != 1 or perfil.get('estacao') != socket.gethostname():
        raise ValueError('Perfil oficial pertence a outra estacao.')
    relativo = perfil.get('dados')
    if relativo not in ('NewProd Agent/dados', 'NewProd Piloto/dados'):
        raise ValueError('Raiz de dados oficial invalida.')
    dados = sem_links(base / relativo)
    os.environ.update(NEWPROD_CANAL='oficial', NEWPROD_PILOTO_LOCAL='1',
        NEWPROD_PILOTO_AUTONOMO='1', NEWPROD_PILOTO_EMPRESA='Ingresso Ideal',
        NEWPROD_PILOTO_ESTACAO=socket.gethostname(), NEWPROD_PILOTO_RAIZ=str(dados),
        NEWPROD_PILOTO_TOKEN=token_local(raiz))
    # A pausa e persistida no catalogo; nao resetar a escolha a cada atualizacao.
    os.environ.pop('NEWPROD_PILOTO_PAUSADO', None)
    return perfil


def confirmar_partida():
    """Retira somente entradas conhecidas do Piloto antigo apos validar HTTP."""
    import winreg
    from persistencia_local import gravar_json_atomico
    from gestao_estacoes import agora
    from agent_version import AGENT_VERSION
    from agent_worker import ultimo_update, _registrar_update
    base = Path(os.environ['LOCALAPPDATA'])
    permitida = str(base / 'NewProd Piloto').casefold()
    removidas = []
    with winreg.OpenKey(winreg.HKEY_CURRENT_USER,
            r'Software\Microsoft\Windows\CurrentVersion\Run', 0,
            winreg.KEY_QUERY_VALUE | winreg.KEY_SET_VALUE) as key:
        for nome in ('NewProdPiloto','NewProdPilotoMSI'):
            try: valor, _ = winreg.QueryValueEx(key, nome)
            except FileNotFoundError: continue
            if permitida in str(valor).casefold():
                from segredos_estacao import proteger_texto
                # Guarda recuperavel da configuracao de startup antes de retirar.
                backup = base / 'NewProd Agent' / ('startup-anterior-' + nome + '.dpapi.json')
                if not backup.exists():
                    gravar_json_atomico(backup, proteger_texto(str(valor), 'transicao-startup'))
                winreg.DeleteValue(key, nome)
                removidas.append(nome)
    gravar_json_atomico(base / 'NewProd Agent' / 'oficial-validado.json',
                       dict(versao=AGENT_VERSION, quando=agora(), painel_validado=True,
                            inicializacoes_anteriores_removidas=removidas))
    anterior = ultimo_update()
    if anterior.get('etapa') == 'instalando':
        etapa = 'validado' if anterior.get('versao_alvo') == AGENT_VERSION else 'instalacao_nao_confirmada'
        _registrar_update(etapa, versao_alvo=anterior.get('versao_alvo'))
