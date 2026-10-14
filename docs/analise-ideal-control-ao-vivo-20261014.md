# Ideal Control — falha em AO VIVO, 14/10/2026

## Diagnóstico

A imagem fornecida mostra a tela aberta para Halloween Almo2bar 2026, seguida
da mensagem genérica de falha de consulta. A consulta de produção, somente
leitura, confirmou o pedido 23390, evento ativo, sem dono_auth_id e sem contas
ativas em producao_acesso_contas vinculadas ao cliente desse evento.

O botão AO VIVO é exibido inclusive para eventos existentes apenas no chaveiro
do aparelho. Entretanto, ao-vivo.js exige sessão de conta e consulta
acesso-conta/eventos/{id}/ao-vivo. A rota chama eventoDoDono, que permite somente
o dono ou uma conta ativa vinculada ao cliente. O token de leitura do aparelho
não concede esse acesso. Na configuração encontrada, nenhuma conta satisfaz
essa autorização para o evento.

O banco consegue calcular as métricas: três entradas, um ingresso utilizado,
zero saídas e saldo de presença registrada igual a um. Há dois setores ativos.
São valores da consulta de diagnóstico, não prova de presença física.

## Reprodução e evidências

- Base examinada: origin/main, commit
  5da30854c37fac7921bdf4d0302e1dc9b7cf5868.
- Cinco arquivos públicos conferem com a fonte: controle.html, ao-vivo.js,
  acesso-conta.js, conta.js e lista-eventos.js.
- Código remoto de acesso-conta/index.ts, _compartilhado/contas.ts e
  _compartilhado/relatorio.ts baixado para pasta isolada e conferido por hash.
- Rota real executada localmente com banco e identidade sintéticos, sem rede:
  evento sem dono/vínculo responde 403 com detail "evento nao encontrado nesta
  conta"; dono autorizado responde 200.
- Navegador com HTML e módulos reais, recebendo a resposta sintética 403:
  reproduziu exatamente a mensagem genérica da imagem e ocultou os números.
- Os 19 testes existentes de AO VIVO passaram. O harness existente substitui
  AcessoConta por um dublê e não reproduz esse contrato real de erro.

Não foi usada a sessão pessoal do iPhone nem capturado seu tráfego. O status
403 foi reproduzido com a mesma regra publicada e o estado equivalente ao
observado no evento, sem fabricar credenciais ou acessar dados como usuário.

## Defeitos associados

1. AcessoConta.pedir cria Error com message, status e corpo. ao-vivo.js procura
   e.mensagem; perde o motivo retornado e atribui genericamente a falha à rede.
2. O rodapé calcula a versão a partir de controle.js?v=1023, ainda presente no
   HTML publicado. Portanto a imagem com v1023 não prova PWA desatualizado.
3. O resumo de AO VIVO não desenha saídas nem presença, embora a resposta do
   servidor já traga esses campos após a entrega de reentrada.
4. O caminho pelo chaveiro oferece AO VIVO sem explicar a diferença entre
   autorização do leitor e autorização da conta para o relatório.

## Correção recomendada

Preservar a autorização do relatório completo. Para este evento, identificar
a conta responsável e realizar o vínculo pelo fluxo existente de administração,
com autorização específica e releitura. Não atribuir dono ao primeiro usuário
logado nem abrir o relatório para qualquer aparelho automaticamente.

No frontend, tratar 403 com orientação de acesso ao evento, distinguir falha
de conexão, exibir a versão efetiva do aplicativo e apresentar saídas e saldo
registrado de presença. Cobrir a rota autenticada e o contrato de erro real nos
testes, além do desenho com dados simulados.

Se o comportamento desejado for AO VIVO para o porteiro sem login de dono,
definir explicitamente esse acesso: uma rota de consulta pelo token do aparelho,
limitada ao evento/setores autorizados e aos dados necessários. Busca de
ingressos e exportação de histórico não devem ser liberadas implicitamente
com a consulta de totais. Essa opção altera o contrato de autorização e precisa
ser decidida antes da implementação.

## Estado ao encerrar a análise

Nenhuma alteração em produção, vínculo de conta, permissão, código funcional,
commit ou publicação foi feita nesta análise. Checkout operacional preservado.
Documentação e evidências locais em:
C:\ProjetosLocais\ideal-imposition-control-ao-vivo-20261014.

Evidências ignoradas pelo Git: rascunhos/evento-imagem.json,
rascunhos/ao-vivo-testes.log, rascunhos/ao_vivo_rota_test.ts,
rascunhos/ao_vivo_403.cjs e rascunhos/servidor/.

## Alteração solicitada após o diagnóstico

O usuário solicitou mover AO VIVO da tela principal para as configurações e
autorizou a entrega segura. O botão passa para o topo da configuração do evento;
a consulta retorna às configurações, preservando campos editados e o login
temporário até a saída normal da configuração. O relatório dos eventos
finalizados mantém sua navegação anterior. A autorização do servidor permanece
a mesma; esta mudança de posição não vincula contas nem corrige o cadastro
de acesso do pedido 23390. Os 72 testes de AO VIVO e lista de eventos passaram.
