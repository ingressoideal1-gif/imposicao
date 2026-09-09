# Correção do pedido ativo no envio direto — 09/09/2026

O banner consultava `state.activeOSId`/localStorage, mas a tela de artes registra
o pedido aberto em `state.amostrasOSAtivo`. Isso causava Nenhum pedido ativo
selecionado mesmo com um pedido visível.

O envio passa a usar exclusivamente `amostrasOSAtivo`, definido ao abrir o
pedido e limpo por `clearAmostrasOS`. Não usa seleção antiga de outro contexto.

Três testes de integração passaram. A regressão do Chrome agora reproduz o
estado real (somente amostrasOSAtivo), com seleção antiga no armazenamento e
em activeOSId: envia o pedido aberto e bloqueia quando o pedido foi fechado.
Sintaxe JS e diff aprovados. Sem envio real ou acesso a dados reais nos testes.

Frontend v846. Correção localizada, sem mudança no backend ou template do e-mail.
Recuperação: reverter o commit e republicar o frontend.
