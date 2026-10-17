# Montagem: aviso global de catálogo QR Ideal

O carregamento global da Montagem podia emitir aviso de numeração desconhecida para pedidos ausentes dos snapshots locais. Consulta somente leitura em 17/10 confirmou: os modelos 1001090/1001190 do pedido 22241 não têm elemento QR_IDEAL; os modelos 1001859/1001959 do pedido 23063 têm contratos QR12 versão 2. As três numerações vinculadas estavam ausentes dos snapshots da estação.

A pedido do usuário, o toast de catálogo global incompleto deixa de aparecer quando a Montagem está ativa. A tela é conferida depois das operações assíncronas. A alteração não suprime colisões legadas confirmadas, contratos não confirmados ou verificações de geração/impressão. Não altera dados, numeração, QR12 ou reservas. Nas outras telas o aviso de catálogo continua ativo.

Base: NewProd 1.3.12, commit c1f273f4. Entrega preparada como 1.3.13, mantendo um único pacote operacional. Regressões: 35 verificações do alerta web/local, três testes de proteção do aviso e 267 verificações da tela da Montagem. Os perfis Produção, Piloto e Oficial passaram em 1055 testes Python, dois pulados e dois subtestes cada. Auditoria dos 375 arquivos do painel embutido e ausência de arquivos privados aprovada.
