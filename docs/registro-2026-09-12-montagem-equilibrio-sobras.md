# Montagem: repetições e distribuição de sobras

Solicitação: minimizar repetições primeiro; no empate, favorecer sobras em todos os modelos e distribuir as reservas de forma equilibrada, mesmo que a comparação apresentada tenha maior sobra total.

A recomendação usava busca linear e distribuía extras proporcionalmente à tiragem. Completar repetia células na ordem, sem avaliar as quantidades.

Agora o otimizador compartilhado encontra o menor número viável de repetições por busca binária. Depois atribui cada célula livre ao modelo com menor sobra absoluta. Isso maximiza as sobras ordenadas da menor para a maior; empates seguem a ordem dos modelos. Não aumenta repetições para criar reservas. Em uma folha cheia com capacidade e repetições fixas, a sobra total é fixa; nem toda distribuição do exemplo é fisicamente possível. Cada célula adiciona R peças, portanto não há promessa de sobra positiva em todos quando a capacidade não permite.

Completar preserva todas as células e posições existentes como limites mínimos e otimiza somente os acréscimos até fechar a última folha. Sem tiragens conhecidas, conserva a repetição em ordem. A estimativa continua considerando repetições da montagem inteira. Proteções de dados variáveis e compatibilidade permanecem nos fluxos existentes.

Arquivos: frontend/montagem.js e testes da Montagem. Nenhuma alteração do motor, banco ou publicação.

Validação: oráculo independente enumera 3072 cenários com três modelos, compara todas as divisões possíveis e verifica mínimo de repetições e equilíbrio. Regressões para tiragem de um bilhão, preenchimento manual e preservação de posições. Harness do núcleo: 3328 verificações; tela: 211 verificações. Suíte dirigida de Montagem, faces PDF, identificação e sintaxe do frontend: 136 testes. Teste antigo de texto da busca linear atualizado para o otimizador compartilhado, com a correção matemática coberta pelo oráculo.

## Identificação na prévia

Solicitação adicional: atualizar a janela ao escolher a identificação. A seleção redesenhava a tela, mas preservava imprimir=false, ocultando o texto. Escolher o tipo agora ativa Imprimir, mantendo prévia e saída coerentes. O checkbox ainda permite desligar explicitamente. Teste de navegador parte de imprimir=false, dispara change no dropdown real, confere número do pedido visível e checkbox marcado, texto personalizado ao digitar, foco preservado e desativação posterior. 211 verificações de tela aprovadas. Alteração local, sem publicação.

## Recomendação sempre aberta

Substituído details/summary por section com título fixo. A recomendação disponível fica sempre visível, sem seta ou ação de recolher. Preservados os critérios de disponibilidade e os botões existentes.

## Entrega autorizada

Publicação solicitada após as três alterações. Interface v861; arquivos de cache index.html e producao.html atualizados. Escopo de entrega: frontend hospedado, sem mudança do motor Python ou geração de MSI. Validação pública dos arquivos após o merge; instalação e impressão física na estação não fazem parte desta comprovação.
