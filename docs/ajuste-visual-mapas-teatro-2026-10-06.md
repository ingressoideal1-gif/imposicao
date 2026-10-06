# Mapas de Teatro: hífen e largura dos assentos

Em 06/10/2026 foi preparado o ajuste solicitado: na tela e no PDF, o identificador do conjunto e o lugar são separados por `-`, por exemplo `A-1` ou `1-A`. Os quadros dos assentos ficam 30% mais largos, mantendo a altura. O texto permanece centralizado e reduz a fonte quando necessário para caber.

## Escopo e estado

Implementação local na branch `feat/mapas-assentos-20261006`, criada sobre `origin/main` em `488de51f`, no checkout `C:\ProjetosLocais\ideal-imposition\tmp_mapas-assentos-20261006`. O checkout operacional e suas alterações preexistentes foram preservados. Não houve commit, publicação web, aplicação de SQL remoto, instalação, envio de arquivos ao ERP ou impressão física nesta tarefa.

Os dados de fila/lugar, coordenadas, identificação dos setores, quantidades, bancos do ERP e revisão JCS permanecem preservados. A grade da tela continua com passo de 32 px; o quadro passa de 24 × 24 para 31,2 × 24 px. Assim, o desenho cabe na mesma célula e o clique na borda alargada seleciona o mesmo assento.

No PDF, a largura é 1,30 vezes a altura, com passo entre posições preservado e desenho centralizado. Os indicadores dos tipos especiais ficam dentro do quadro, evitando sobreposição com o assento seguinte. Cada setor continua inteiro em exatamente uma página; o PDF completo reúne essas páginas. A logo da Ingresso Ideal foi mantida.

## PDFs persistidos e compatibilidade

Os PDFs já publicados são imutáveis. Reutilizar `a3-v1-20261003` devolveria o PDF antigo mesmo com o desenho novo no navegador, pois os dados/revisão do mapa não mudaram. Por isso, o novo gerador é `a3-v2-20261006`, em `frontend/mapas-teatro-pdf-storage.js` e `supabase/functions/mapas-teatro-pdfs/`.

A Edge Function preparada aceita consultas/downloads explícitos tanto v1 quanto v2, mantendo os bytes e caminhos históricos. Novos uploads usam somente v2. Nenhuma política, autorização ou chave de serviço foi alterada. A versão faz parte da referência do arquivo e da chave única da exportação, sem adicionar campos ao cadastro do mapa ou a `pedidos_modelos`.

A tabela existente `public.producao_mapas_teatro_pdf_exportacoes` e sua RPC ainda precisam aceitar v2. Foi preparado `sql/20261006_mapas_teatro_pdf_gerador_v2.sql`, **não aplicado**. Ele permite as duas versões no CHECK e altera apenas a guarda de versão da definição vigente da RPC `mapas_teatro_publicar_pdf_exportacao`, preservando correções anteriores, SECURITY INVOKER e permissões. O SQL original da entrega de 03/10 não foi modificado nem reaplicado. O novo script recusa estrutura inesperada ou reaplicação; não reescreve registros, mapas ou arquivos armazenados.

## Validação executada

- `ferramentas/conferir_duas_versoes.py`: Produção e Piloto passaram, cada um com **389 testes Python aprovados, 2 ignorados** e os 12 harnesses JavaScript. Houve apenas o aviso existente de depreciação do TestClient/HTTPX; não foram alteradas dependências.
- Mapas: **99 regressões** aprovadas; cliente de armazenamento: **9 verificações** aprovadas, sem rede externa.
- Edge Function de PDFs: **22 testes** aprovados, sem permissão de rede, incluindo coexistência v1/v2, download histórico com hash conferido, recusa de gerador desconhecido e upload v1 desatualizado.
- Chrome real em `index.html` e `producao.html`: hífen nos textos, proporção 1,30 dos quadros, centralização, clique na borda alargada, ausência de sobreposição entre assentos e nenhuma alteração da configuração pelo desenho.
- PDFs reais: logo, quatro setores com uma página cada e setor denso com **3.000 lugares únicos em uma página**, todos com hífen. Conferência visual da captura da tela e da página renderizada do PDF sintético.
- Harness de revisão JCS e sintaxe dos três arquivos JavaScript alterados aprovados; `git diff --check` sem erros de whitespace.

Na preparação inicial, o SQL recebeu revisão estática. Na entrega autorizada em seguida, passou também pelo teste `tests/mapas_teatro_pdf_gerador_v2_pglite.cjs` em PostgreSQL local, com coexistência v1/v2, alias anterior preservado, grants, SECURITY INVOKER, repetição e recusas. Os testes sintéticos não comprovam sincronismo de estações, instalação do Piloto ou impressão física.

As evidências sintéticas ficam em `C:\ProjetosLocais\ideal-imposition\tmp_mapas-pdf-app-20261006`: capturas `editor-conjunto-*.png`, PDFs `mapa-sintetico-*.pdf`, `mapa-denso-*.pdf`, `mapa-conjuntos-*.pdf` e `mapa-sintetico-render.png`. Esses arquivos contêm apenas dados fictícios.

## Ordem para uma entrega autorizada

1. Confirmar o ambiente Supabase `vwbtitjlpelrcnsytzqw`; executar a prévia do SQL e salvar a definição vigente da RPC e constraints antes da aplicação. Conferir a mudança específica sobre `producao_mapas_teatro_pdf_exportacoes`, sem filtro ou alteração de dados: estimativa de registros reescritos = **zero**.
2. Aplicar o novo SQL de compatibilidade em transação, com timeout de lock. Conferir CHECK, guarda da RPC, SECURITY INVOKER, grants e contagens por versão depois; os registros existentes devem permanecer iguais.
3. Publicar a Edge Function com suporte de leitura às duas versões, seguida do frontend comum. Atualizar também o pacote independente do Piloto conforme `docs/newprod-producao-e-piloto.md`; não confundir publicação web com instalação da estação.
4. Conferir os arquivos públicos após propagação e as fontes servidas nas duas variantes. Salvar um mapa para publicar a v2; confirmar o registro e reler o manifesto, baixar um setor e conferir tamanho/hash e desenho. Verificar também o acesso a uma exportação v1 previamente existente.
5. Para mapas existentes, abrir o botão PDFs já produz a representação local atualizada; para disponibilizar a v2 no banco/ERP, salvar o mapa ou usar a publicação de PDFs existente. Não houve regeneração em lote de mapas reais nesta tarefa.

## Recuperação

Antes do COMMIT, qualquer falha reverte o DDL na transação. Após publicação, o frontend pode retornar ao desenho anterior; se necessário, retornar o gerador padrão da Edge a v1 **mantendo o suporte de leitura a ambas as versões**. Coordenar os consumidores para que não enviem v2 a um serviço que só aceite v1. Preservar o CHECK que aceita ambas e todos os PDFs/registros v2 já produzidos. Não apagar histórico nem substituir a RPC pela versão original de 03/10; recuperar a definição vigente a partir da prévia guardada exige revisar as versões ainda em uso.

## Entrega autorizada em seguida

O usuário autorizou a publicação em 06/10. A entrega foi separada em SQL, Edge Function e frontend, conforme o escopo do procedimento seguro. A migração foi aplicada em `vwbtitjlpelrcnsytzqw`: antes e depois, 14 exportações v1 e 7 mapas, com os mesmos fingerprints dos registros completos, ACL, proprietário da RPC e SECURITY INVOKER. A correção anterior `GROUP BY t.s` foi preservada.

A prévia e a conferência posterior estão em `C:\ProjectBackups\mapas-assentos-publicacao-20261006\inventario-antes.json` e `inventario-depois.json`, sem credenciais ou cópias dos dados dos mapas. A versão web planejada nesta etapa é v1027. A conclusão da implantação deve registrar o commit integrado, a conferência pública dos assets e o pacote do Piloto; não antecipar confirmação de instalação ou impressão física.
