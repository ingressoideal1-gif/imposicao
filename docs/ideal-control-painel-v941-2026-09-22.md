# Ideal Control — adaptação do painel ao fluxo de dois QRs

## Diagnóstico e escopo

A versão 940 já possuía os dois QRs e o PIN por celular, mas o painel ainda escondia a instalação até selecionar cliente, orientava ativação pela senha da conta e dava pouco destaque ao envio do evento. A conta por e-mail e sua senha provisória podiam ser confundidas com a senha de edição do celular.

Reavaliação e implementação autorizadas; o usuário autorizou também concluir e publicar. Worktree isolada `ideal-imposition-ideal-control-painel`, base `489abb3f`. Checkout operacional preservado.

## Alterações

- Instalação e QRs disponíveis no cabeçalho, inclusive sem cliente selecionado. QR genérico desenhado ao iniciar a tela.
- Cartão de entrega no pedido com três passos: instalar, definir a senha no celular e ler/importar o QR do evento. Acesso direto ao envio e aos celulares.
- Aba “Celulares e senhas”, instruções atualizadas, conta por e-mail explicitamente opcional e distinção entre as duas senhas.
- Instruções para copiar e anexar à imagem do evento, com nome do evento, link de instalação e orientação para concluir o download com internet.
- Geração de QR indisponível sem evento ou com evento inativo/finalizado. Revogação permanece acessível em “Gerenciar QRs já enviados”. Não é afirmado que o QR já foi enviado ou que um celular concluiu o download.
- Consulta do PIN com erro recuperável, confirmação do aparelho e formato, botão “Ocultar senha” e ocultação ao trocar de aba ou reconstruir os cartões. Resposta atrasada não revela senha após a troca de aba.
- Estilos limitados a `#view-ideal-control`. As páginas cliente/produção receberam somente a referência atualizada ao CSS compartilhado.

Sem mudanças em SQL, Edge Functions, permissões ou regras de negócio. Não houve envio de mensagens, cadastro de aparelhos ou consulta de PIN real na validação.

## Validação

- 77 testes existentes de Ideal Control e QR/PIN aprovados.
- 6 regressões novas aprovadas: instalação sem cliente, evento sem conta, bloqueio de evento inativo, repetição após falha de PIN, cópia das instruções, decodificação do QR genérico e resposta atrasada após troca de aba.
- Revisão visual com dados sintéticos em 1440 e 390 pixels; diálogo sem transbordamento horizontal. As verificações existentes cobrem também 1600, 1024 e 768 pixels.
- `entrega-segura.ps1 verificar -Escopo Frontend`: VALIDADA, incluindo sintaxe, escopo, segredos e diff.
- Versão 941 preparada com o módulo de referências de assets e normalização do index; 80 verificações finais aprovadas (75 verificações de sintaxe, versão uniforme do index e quatro larguras de layout). São 158 testes distintos aprovados no total.

## Publicação e recuperação

Commit funcional `e5b903a0`, tag `v941`, integrados em `origin/main`. Cloudflare Pages confirmou sucesso no deployment `05bdb3b6-bb3d-4799-bfb7-3860d2a2d565`. Após propagação, 12/12 hashes SHA-256 normalizados conferiram nos domínios `imposition.ai-ideal.com.br` e `imposicao.pages.dev`: index, cliente, produção, CSS e os dois módulos alterados. Evidência: `evidencias/ideal-control-v941-public-verification.json`. Recuperação: reverter somente os arquivos desta adaptação, preservando as funções e o banco da versão 940.

A conferência de navegador usa dados sintéticos; o aceite com celulares físicos e evento real permanece separado desta publicação.
