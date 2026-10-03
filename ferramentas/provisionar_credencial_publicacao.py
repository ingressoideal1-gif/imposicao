"""Provisionamento explicito, local e protegido; nao executa o modulo legado."""
import argparse
import ast
import dis
import json
import os
from pathlib import Path
import tempfile

from segredos_estacao import proteger_texto, recuperar_texto


def credencial_do_bytecode(codigo):
    instrucoes = list(dis.get_instructions(codigo))
    valores = [instrucoes[i - 1].argval for i, n in enumerate(instrucoes)
               if i > 0 and n.opname == 'STORE_NAME' and n.argval == 'SEGREDO'
               and instrucoes[i - 1].opname == 'LOAD_CONST']
    if len(valores) != 1 or not isinstance(valores[0], str) or not valores[0]:
        raise ValueError('Modulo legado nao contem uma credencial literal valida.')
    return valores[0]


def credencial_legada(origem):
    if origem.suffix.lower() == '.exe':
        from PyInstaller.archive.readers import CArchiveReader
        pacote = CArchiveReader(str(origem))
        nomes = [n for n in pacote.toc if n.lower().endswith('.pyz')]
        if len(nomes) != 1:
            raise ValueError('Arquivo instalado nao contem o pacote esperado.')
        # Extrai somente o modulo esperado, sem executar bytecode ou o agente.
        codigo = pacote.open_embedded_archive(nomes[0]).extract('acesso_segredo')
        return credencial_do_bytecode(codigo)
    arvore = ast.parse(origem.read_text(encoding='utf-8-sig'))
    valores = [ast.literal_eval(n.value) for n in arvore.body if isinstance(n, ast.Assign)
               and any(isinstance(t, ast.Name) and t.id == 'SEGREDO' for t in n.targets)]
    if len(valores) != 1 or not isinstance(valores[0], str) or not valores[0]:
        raise ValueError('Modulo legado nao contem uma credencial literal valida.')
    return valores[0]


def provisionar(origem, destino):
    origem, destino = Path(origem), Path(destino)
    if destino.exists():
        raise FileExistsError('Credencial existente preservada.')
    valor = credencial_legada(origem)
    envelope = proteger_texto(valor, 'publicacao-faixas')
    if recuperar_texto(envelope, 'publicacao-faixas') != valor:
        raise ValueError('Falha na verificacao da protecao Windows.')
    descritor, temporario = tempfile.mkstemp(prefix='.credencial-', dir=destino.parent)
    try:
        with os.fdopen(descritor, 'w', encoding='utf-8') as arquivo:
            json.dump(envelope, arquivo)
            arquivo.flush()
            os.fsync(arquivo.fileno())
        os.link(temporario, destino)
    finally:
        Path(temporario).unlink(missing_ok=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--origem', required=True)
    parser.add_argument('--destino', required=True)
    args = parser.parse_args()
    provisionar(args.origem, args.destino)
    print('Credencial provisionada com DPAPI e recuperacao conferida; nenhum valor exposto.')
