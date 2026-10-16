# NewProd 1.3.11 — cópia local

Base: tag `agente-v1.3.10`. Distribuição única para todas as estações, mantendo os aliases históricos do mesmo MSI.

O resumo local aguarda até 30 segundos, em vez de cinco. Consultas simultâneas compartilham a mesma requisição. Quando apenas as estatísticas falham, os comandos de iniciar e pausar permanecem disponíveis aos operadores autorizados. Um comando aceito não passa a ser tratado como falha por causa da consulta posterior.

A abertura do pedido aguarda uma preparação anterior por até 30 segundos, preservando todas as validações de revisão e integridade. A preparação automática não espera pela abertura humana. O comando de iniciar pode retomar um serviço de coleta encerrado quando seus workers já terminaram e a estação está livre; não força a retomada durante atividade ou encerramento em andamento.

As correções pertencem ao painel embutido no agente, servido pela porta 9001. A publicação não exige trocar o site Cloudflare. Não incorpora nem reverte mudanças independentes do dashboard publicado na web.

## Validação

1.055 testes Python, dois pulados e dois subtestes aprovados em cada perfil Produção, Piloto e Oficial; 20 harnesses JavaScript aprovados por perfil. Mais 38 testes de publicação, manifesto e instalador aprovados após a troca de versão. Evidência: [testes](evidencias/newprod-1311-testes.json).

O navegador aceitou resumo recebido após 5,5 segundos, manteve os comandos após falha, preservou permissões e não duplicou a consulta em andamento. Concorrência e retomada foram reproduzidas na fonte original e passaram na correção.

## Limites e recuperação

Esta correção não identifica a causa do MSI 1603 da TEX-01. Sem o log do instalador não se pode afirmar que a nova publicação resolva essa falha de instalação. Não houve reinício forçado, alteração de filas ou impressão física.

A ativação dos manifestos depende da auditoria do MSI e de tamanho/SHA-256 dos dois downloads públicos. Para recuperação depois da adoção, republicar uma fonte revisada com versão superior; não sobrescrever o MSI nem forçar downgrade.

## Publicação confirmada

Os dois downloads públicos completos conferiram por tamanho e SHA-256 antes da ativação. Os três manifestos foram relidos com cache-buster e confirmam 1.3.11, sem restrição por estação.

MSI: 196.685.824 bytes; SHA-256 `d25e56b7e09a00bbbd2d369ce070c056632100b344a291687370dc4cb04cc6b8`. Fonte rastreada na tag `agente-v1.3.11`. [Auditoria do pacote](evidencias/newprod-1311-pacote.json) e [publicação](evidencias/newprod-1311-publicacao.json).

Nenhuma estação foi reiniciada ou instalada à força. A instalação e a verificação real dos pedidos continuam dependentes da atualização de cada estação. O site Cloudflare não foi alterado nesta entrega.
