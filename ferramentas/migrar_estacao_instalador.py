"""Entrada minima do preservador MSI; nao inicia servidor nem worker."""
import sys
from retorno_original import preparar

if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(1)
    try:
        sys.exit(preparar(sys.argv[1]))
    except Exception as erro:
        import ctypes
        # Somente mensagens de validacao conhecidas; bibliotecas podem conter dados.
        mensagem = str(erro) if isinstance(erro, ValueError) else 'Nao foi possivel conferir a fila ou preservar os dados. A instalacao foi cancelada.'
        ctypes.windll.user32.MessageBoxW(0, mensagem, 'Retorno ao NewProd Original', 0x10)
        sys.exit(1)
