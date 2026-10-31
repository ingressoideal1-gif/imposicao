# Abertura automática e troca de PDF — 31/10/2026

Decisões confirmadas: CDR já aberto é apenas ativado, preservando edições sem salvar. Disco igual à nuvem abre local; somente nuvem baixa; nenhum dos dois cria pelo PDF atual. Local sem remoto abre local. Popup somente quando SHA-256 local difere do recibo remoto validado. Nuvem indisponível com local abre somente o disco; sem local não interpretar indisponibilidade como ausência e não recriar pelo PDF.

Popup recebe título Versões diferentes do documento. Hash remoto consultado sem baixar o CDR; leitura dos bytes ocorre somente quando a origem selecionada é Drive. Recibo do mesmo ID pode avançar para nova revisão verificada, preservando vínculo de identidade.

Troca manual do PDF: ao abrir documento fechado, compara vínculo anterior por face, prepara PDFs das páginas afetadas e importa todas as novas artes antes de retirar as anteriores. Salva backup antes da operação. Camadas de cor, numeração/picote, observações e mapa são preservadas. Outros modelos e faces permanecem intactos. Hash dos PDFs exportados pela Ponte impede reimportar o próprio PDF publicado como se fosse nova arte manual. Após troca, sincroniza CDR ao Drive, mantendo pendência local se o envio falhar. Documento aberto é apenas ativado; a troca ocorre na próxima abertura com ele fechado.

Compatibilidade: os dados de origem e hashes são gravados dentro de reference, campo aceito pelo serviço atual, sem alterar o contrato remoto. Recuperações antigas sem baseline não permitem saber se um PDF foi trocado antes desta atualização; a primeira abertura estabelece referência sem presumir substituição. Comparação automática identifica troca de URL de arte; arquivos sobrescritos externamente na mesma URL não são inferidos como troca.

Arquivos: ponte_imposition/corel_service.py, corel_sources.py (novo), corel_adapter.py, remote_drive.py; tests/test_corel_opening.py (novo), test_ponte_remote_drive.py, prova_corel_substituicao.py (novo). Frontend do popup em ../imposition-corel-exclusao-20261031/frontend/tracedraw-runtime.js. Preservadas correções locais anteriores de exclusão e destaque das observações.

Validação: 62 testes Python aprovados; harnesses de transporte e integração aprovados; sintaxe JS e diff conferidos. Prova real sintética CorelDRAW: contagens [2,0,1] após trocar uma página, limpar uma segunda e preservar a terceira; referências protegidas, PDF confirmado e backup criado. Somente documentos sintéticos foram fechados. Nenhuma arte oficial, arquivo remoto ou estação atualizada nesta tarefa.

Pendente: empacotar/publicar nova Ponte e frontend juntos, incluindo correções de exclusão e observações. Instalador público 1.8.0 não contém estas alterações. Não reutilizar frontend antigo do checkout operacional sujo: a fonte web preparada está no checkout de exclusão. Código completo da Ponte permanece no checkout imposition-coreldraw-20261030.
