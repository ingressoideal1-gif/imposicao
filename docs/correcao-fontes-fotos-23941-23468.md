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

Ainda sem deploy, build MSI ou instalacao. Fotos exigem publicar piloto-local preservando a base publicada v17; fontes exigem novo MSI do NewProd e atualizacao das estacoes. Apos atualizar, reabrir pedidos para preparar dependencias. Nenhuma alteracao de banco comercial, status ou impressao fisica. Nao confundir limites removidos da descoberta com limites de transporte existentes.
