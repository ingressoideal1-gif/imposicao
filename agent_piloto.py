"""Entrada exclusiva do Piloto. O instalador padrao nao usa este arquivo."""
import multiprocessing
multiprocessing.freeze_support()
import os
os.environ['NEWPROD_CANAL'] = 'piloto'
os.environ['NEWPROD_PILOTO_LOCAL'] = '1'
import agent_tray

if __name__ == '__main__':
    agent_tray.main()
