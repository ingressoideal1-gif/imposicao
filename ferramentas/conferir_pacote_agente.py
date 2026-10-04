"""Recusa codigo legado ou dados privados nos artefatos publicos do NewProd."""
import argparse
from pathlib import Path
from PyInstaller.archive.readers import CArchiveReader


def conferir_exe(path, migrador=False):
    pacote = CArchiveReader(str(path))
    nomes = [n for n in pacote.toc if n.lower().endswith('.pyz')]
    if len(nomes) != 1:
        raise ValueError('Arquivo de modulos ausente ou ambiguo.')
    modulos = pacote.open_embedded_archive(nomes[0]).toc
    if 'coleta_autonoma' in modulos and 'win32timezone' not in modulos:
        raise ValueError('Executavel sem componente para conferir o spool do Windows.')
    if 'acesso_segredo' in modulos or any('qr_ideal_pool' in n.lower() for n in pacote.toc):
        raise ValueError('Dados privados detectados no executavel.')
    required = ('segredos_estacao', 'migracao_estacao') if migrador else ('autorizacao_local', 'segredos_estacao', 'migracao_estacao')
    for modulo in required:
        if modulo not in modulos:
            raise ValueError('Executavel sem protecao ou preservacao da estacao.')


def conferir_msi(path):
    import pythoncom
    import win32com.client
    installer = win32com.client.Dispatch('WindowsInstaller.Installer')
    database = installer.OpenDatabase(str(Path(path).resolve()), 0)
    query = database.OpenView('SELECT `FileName` FROM `File`')
    query.Execute(None)
    nomes = []
    while True:
        record = query.Fetch()
        if record is None:
            break
        nomes.append(record._oleobj_.Invoke(record._oleobj_.GetIDsOfNames('StringData'),
            0, pythoncom.DISPATCH_PROPERTYGET, True, 1).lower())
    query.Close()
    if any(any(secret in n for secret in ('qr_ideal_pool', 'acessos_locais', '.env', 'credencial-publicacao', 'acesso_segredo')) for n in nomes):
        raise ValueError('Arquivo privado detectado no MSI.')
    query = database.OpenView("SELECT `Action` FROM `CustomAction` WHERE `Action`='PreservarDadosEstacao'")
    query.Execute(None)
    if query.Fetch() is None:
        raise ValueError('MSI sem preservacao previa dos dados privados.')
    query.Close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--exe', required=True)
    parser.add_argument('--msi')
    parser.add_argument('--migrador')
    args = parser.parse_args()
    conferir_exe(args.exe)
    if args.migrador:
        conferir_exe(args.migrador, migrador=True)
    if args.msi:
        conferir_msi(args.msi)
    print('PACOTE_PUBLICO_CONFERIDO=sem arquivos privados ou modulo de segredo')
