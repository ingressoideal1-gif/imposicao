# Mapas de Teatro — filas e assentos com letras ou números

Implementação local de 03/10/2026, na branch `fix/mapas-faixas-alfanumericas-20261003`, baseada em `origin/main` no commit `a6eab1ccb60cb7f765ad3d03a0f6c23220dd41a6` (v998). Worktree isolada em `C:\ProjetosLocais\ideal-imposition\tmp_mapas-faixas-20261003`; checkout operacional e alterações anteriores preservados.

## Comportamento

| Fila | Início | Fim | Resultado |
| --- | --- | --- | --- |
| A-C | 1 | 3 | Filas A, B e C, com lugares 1, 2 e 3: nove assentos. |
| 1-4 | A | D | Filas 1, 2, 3 e 4, com lugares A, B, C e D: dezesseis assentos. |
| A-C | A | D | Três filas com quatro lugares alfabéticos: doze assentos. |
| 1-4 | 1 | 3 | Quatro filas com três lugares numéricos: doze assentos. |

Os campos Início e Fim passam a aceitar texto; exemplos e orientação aparecem no editor. Letras são normalizadas para maiúsculas, espaços ao redor são removidos. Intervalos alfabéticos também aceitam a passagem de Z para AA; faixas numéricas de filas aceitam mais de um dígito. Listas separadas por vírgula e a ordem invertida de filas existente foram preservadas.

Para lugares numéricos, Sequencial/Ímpar/Par continuam válidos. Para lugares alfabéticos, o editor usa sequência completa e desabilita Ímpar/Par. Ao retornar a números, o controle é reabilitado.

Seleção e arraste de assento alfabético preenchem a próxima letra, evitando NaN. A restauração calcula a letra a partir do vizinho, verifica duplicidades e bloqueia uma posição anterior a A sem inventar um rótulo.

Comparação de rótulos distingue números de letras. Uma repetição ou colisão rejeita toda a operação, sem alterações parciais. Início e fim mistos, ordem final anterior à inicial, valores vazios ou inválidos são rejeitados. Existe uma proteção de 50.000 assentos por inclusão para evitar travamento do editor; não é um limite para o total do mapa e a criação pode ser dividida em operações menores.

## Arquivos e validação

- `frontend/index.html`: inputs e orientação de uso.
- `frontend/mapas.js`: expansão das faixas, validação, seleção e restauração.
- `tests/mapas_teatro_harness.js`: regressões do editor, persistência simulada e consumidores.
- `tests/mapas_teatro_browser_harness.js`: digitação nos inputs reais e fluxo do editor em Chromium.

Antes da correção, a regressão de quatro filas com A-D falhou: zero assentos, em vez de dezesseis.

Após a correção: 70 regressões Node aprovadas. Chromium: digitação real de 1-4/A/D; dezesseis rótulos; seleção da próxima letra; apagar/restaurar B; erro misto sem mutação; salvar/reabrir via Supabase simulado; CSV das duas telas preservando as letras; zero erros JavaScript. O teste de navegador corrigiu o próprio uso de atalho de teclado antes de concluir a execução.

Verificações de sintaxe dos três arquivos JavaScript alterados e `git diff --check` aprovadas. Dependências existentes reutilizadas via NODE_PATH, sem instalação. Testes usam dados sintéticos e bloqueiam rede externa; Chromium executado com autorização da ferramenta fora do sandbox.

## Limites

Alterações locais: sem commit, push, publicação, modificação de Python, schema ou acesso ao banco compartilhado nesta tarefa. Salvamento/reabertura foram validados com transporte simulado, não no banco real. Motor PDF e impressão física não foram executados; a conferência dos consumidores verificou a preservação dos rótulos alfabéticos no CSV, sem comprovar ordenação final do motor.

A incompatibilidade de `total_lugares`/`lugares_por_setor` com o banco, identificada na exportação de 02/10/2026, não foi alterada nem reconsultada nesta tarefa. A leitura e geração restrita por setor/modelo e os PDFs automáticos continuam sendo tarefas próprias.
