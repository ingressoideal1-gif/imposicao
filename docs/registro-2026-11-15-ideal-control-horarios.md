# Ideal Control: horários dos relatórios

## Diagnóstico e correção local

Relato: horários incorretos em Gerenciamento de público, com o pedido 23726
(BAILE DO ANO) como exemplo. Não foram consultadas leituras reais desse pedido:
o diagnóstico foi reproduzido no código com dados sintéticos.

O agrupamento por hora removia o offset do timestamp e os gráficos exibiam
literalmente a hora resultante. O CSV exportava o timestamp ISO cru, enquanto
outros detalhes usavam o fuso do navegador. Assim, 22:15 UTC aparecia como 22h
no gráfico, em vez de 19h em Brasília.

- O backend agrupa instantes equivalentes em faixas UTC com `Z` explícito.
- Os dois frontends apresentam America/Sao_Paulo, com indicação de Brasília.
- As faixas mostram também dia/mês, inclusive na virada da meia-noite.
- O CSV distingue leitura de recebimento no servidor e preserva os dois
  timestamps originais em colunas adicionais. A leitura offline continua
  pertencendo ao instante da leitura, não ao da sincronização.
- Respostas antigas de faixas sem offset são interpretadas como UTC.

Não há migração nem alteração de registros, contagens, permissões ou numeração.
O horário de leitura continua vindo do aparelho; esta correção não reconstitui
horários de aparelhos cujo relógio estivesse errado.

## Validação

- Deno: 443 testes aprovados na suíte completa, incluindo offsets
  equivalentes, valores inválidos e manutenção das métricas.
- Navegador real: gráfico e CSV em UTC, Los Angeles e Tóquio; virada do dia,
  meia-noite, recebimento posterior, timestamp ausente e preservação do ISO.
  Resultado final: 34 testes de Ao vivo e 71 da tela Ideal Control aprovados.
- A verificação de versões uniformes do index.html já falha no HEAD original:
  há 37 versões distintas de assets. Nenhuma versão foi alterada nesta tarefa.
- Conferência dos canais: 912 testes aprovados, 2 ignorados e 19 harnesses
  aprovados em cada canal. Um aviso de depreciação Starlette/httpx existente.
  Evidência em `dist/entrega/horarios-canais.json`.
- Painel Piloto preparado com base auditada compatível, em
  `dist/piloto/painel-0b70dc91c2fa`; não instalado.

## Entrega e conferência real pendentes

Preparação baseada em `1898822b`, separada nas branches
`release/control-horarios-edge-20261115` e `release/control-horarios-web-20261115`.
Publicação autorizada em 15/11/2026, com frontend v20261135. A entrega deve incluir os frontends e as
Edge Functions que incorporam o relatório compartilhado: acesso-interno,
acesso-conta e portaria. Revisar consumidores adicionais antes da publicação,
atualizar o cache pelo fluxo de release e conferir os arquivos públicos.

Depois de publicar, abrir o pedido 23726 com sessão autorizada e comparar uma
leitura com horário conhecido, o gráfico e o CSV. O CSV antigo precisa ser
exportado novamente. Se ainda houver divergência, conferir os valores originais
e o relógio do aparelho, sem deslocar timestamps armazenados por suposição.

Recuperação: republicar as versões anteriores dos arquivos e funções afetados.
Não existe recuperação de banco necessária, pois nenhum dado foi modificado.

## Preparação da publicação

O código remoto foi baixado para comparação e recuperação. Em acesso-interno,
configuracao.ts e pin_instalacao.ts diferem do HEAD do repositório; o pacote
de publicação preserva esses dois arquivos remotos. Nos três pacotes, apenas
relatorio_puro.ts muda. A verificação JWT permanece true em acesso-interno e
acesso-conta, e false em portaria. Nenhuma outra função entra nesta entrega.

A validação do frontend após atualização do cache aprovou 34 testes de Ao vivo
e 32 de PWA. As referências das três páginas PWA usam a mesma versão, incluindo
sw-registro.js, para instalação e atualização coerentes do cache offline.
