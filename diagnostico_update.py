"""Resumo MSI por lista positiva; nunca envia linhas, caminhos ou propriedades."""
from datetime import datetime, timezone
from pathlib import Path
import re
import stat

LIMITE = 256 * 1024
CODIGOS = {1303, 1304, 1310, 1311, 1321, 1402, 1603, 1618, 1638, 1721, 1722, 1920, 1923}
ACOES = {'PreservarDadosEstacao', 'RemoveExistingProducts', 'InstallFiles', 'InstallFinalize'}


def resumo(raiz, registro):
    """Le somente o final do log da tentativa falha; leitura limitada por heartbeat."""
    resultado = {'schema': 1, 'estado': 'nao_aplicavel'}
    if not isinstance(registro, dict) or registro.get('etapa') != 'instalacao_falhou':
        return resultado
    versao = registro.get('versao_alvo')
    if not isinstance(versao, str) or not re.fullmatch(r'[0-9]{1,5}(?:\.[0-9]{1,5}){2}', versao):
        return {**resultado, 'estado': 'registro_invalido'}
    try:
        quando = datetime.fromisoformat(registro['quando'].replace('Z', '+00:00'))
        if quando.tzinfo is None:
            raise ValueError()
        raiz = Path(raiz).absolute()
        arquivo = raiz / ('update-' + versao + '.log')
        # Recusa links/juncoes inclusive nos pais. Nenhum caminho vem da nuvem.
        for caminho in (arquivo, *arquivo.parents):
            info = caminho.lstat()
            if stat.S_ISLNK(info.st_mode) or getattr(info, 'st_file_attributes', 0) & 0x400:
                return {**resultado, 'estado': 'caminho_recusado'}
        info = arquivo.stat()
        if not stat.S_ISREG(info.st_mode):
            return {**resultado, 'estado': 'caminho_recusado'}
        # Nao atribuir um log antigo ou uma nova tentativa ao erro anterior.
        if abs(info.st_mtime - quando.timestamp()) > 300:
            return {**resultado, 'estado': 'log_de_outra_tentativa'}
        with arquivo.open('rb') as entrada:
            inicio = entrada.read(2)
            offset = max(0, info.st_size - LIMITE)
            offset -= offset % 2
            entrada.seek(offset)
            dados = entrada.read(LIMITE)
        encoding = 'utf-16-le' if inicio == b'\xff\xfe' else 'utf-16-be' if inicio == b'\xfe\xff' else 'utf-8'
        texto = dados.decode(encoding, errors='replace').lstrip('\ufeff')
        codigos = {int(c) for c in re.findall(r'(?im)^\s*(?:MSI[^\r\n]*?:\s*)?(?:Error|Erro)\s+([0-9]{4})\b', texto)}
        acoes = set(re.findall(r'(?im)^Action ended [^\r\n]*?: (\w+)\. Return value 3\.', texto))
        # 1722 pode nomear a acao sem produzir a linha Return value 3.
        acoes.update(re.findall(r'(?im)^\s*(?:MSI[^\r\n]*?:\s*)?(?:Error|Erro) 1722\.[^\r\n]*?\bAction (\w+)[, .]', texto))
        return {'schema': 1, 'estado': 'coletado', 'versao_alvo': versao,
                'tentativa_em': quando.astimezone(timezone.utc).isoformat(),
                'codigos_msi': sorted(codigos & CODIGOS),
                'acoes_falhas': sorted(acoes & ACOES),
                'retorno_3': bool(re.search(r'(?im)^Action ended [^\r\n]*Return value 3\.', texto)),
                'leitura_parcial': offset > 0,
                'causa_confirmada': False}
    except FileNotFoundError:
        return {**resultado, 'estado': 'log_ausente'}
    except (OSError, ValueError, TypeError, KeyError, OverflowError):
        return {**resultado, 'estado': 'leitura_indisponivel'}
