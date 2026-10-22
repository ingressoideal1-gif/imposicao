# Entrega segura — refazer intervalo entre sets — 22/10/2026

## Publicação conferida

- Web v1100: PR #193, merge `ad0c39f6abf056e6f2a4aa7ecdf7089e7634c013`; Cloudflare Pages concluiu com sucesso. Seis arquivos normalizados conferidos com cache-buster em cada domínio (`imposition.ai-ideal.com.br` e `imposicao.pages.dev`): index, producao, cliente, controle, pedido.js e arte-de-impressao.js.
- NewProd 1.3.32: fonte `ed74018c`, tag `agente-v1.3.32`; base publicada 1.3.31 preservada. Não houve cópia integral de frontend antigo para a branch principal.
- MSI: ProductVersion 1.3.32, 196784128 bytes, SHA-256 `25206066b5218d24c942ed97dd35c297f0a4d7a5971abf7870193892537b23d5`.
- Os dois nomes públicos (Oficial e Teste) foram baixados integralmente e comparados antes da ativação. `newprod-piloto-oficial.json`, `latest.json` e `newprod-piloto-teste.json` confirmam a versão 1.3.32, sem restrição de estação.
- A primeira tentativa parou no acesso de gerenciamento por credencial expirada, antes de upload/ativação. A credencial protegida atual foi validada no projeto correto e a publicação final concluiu normalmente. Nenhum segredo foi registrado.

- Motor integrado na main pelo PR #192, merge `cd9275c8e34d933ce174f9e08730158a1a75798d`, após atualizar a branch com v1100 e repetir os checks obrigatórios. Todos passaram.

## Validação

- 1161 testes passaram em cada perfil produção, Piloto e oficial, com 2 ignorados por perfil, além dos harnesses de navegador. Os relatórios estão no log `entrega-agente.log`.
- Testes específicos no código do release: 40 testes de refazer passaram; harness do novo intervalo aprovado nas duas páginas.
- PyInstaller, preservador de dados e MSI auditados; versão interna, tamanho e hash conferidos.
- Painel: fluxo `entrega-segura.ps1`, testes dos dois canais, pacote Piloto e PR com checks obrigatórios aprovados.

## Evidências e recuperação

- Web: `../imposition-refazer-web-20261022/dist/prova-publica-v1100.json` e `entrega-web.log`.
- Agente: `dist/msi-verificado.json`, `publicacao-agente-final.log`, `dist/publicacao-unica-1.3.32-1792701642676082100/downloads-conferidos.json`, `publicacao-confirmada.json` e `manifestos-anteriores.json`.
- Versão anterior preservada: 1.3.31. Em caso de regressão, preparar uma nova versão superior com a correção/reversão; não presumir downgrade automático do MSI.
- Checkout operacional e alterações de outras sessões preservados. IDGen permanece sob responsabilidade da outra sessão.

## Limites

A publicação comprova disponibilidade do painel e do instalador. Não foi executada instalação forçada, reinício de estação ou impressão física. Adoção em cada estação e resultado na impressora são verificações separadas. O painel bloqueia o novo intervalo quando encontra um agente anterior, com orientação de atualização.
