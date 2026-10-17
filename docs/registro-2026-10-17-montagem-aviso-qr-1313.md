# Montagem: aviso global de catálogo QR Ideal

O carregamento global da Montagem podia emitir aviso de numeração desconhecida para pedidos ausentes dos snapshots locais. Consulta somente leitura em 17/10 confirmou: os modelos 1001090/1001190 do pedido 22241 não têm elemento QR_IDEAL; os modelos 1001859/1001959 do pedido 23063 têm contratos QR12 versão 2. As três numerações vinculadas estavam ausentes dos snapshots da estação.

A pedido do usuário, o toast de catálogo global incompleto deixa de aparecer quando a Montagem está ativa. A tela é conferida depois das operações assíncronas. A alteração não suprime colisões legadas confirmadas, contratos não confirmados ou verificações de geração/impressão. Não altera dados, numeração, QR12 ou reservas. Nas outras telas o aviso de catálogo continua ativo.

Base: NewProd 1.3.12, commit c1f273f4. Entrega preparada como 1.3.13, mantendo um único pacote operacional. Regressões: 35 verificações do alerta web/local, três testes de proteção do aviso e 267 verificações da tela da Montagem. Os perfis Produção, Piloto e Oficial passaram em 1055 testes Python, dois pulados e dois subtestes cada. Auditoria dos 375 arquivos do painel embutido e ausência de arquivos privados aprovada.

## Entrega concluída

MSI 1.3.13 instalado nesta estação com código 0. Executável e painel HTTP conferidos, configurações/acessos preservados, coleta retomada ao estado anterior. Backup cifrado com restauração verificada e executável anterior preservados antes da troca. Os três perfis concluíram os harnesses com sucesso.

O mesmo pacote foi publicado nos endereços oficial e legado e ambos os downloads completos conferiram por tamanho/SHA-256 antes de ativar os três manifestos, agora 1.3.13 sem restrições de estações. Evidência em `evidencias/newprod-1313-montagem-aviso-qr.json`. Fonte em `526261d4`, tag `agente-v1.3.13`. Não houve geração/impressão real, escrita de numeração ou liberação manual de contratos. Instalação em toda a frota ainda não foi comprovada. Esta entrega atualiza o painel do NewProd; não republicou o site Cloudflare.
