"""Entrada minima do preservador MSI; nao inicia servidor nem worker."""
import sys
from migracao_estacao import executar_upgrade

if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(1)
    # O atualizador legado nao conhece liberacao por estacao. O preflight do
    # pacote aplica essa barreira antes de modificar a instalacao antiga.
    try:
        from manifesto_oficial import consultar
        if not consultar()['liberado']:
            sys.exit(1)
    except Exception:
        sys.exit(1)
    resultado = executar_upgrade(sys.argv[1])
    if resultado == 0:
        try:
            from pathlib import Path
            from transicao_piloto import preparar as encerrar_piloto_ocioso
            encerrar_piloto_ocioso(Path(sys.argv[1]).parent)
            from perfil_oficial import preparar
            preparar(Path(sys.argv[1]).parent)
        except Exception:
            resultado = 1
    sys.exit(resultado)
