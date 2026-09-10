# Portal: confirmação imediata e avanço de abas — 10/09/2026

Entrega e Nota salvam a decisão no clique, usando a gravação existente em
`pedidos_artes`. O botão permanece verde e passa a **Confirmado** somente após
sucesso; falha mantém o estado anterior, mostra aviso e permite nova tentativa.
O avanço é Entrega → Nota → Orçamento. Confirmar dados não aprova artes.

As decisões independentes ficam em `observacoes.confirmacoes_portal`, sem
migração. O selo conjunto `entrega_dados` torna-se `APROVADO` quando ambas estão
confirmadas, sem depender de Finalizar pedido. Alterar e Desfazer também persistem;
o selo conjunto acompanha a decisão. As observações dos demais itens são mantidas.
A trava durante gravações impede cliques concorrentes nesta página; não constitui
controle transacional entre navegadores ou edições simultâneas do atendimento.

Ao reabrir, as decisões são recuperadas. Pedidos antigos continuam usando os selos
e textos legados; `ALTERADO` solicita nova conferência. A abertura avança de etapas
concluídas mesmo quando indicadas no hash. Modelos já aprovados contam para a
abertura mesmo antes do fechamento geral. Com todas as etapas concluídas, abre
Orçamento. Links informativos e retorno manual às abas continuam disponíveis.

## Preparação e validação

- Worktree isolado de `origin/main` em `c68707a5`, preservando paginação de banco,
  frente/verso e todas as alterações alheias do checkout original.
- Assets modificados do portal em `v849`: `cliente.js`, `cliente-shell.js` e
  `cliente-confirmacoes.js`; demais versões preservadas.
- Na base de publicação: 70 testes pytest aprovados (sintaxe de todo frontend e
  quatro harnesses do portal), mais 51 verificações de pendências e 45 de correção.
- Regressões cobrem aprovação parcial/completa, reabertura, erro retornado,
  exceção de rede, UPDATE vazio, cliques repetidos, recebedor obrigatório,
  correção, desfazer e navegação. Chromium sintético validou verde/Confirmado,
  avanço de abas e seis cenários de abertura/retorno manual na preparação local.

## Entrega e recuperação

Publicação autorizada pelo usuário pelo fluxo de branch/PR para `main` e integração
existente do Cloudflare Pages. Conferir após o deploy o HTML e os três JS públicos
em `https://imposition.ai-ideal.com.br`, comparando com os arquivos validados.
Commit/merge isolado não comprova propagação pública.

Não foram usados pedidos reais para aprovar dados, nem alterados SQL, permissões,
Edge Functions ou agente Windows. Validação real no aparelho do cliente não faz
parte das verificações sintéticas. Recuperação por reversão dos arquivos desta
entrega em novo commit/deploy; manter as observações já gravadas, ignoradas pelo
código anterior, sem apagar dados comerciais.
