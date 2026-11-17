# NewProd 1.4.18 — orientação interna de PDFs

O pedido 25345, modelo 1008279, revelou uma diferença entre a prévia e a
imposição: as 369 páginas da arte usam `/Rotate 270`. A importação dos fluxos
PDF não aplicava essa orientação, embora o formato girasse a folha em 90°.

`pdf_camadas.mostrar_pagina` agora transforma o recorte para as coordenadas
sem `/Rotate` e combina a orientação da origem com o giro solicitado pela
imposição. A orientação da página de origem é restaurada inclusive em erro.
Não há rasterização, regravação da arte original ou alteração do formato.
Páginas sem rotação interna conservam a chamada anterior.

## Base e escopo

- Base: `agente-v1.4.17`, a versão pública conferida antes desta entrega.
- A linha do agente contém correções publicadas ainda ausentes de `origin/main`;
  esta entrega preserva essa base e não a mescla integralmente ao frontend web.
- Versão, ProductVersion e nome do MSI: 1.4.18.
- Canal de publicação: produção (manifesto oficial e `latest.json`).
- O canal de teste conserva o manifesto existente.

## Validação

- Antes da correção, a regressão sintética falhou na orientação interna de 90°.
- 56 regressões novas cobrem rotações internas e de saída em 0/90/180/270°,
  CropBox, recorte parcial, camadas ocultas, reuso, falha de importação,
  PDF paginado, Multi-Artes, Refazer, duplex e verso único.
- Produção, Piloto e Oficial: 1.409 testes aprovados, 3 ignorados e 2 subtestes
  aprovados por perfil; todas as 78 etapas do verificador passaram.
- Após atualizar os metadados para 1.4.18: 119 testes focados e de empacotamento
  aprovados. Aviso de depreciação de httpx/Starlette, sem mudança de dependências.
- As 369 páginas da arte real foram geradas localmente com giro de folha 90°:
  comparação renderizada a 0,5× idêntica à referência normalizada, sem elementos
  adicionais. Hash da arte original preservado. Não houve impressão física.

## Entrega e recuperação

Conferir módulos, painel, DLLs, versão e ausência de dados privados nos binários;
conferir tamanho e SHA-256 do download público antes de ativar os manifestos.
Registrar publicação e adoção pelas estações separadamente. Não instalar ou
reiniciar estações em uso como parte desta entrega.

Se for necessário reverter o motor, publicar a base 1.4.17 sob uma versão
superior à 1.4.18; o atualizador não faz downgrade automático. A arte original
e os dados do pedido não precisam de restauração.
