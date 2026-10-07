"""NewProd Piloto oficial: entrada do upgrade, mantendo o caminho do atualizador."""
import multiprocessing
multiprocessing.freeze_support()
import os
os.environ['NEWPROD_CANAL'] = 'oficial'

if __name__ == '__main__':
    try:
        from perfil_oficial import configurar
        configurar()
        import agent_tray
        agent_tray.main()
    except Exception:
        import ctypes
        ctypes.windll.user32.MessageBoxW(None,
            'Nao foi possivel iniciar o NewProd Piloto oficial. Execute o instalador na conta Windows habitual e consulte o suporte.',
            'NewProd Piloto', 0x10)
        raise
