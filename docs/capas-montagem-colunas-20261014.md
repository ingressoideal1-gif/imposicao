# Capas de montagem por coluna

Regra confirmada pelo usuário em 14/10/2026: em Cut & Stack / Estrito +
Montagem, somente as capas dos conjuntos de montagem devem preencher cada
coluna de cima para baixo, da esquerda para a direita, considerando a
orientação final do PDF. Aplica-se a qualquer quantidade de colunas e às
capas especiais de Camarote e Mapa de Teatro quando o conjunto for montagem.

Em `engine.py`, `_generate_capa_for_chunk` ordena as células pelos centros
transformados pela matriz de rotação da página, somente para `type=assembly`.
A mesma ordem atende os três caminhos de desenho de capa. Nas páginas
seguintes, a sequência recomeça na primeira coluna. Células restantes ficam
vazias. A identificação e a faixa de cada capa não mudam.

O plano do miolo, numeração, blocagem, contracapas e conjuntos estritos
permanecem intactos. O planejador atual de Teatro classifica seus conjuntos
como `strict`; esses conjuntos continuam com a ordem anterior. O caminho de
capas por fila também está coberto para conjuntos classificados como montagem,
sem reclassificar os planos de Teatro para provocar a mudança.

## Evidência sintética

No exemplo com 1.500 itens, blocos de 50 e grade 2 x 4, a capa da montagem tem
os blocos 25, 26, 27 e 28 na coluna esquerda; 29 e 30 na direita. As faixas são
1201–1250 até 1451–1500. A montagem mantém 38 folhas de miolo.

Comparação contra a função original do Git: 12 PDFs gerados antes/depois,
mudando somente `saida_set2_01_01_capa.pdf`. Todas as outras páginas têm texto
e imagem rasterizada idênticos. O novo teste reprova a implementação anterior.
Arquivos e exemplo visual em `dist/compatibilidade/capas-colunas-exemplos`.

126 testes específicos aprovados: sequencial, camarote e teatro, grades de
uma, duas e três colunas, quatro rotações, folhas incompletas e múltiplas
páginas. A leitura dos rótulos usa linhas do PDF, pois o extrator agrupa capas
vizinhas num mesmo bloco de texto. Os testes novos foram incluídos na bateria
de compatibilidade com instalações antigas. Existe um único NewProd oficial;
os nomes históricos dos perfis de teste não representam versões separadas.

Publicação concluída na NewProd 1.3.3 oficial; ver
`newprod-oficial-133-20261014.md`. Nenhum pedido real foi alterado nem trabalho
foi enviado à impressora nesta tarefa. Instalação nas estações não foi forçada.

O usuário aprovou o PDF de exemplo e autorizou a entrega segura. A alteração
foi distribuída como NewProd 1.3.3 oficial, mantendo a liberação das 12
estações. Os 40 testes dos contratos de versão/instalação/publicação passaram
após incrementar a versão. Os instaladores anteriores permanecem imutáveis.

A bateria completa concluiu 60 etapas sem falhas: 1.027 testes Python,
dois subtestes e 19 harnesses JavaScript em cada configuração de compatibilidade.
Permanecem duas exclusões por ausência do pool QR real e um aviso preexistente
Starlette/httpx por configuração. Relatórios em
`dist/compatibilidade/capas-colunas-canais.json` e
`dist/compatibilidade/capas-colunas-oficial.json`.
