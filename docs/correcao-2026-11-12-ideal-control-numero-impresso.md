# Ideal Control: número impresso na leitura — pedido 24585

## Diagnóstico e escopo

Consulta autorizada somente leitura em produção em 12/11/2026: 870 credenciais,
nove modelos QR12. Três modelos começam em 101, três em 801 e três em 901.
As credenciais guardam a posição ordinal 1..quantidade. Exemplo: modelo 1005802,
150 unidades, contrato 101..250, posição 150 corresponde à pulseira 250.

A investigação inicial classificou o campo `numero` como cadastro incorreto.
A revisão dos consumidores corrigiu essa conclusão: o ordinal faz parte do
protocolo de emissão, da identidade/deduplicação e dos bloqueios por faixa.
O defeito relatado é mostrar esse ordinal como se fosse o número impresso.
Também existe um bloqueio cadastrado neste pedido; alterar ordinais em massa
sem migrar todos os consumidores poderia mudar decisões de acesso.

## Correção implementada

- `numero_impresso.ts` calcula a apresentação a partir do contrato QR12 imutável:
  `inicio + (numero - 1) * passo + posicao - 1`. Não consulta o modelo editável,
  não reserva contratos e não acessa o pool de códigos.
- A carga autenticada da portaria acrescenta `ni` (número impresso), conservando
  `n` (ordinal), hash, ID e setor. Consultas em lotes de até 50 pares pedido/modelo.
- A decisão da portaria usa `ni` apenas no resultado apresentado; bloqueios,
  duplicidade e identidade continuam usando os mesmos campos anteriores.
- Uma nova marca de versão da carga aciona o mecanismo existente de download
  quando o aparelho sincroniza e esvazia sua fila. O HTML versiona o JS alterado.
- Importações de cliente, QR legado e registros sem contrato QR12 conservam o
  comportamento anterior. Credencial/contrato incompatível falha sem inventar número.

Não há migração SQL nem correção de linhas do pedido. A mudança se limita à
leitura na portaria (incluindo permitido, recusado, ambiguidade e reentrada).
Relatórios administrativos e formulários de bloqueio continuam com sua semântica
anterior; não foram migrados nesta correção do relato do cliente.

## Validação

Testes Deno sem permissão de rede, com banco e servidor simulados: cálculo,
inícios 0/1/101/801/901, TICKET, limites inválidos, código do cliente, legado,
paginações, isolamento, autenticação, leitor incompatível, carga antiga,
armazenamento/sincronismo offline, bloqueio, entrada repetida e reentrada.
Integração exercita o handler real de `/portaria/faixa` até a decisão JavaScript.
47 testes focados e 436 testes da suíte completa Deno aprovados. Nos canais
Produção e Piloto, 911 testes Python passaram por canal, com 2 pulados, 2
subtestes e todos os 19 harnesses aprovados. Nenhuma leitura física foi feita.

## Publicação e recuperação

Entrega isolada da árvore operacional, base inicial `e5112d68` de `origin/main`.
Durante a publicação foi incorporada `ab58adb4` (PR 282), preservando a entrega
posterior do portal. A versão web desta correção passou para `v20261127`.
Publicação exige o frontend (HTML/JS) e a Edge Function `portaria`, preservando
sua configuração de autenticação. As duas partes são compatíveis com a versão
anterior: cliente antigo ignora `ni`, cliente novo aceita carga antiga.

Depois de publicar, abrir online o aplicativo atualizado e aguardar download
completo. Conferir uma pulseira real 250, que deve apresentar 250, e verificar
entrada repetida; não limpar IndexedDB ou fila. Aparelho offline não recebe a
correção até atualizar o código e a carga.

Recuperação: restaurar as versões anteriores da função e dos assets pelo fluxo
protegido. Não restaurar nem excluir credenciais/leituras: não foram alteradas.
Publicação autorizada: função `portaria` v283 ACTIVE, 19 fontes conferidas,
`verify_jwt=false` preservado, GET sem token recusado com HTTP 401. Credenciais,
contratos e bloqueio do pedido foram comparados antes/depois por digest e
permanecem iguais; as 461 leituras também foram preservadas. Nenhuma escrita
de dados de negócio nem migração foi executada. Frontend segue pelo PR 283;
a prova pública final fica em `dist/entrega/resultado-publicacao.json`.
