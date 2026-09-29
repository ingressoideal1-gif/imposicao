# NewProd 1.2.345 / painel v972

Correção autorizada dos prazos de entrega e da sincronização de modelos para
listas grandes. Consultas em lotes, paginação de modelos e recuperação após
falha na gravação dos relógios. O operador confirmou via captura do resultado
SQL que a restrição da etapa Pendente já foi ampliada no banco.

Validação: 89 testes de prazo, ordenação e sintaxe; 81 verificações dos relógios;
17 conferências da estação sem sessão; regressões com 4.685 pedidos,
paginação de 501 modelos, falha parcial e concorrência. Os seis arquivos
principais do frontend foram comparados byte a byte com o executável.
DLLs de impressão e módulo de versão presentes. ProductVersion 1.2.345.0.

MSI: 156200960 bytes.
SHA-256: 202af7c55a233dcb95fb52a97247f97b53f82e1a32331359443b7314fa3d1451

A Cloudflare confirmou o deploy web 5782ce0c-d4d7-45e4-a1dc-eb0e0bdc0231.
Após propagação, index.html, producao.html e script.js conferiram por hash
normalizado nos dois domínios operacionais (6/6). A primeira comparação
havia encontrado o cache antigo; não foi necessário repetir a publicação.

Backup e evidências: C:/ProjectBackups/newprod-prazos-1.2.345.
Manifesto anterior preservado em latest-before.json (1.2.344).
Publicação do MSI/manifesto será registrada após download público e conferência.
Instalação na estação e recuperação da tela autenticada ainda não verificadas.
Rollback do agente exige nova versão superior; não pressupor downgrade automático.
