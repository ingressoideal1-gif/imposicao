# TEATRO — preenchimento vertical por modelo, 03/10/2026

Correção local, preparada na cópia isolada `tmp_pedido-mapa-teatro-20261003`, sobre `812e9a9d`. Sem publicação, instalação, envio ao ERP, alteração de banco compartilhado ou impressão física nesta correção.

## Regra e diagnóstico

O usuário confirmou: quando a numeração é TEATRO, dividir a quantidade física do modelo pelas posições do formato, arredondar para cima e preencher as posições verticalmente até consumir todos os registros. A documentação geral já registra `item_index = P * total_sheets + S`, em `docs/DOCUMENTACAO.md`.

A implementação publicada v1004/NewProd 1.2.347 agrupava fisicamente os ingressos por fila/mesa e exigia Blocado/Montagem estrita do modelo. Essa interpretação confundiu agrupamento dos dados com a montagem de impressão e causou o aviso relatado no pedido 23096. Reconhecer apenas a herança do formato não corrigiria a montagem errada.

## Correção preparada

- Numeração TEATRO e bancos identificados como importados do mapa acionam a montagem vertical por modelo. Os bancos legados Fila/Numero também são reconhecidos pelo tipo TEATRO.
- Cada modelo tem um set com `ceil(Q/P)` folhas. A posição p recebe os registros `p*folhas+s`; as células após Q ficam vazias. Filas e mesas não reiniciam nem dividem a pilha; BLOCO comercial 50 não limita sua altura.
- Prévia do Pedido, Imposição, PDF e Refazer Folhas usam essa distribuição. Capas identificam os limites reais de cada pilha, incluindo conjuntos diferentes quando ocorrerem.
- A validação de PRONTO mantém quantidade, setor/revisão e elementos; deixa de exigir a gravação manual do modo comercial. As opções do modelo informam a regra automática e a mensagem de inconsistência de teatro direciona ao setor associado.
- A capacidade `teatro_vertical_modelo_v1` impede enviar a montagem nova a um motor anterior. O executor interno reutiliza `cut_stack/strict_assembly`, mas os sets são calculados por modelo, sem dividir por conjuntos.
- Modelos de tipos diferentes continuam usando suas próprias regras. Permanecem a proibição de combinar BLOCO comercial diferente, as quantidades/fórmulas TICKET e o fluxo Modo PDF paginado. A correção não recalcula quantidades comerciais, não migra dados e não troca artes ou vínculos.

## Evidência local

38 testes Python focados passaram: paridade JS/Python, PDF real, Refazer, capas e proteções de banco. Os testes novos verificam todas as posições de PDFs sintéticos de 82 lugares/11 folhas e 515 lugares/65 folhas em oito poses, com exatamente os lugares esperados e vazios restantes.

O harness da prévia executa as funções reais do frontend com registros sintéticos, incluindo modo sequencial previamente salvo, formato ausente no registro da validação, mudança entre conjuntos, três modelos e seleção individual. Quantidade divergente continua bloqueada. Os harnesses existentes de impressão/PDF combinado, banco por modelo, prévia por modelo, legado, modelos somados, seleção de linhas e cadastro de mapas passaram.

Passaram 85 verificações de sintaxe do frontend, parsing Python e `git diff --check`. O popup passou em Chromium com APIs simuladas: pesquisa, associação de quatro modelos, conflito, retomada, revisão e fechamento durante leitura. A primeira tentativa do navegador dentro do sandbox terminou em timeout de inicialização; a execução local autorizada fora do sandbox passou. Não foram instaladas dependências.

Os dados do pedido 23096 lidos no diagnóstico anterior servem apenas como referência para as quantidades 82 e 515. Não houve nova consulta nem gravação em produção nesta correção; os PDFs de validação são sintéticos.

## ERP e entrega

Enviar `docs/integracao-erp-mapas-teatro-v4.md`, que substitui as versões 2 e 3 e esclarece que `csv_data.Bloco` identifica o conjunto no banco, sem definir um bloco físico de impressão. O arquivo foi disponibilizado também em `C:\ProjetosLocais\ideal-imposition\docs`.

Publicação web e distribuição/instalação do NewProd corrigido estão pendentes. Não basta publicar somente o frontend: a estação anterior não disponibiliza `teatro_vertical_modelo_v1` e será bloqueada de forma explícita.

Recuperação: as mudanças estão locais no worktree e podem ser revistas pelo diff antes da entrega. O código do checkout operacional, os dados e a versão instalada não foram modificados. No checkout operacional foram apenas disponibilizados o contrato v4 e uma nota de correção no diagnóstico anterior do pedido.
