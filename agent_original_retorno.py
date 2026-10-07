"""Entrada do pacote de retorno: canal original, sem atualizar para o Piloto."""
import multiprocessing
import os


def configurar():
    for nome in list(os.environ):
        if nome.startswith('NEWPROD_PILOTO_'):
            os.environ.pop(nome, None)
    os.environ['NEWPROD_CANAL'] = 'producao'
    os.environ['NEWPROD_RETORNO_ORIGINAL'] = '1'


if __name__ == '__main__':
    multiprocessing.freeze_support()
    configurar()
    import agent_tray
    agent_tray.main()
