# Ideal Control: autorização única e acompanhamento de entradas

Implementação em worktrees isoladas, preservando a pasta operacional. Backend integrado pelo PR #291 (45f69e40), com migração aplicada e funções publicadas. Frontend em publicação pelo fluxo protegido.

## Comportamento preparado

- A entrada nas Configurações autoriza suas opções durante a sessão existente. AO VIVO não pede login nem repete o PIN; Zerar entradas mantém confirmação e reutiliza a autorização vigente.
- AO VIVO nas Configurações oferece `Liberar AO VIVO na tela de leitura de todos os aparelhos`.
- A opção pertence ao evento e começa desativada. Ao ativar, aparelhos ativos pareados consultam o relatório sem PIN. Toda consulta valida o token e a opção no servidor; desativar revoga novas consultas.
- A tela de leitura ganha acesso ao relatório e retorno à leitura. A fila local e a identidade do aparelho são preservadas.
- A tela inicial consulta o total de entradas confirmado no servidor sem conta de e-mail, inclusive zero, com atualização de 30 segundos. Sem resposta não inventa zero.
- PIN incorreto informa senha não aceita; espera só é anunciada quando o limite de cinco tentativas estiver atingido e a janela ainda vigente. Não mudou a duração da autorização nem a proteção contra tentativas.

## Diagnóstico de produção, somente leitura

Em 14/11/2026 por volta de 16h41 BRT, os quatro aparelhos associados ao BAILE DO ANO estavam ativos. Duas instalações tinham uma tentativa não aceita e duas tinham zero. Nenhuma atingia o limite de cinco. A mensagem antiga de espera era emitida para qualquer PIN recusado, inclusive primeira tentativa. Isso não prova qual aparelho originou o relato nem que a mensagem de expiração tenha sido a mesma mensagem.

## Sequência de publicação autorizada

1. Aplicar `sql/acesso_ao_vivo_na_leitura_20261114.sql` no Supabase do projeto: adiciona somente `producao_acesso_eventos.ao_vivo_na_leitura`, booleano inicialmente falso; não ativa evento existente. Transação com limites de lock e duração.
2. Publicar as funções `portaria` e `acesso-conta`, com os módulos compartilhados. Os testes usam somente dados sintéticos.
3. Publicar frontend pelo fluxo protegido, com renovação da versão dos assets e service worker. Não reutilizar versões anteriores.
4. Conferir os arquivos públicos e a adoção no celular. Nas Configurações, abrir AO VIVO e ativar a opção. Em outro aparelho, verificar botão, relatório, contagem inicial e retorno à leitura; revogar a opção e confirmar recusa no servidor.

Recuperação: voltar as funções/frontend à versão anterior em nova publicação, deixando a coluna adicional inerte. Não apagar ingressos, entradas, senhas, instalações ou vínculos.

A validação de interface usa Chromium com rede simulada; não comprova instalação no iPhone, leitura física nem aplicação da migração no PostgreSQL.

## Validação local concluída

- PIN/QR/HTTP: 17 testes Deno; configuração e relatório compartilhados: 50 testes Deno.
- AO VIVO: 26 testes da suíte e regressão adicional para continuar a consulta liberada sem renovar edição.
- Lista inicial e QR/PIN: 87 casos, com a asserção de diálogo corrigida para medir somente diálogo de PIN aberto e reexecutada com sucesso.
- Configurações: 24 testes de autorização, engrenagem e operações de risco.
- Portaria e digitação: 86 testes; 2 casos adicionais validam o botão AO VIVO e a preservação da fila.
- Sintaxe JavaScript, Deno check das duas funções e git diff --check aprovados.
- Deno precisou usar --node-modules-dir=none --cached-only nos testes compartilhados por incompatibilidade local de resolução de @types/node. Não houve instalação de dependências.

Migração conferida em produção: 22 eventos, opção falsa em todos, sem valores nulos; 800 credenciais do pedido 23726 continuam ativas e vinculadas. Suíte completa das funções: 443 testes aprovados.
