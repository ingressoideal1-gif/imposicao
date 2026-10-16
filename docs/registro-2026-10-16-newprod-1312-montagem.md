# NewProd 1.3.12: Montagem no painel local

Base: agente-v1.3.11 (48e294fb). A estação estava na 1.3.11, com Montagem v1065; a entrega web v1071 não atualizou o painel embutido. Incorporadas as alterações da Montagem: amostras, informações e ações laterais, confirmação de impressão e Hot Folder. Preservadas as adaptações locais de snapshots, conferência e carga completa de pedidos, o Dashboard e Produção por Cor.

Instalação local autorizada e concluída com MSI exit 0. Executável instalado conferido com o build; API da porta 9001 informa NewProd 1.3.12. Configurações e conteúdo dos acessos protegidos conferidos; backups cifrados com restauração verificada precederam a troca. Fila Windows vazia. Pausa anterior da coleta restaurada.

Validações: 1055 testes Python aprovados, dois pulados e dois subtestes aprovados em cada perfil Produção, Piloto e Oficial, com os harnesses previstos. Montagem: 267 verificações de navegador e 3586 do núcleo. Dashboard: cálculo e navegador aprovados. Auditoria dos 375 arquivos do painel embutido e ausência de arquivos privados no MSI aprovada.

Evidência: evidencias/newprod-1312-instalacao-montagem.json. A resposta HTML local inclui as intervenções esperadas dos middlewares do NewProd; o arquivo instalado e os imports atualizados foram conferidos, assim como os bytes JS/CSS servidos via HTTP. Não houve geração real ou impressão física como teste. Nenhum manifesto público ou MSI remoto foi alterado nesta instalação.

Recuperação: executável anterior e recibo privado em NewProd Agent/gestao/backups, com nome executavel-antes-montagem-1312.exe e instalacao-montagem-1312.json. Não forçar downgrade MSI; uma entrega distribuída deve preservar a fonte instalada e usar versão superior se necessário.
