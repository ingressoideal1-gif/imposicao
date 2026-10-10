# GUSTAVO-PROD — entrada no NewProd Teste

Solicitação de 10/10/2026: incluir a estação Gustavo na versão de teste. Operador disponível para instalação por MSI. Base de produção preservada em origin/main 7d257be9 (Piloto 1.2.379).

Pacote separado: NewProdPiloto_Teste_v1.2.380.msi. ProductVersion Windows 1.2.380; agente informa 1.2.380-teste.1. Mesmo UpgradeCode, destino NewProd Agent, porta 9001 e preservador de configuração do Piloto. Não é instalação paralela. Fonte experimental vem da Junior Teste, com layout e carregamento da .379 e inicialização --background preservados. Não publicar estes arquivos de impressão no site ou no manifesto geral.

Inclui GDI atual, GDI otimizado e PDF direto, selecionados no modelo. Configurações do modelo preservadas. Testes experimentais não confirmam comercialmente o pedido como impresso. PDF direto continua dependente do suporte/configuração do RIP; bandejas mistas em RAW não são garantidas pelo teste. Não há fallback nem reenvio automático após falha.

Validado: 112 testes Python de impressão, destinos, planejamento, exclusão de produção e segurança; harness do modelo com três saídas, seis cenários do formulário experimental e regressão de horários. O primeiro ensaio de navegação identificou a ausência do link na página compacta; link incorporado e ensaio aprovado.

Distribuição: MSI separado com download integral e hash conferidos antes de retirar GUSTAVO-PROD dos manifestos normais. Demais estações e versão/hash do pacote estável devem permanecer idênticos. Junior continua fora do manifesto normal. O atualizador existente usa um único pacote; esta entrega por MSI não implementa atualização automática de versões de teste.

Instalação pelo operador: terminar os trabalhos ativos, sair do NewProd pelo ícone próximo ao relógio, executar o MSI na mesma conta Windows e abrir novamente. Conferir 1.2.380-teste.1 e as três saídas no modelo. Não excluir trabalhos do spool para liberar instalação. Em caso de recusa, guardar o log e verificar a condição indicada.

Recuperação: usar pacote compatível de versão MSI superior, mantendo dados/configuração; não forçar downgrade nem reinstalar a .379 sobre a .380. Para retornar ao canal normal, preparar versão superior e reautorizar a estação após verificação. Publicação ou heartbeat não comprova impressão física. Instalação da Gustavo e teste físico ainda exigem confirmação posterior.
