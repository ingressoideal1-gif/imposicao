# GDI experimental — entrega por blocos/folha (10/10/2026)

Corrigido capturar: trabalho_unico somente quando entregar_por_bloco e folha_a_folha estao desligados. Com qualquer uma ativa, usa entrega progressiva existente e endpoint experimental/submit; o primeiro bloco e enviado antes dos proximos chegarem. PDF RAW inalterado.

Folha a folha GDI: separacao estrita por folha fisica; simplex uma pagina, duplex pares frente/verso, ultima impar preservada. Reversa inverte folhas sem trocar frente/verso. Mantem nomes base para identificar bandeja de capa/miolo, opcoes capturadas e IDs de envio. PDF invalido/biblioteca ausente interrompe em vez de enviar o PDF inteiro silenciosamente.

Validacao: harness do navegador com os dois GDI em entrega progressiva (contagem de chamadas antes de finalizar), bandejas capa/miolo, PDFs reais de tres paginas nos modos simplex/duplex longo/curto e ordem reversa. Casos anteriores de tres modos, falha sem fallback e entrega normal passaram. Sintaxe JS e diff conferidos. Sem impressao real automatica.

Aplicado somente ao painel Junior .382: script.js e impressao-teste-modelo.js; cache dos dois HTML atualizado sem reintroduzir arte-de-impressao.js da correcao de cancelamento retirada. Hash dos arquivos locais e conteudo servido HTTP conferidos. Backup: %LOCALAPPDATA%/NewProd Recuperacao Experimental/20261010-161327-gdi-blocos. Executavel e API .382 compativeis e inalterados; nenhum MSI novo nem mudanca na LASER-01. Recarregar painel apos concluir trabalhos em andamento. Instalacao nao comprova impressao fisica.
