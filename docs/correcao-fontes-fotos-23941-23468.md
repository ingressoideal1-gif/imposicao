# Fontes e fotos: pedidos 23941 e 23468

Correcoes locais de 19/10/2026, base inicial agente-v1.3.19 (b709e549), atualizada para agente-v1.3.20 (800d1806) antes do release 1.3.21, checkout isolado.

## Fontes

O modelo 1003810 usa Arial bold e Comic Sans MS normal/bold. A preparacao offline procurava prefixos do nome da familia, mas o catalogo usa comic/comicbd. A incorporacao no motor ja usava o registro Windows. As funcoes de familia/estilo/arquivo foram extraidas sem mudanca de algoritmo para fontes_sistema.py, importadas tanto por app.py como pela preparacao offline. A selecao agora respeita estilos e precedencia do catalogo; URLs diretas sao alternativa apenas sem correspondencia. Cache persistido continua com hash e deduplicacao.

## Fotos

O modelo 1002605 do pedido 23468 usa 13 fotos em __fotos.FOTO. O filtro publicado para 23840 ignorava os metadados do Gerenciador. A descoberta agora inclui os metadados das colunas consumidas como arquivo. Colunas auxiliares de QR continuam excluidas; sem vinculo resolvido, permanece a descoberta conservadora. Dados, URLs e recortes nao sao modificados. Mantida a remocao dos tetos de 256 recursos/100000 valores autorizada anteriormente.

A versao local de recursos agora exige uma conferencia completa unica para recibos antigos, mesmo quando a revisao comercial nao mudou. Isso evita reutilizar uma lista que omitia fotos; os objetos anteriores sao preservados. A primeira renovacao requer conexao.

## Validacao

Teste real somente leitura: 13/13 URLs do banco de 23468 incluidas, entrada integral preservada. Testes sinteticos cobrem preparacao, persistencia/reinicio, incorporacao real de fontes sem importar servicos, estilos e alternativa por URL. Regressao conjunta cobre fotos, QR, colunas compartilhadas e 100001 recursos.

Os testes de descoberta da Edge passaram (25). A renovacao de cache e reabertura passou em 53 testes direcionados. Na primeira bateria do perfil producao, 1099 testes passaram e 34 falharam no setup porque a junction para node_modules ainda nao existia; apos apontar para as dependencias ja instaladas, os 34 passaram sem instalar pacotes. Nenhum teste foi desabilitado.

Perfis concluidos: producao 1133 testes (1099 + 34 repetidos apos ajustar ambiente), piloto 1133 e oficial 1134; 2 skips conhecidos por perfil e aviso existente de deprecacao Starlette/httpx. Os 21 harnesses de interface passaram nos tres perfis. A regressao nova de renovacao tambem foi executada separadamente junto aos 53 testes de cache/abertura. git diff --check passou.

## Entrega

Publicacao autorizada em 19/10/2026. Edge piloto-local atualizada de v17 para v18: 12 modulos baixados novamente e iguais aos preparados, autenticacao preservada (401 sem credencial). Backup em dist/edge-1.3.21/antes. MSI 1.3.21 compilado sobre agente-v1.3.20, preservando a rotacao das paginas pares. Auditoria: oito modulos de codigo identicos a fonte, 375 arquivos de frontend identicos, tres DLLs GDI e ProductVersion 1.3.21. Os dois aliases MSI tiveram download publico completo conferido duas vezes por tamanho/SHA-256. Os tres manifestos latest.json, newprod-piloto-oficial.json e newprod-piloto-teste.json foram ativados e relidos com cache-buster: 1.3.21 universal, sem lista de estacoes. Nenhuma instalacao foi executada. Apos atualizar, reabrir pedidos para preparar dependencias. Nenhuma alteracao de banco comercial, status ou impressao fisica. Nao confundir limites removidos da descoberta com limites de transporte existentes.

MSI: 196698112 bytes; SHA-256 `8a0a39903eab51b7e0488092c8dc26117ce8ab56b59abca15558794b42cff169`. Fonte runtime: commit 2549a1ca na branch fix/fontes-fotos-23941. A integracao automatica em main nao foi aplicada: main nao possui os modulos de preparacao offline da base runtime; o codigo da entrega fica preservado na branch e tag do agente.

Validacao final na base 1.3.20 e versao 1.3.21: 1134 testes aprovados em cada perfil (producao, piloto e oficial), 2 skips e 2 subtests; 21 harnesses em cada perfil, mais o harness de paginas pares. Edge: 25 testes aprovados. Recibos em dist/validacao-1.3.21.json, auditoria-1.3.21.json, preupload-1.3.21.json e manifestos-1.3.21-verificados.json. Tag publicada: agente-v1.3.21 = 2549a1ca. Disponibilidade nao comprova instalacao nas estacoes nem impressao fisica.
