"""Entrada minima do preservador MSI; nao inicia servidor nem worker."""
import sys
from migracao_estacao import executar_upgrade

if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(1)
    sys.exit(executar_upgrade(sys.argv[1]))
