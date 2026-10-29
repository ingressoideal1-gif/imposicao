# Link do Cliente: etapas e confirmações visíveis

Implementação local em 29/10/2026, baseada em origin/main (8ceb6fec), na worktree
`imposition-portal-etapas-20261029`. Checkout operacional preservado.

## Comportamento

- Trilha informa a etapa pendente (Arte, Entrega, Nota), o que falta e oferece
  navegação para a próxima conferência quando ela está em outra aba.
- Entrega, retirada e nota usam os botões existentes, fixos acima das abas no
  celular e no rodapé no desktop, enquanto a decisão estiver pendente.
- Rótulos explícitos: Confirmar entrega / Confirmar dados da nota. Azul pede
  ação; o verde de confirmação continua dependendo de gravação bem-sucedida.
- Reserva de espaço permite rolar os últimos dados acima da barra. Ao focar um
  campo, os botões voltam ao fluxo para liberar espaço ao teclado virtual.
- Falha de gravação aparece junto aos botões; validações, travas contra clique
  repetido, solicitações de correção e funções de persistência são preservadas.
- O aviso após aprovar artes menciona a conferência seguinte de nota. Seu botão
  apenas navega, sem confirmar dados automaticamente.
- Trocar de aba volta ao topo do contêiner que efetivamente rola no portal.
- Conferências registradas ainda pedem Finalizar pedido quando necessário.
  A mensagem de conclusão depende do estado finalizado; correção recebe texto
  próprio e não aparece como aprovação concluída.

## Validação

Dados sintéticos e rede bloqueada nos testes novos de navegador.

- `portal_etapas_browser_harness.js`: 320/390/1100 px, botões e abas sem
  sobreposição, último dado alcançável, teclado, modal, erro visível, clique
  repetido, navegação Entrega -> Nota, finalização, correção, bloqueio,
  reabertura e popup após arte (sem escrita automática). Passou.
- `portal_confirmacoes_harness.js`: 143 verificações passaram.
- `portal_abas_harness.js`: 146 verificações passaram.
- `portal_pendencia_harness.js`: 53 verificações passaram.
- `portal_persistencia_harness.js`: 36 cenários passaram.
- Harnesses de endereço e faturamento passaram, inclusive navegador de endereço.
- `test_harnesses_do_portal.py`: 7 passaram; 2 falhas preexistentes nos harnesses
  de carga/status/chat, reproduzidas também lendo as fontes intactas de HEAD:
  `state.ordens[0]` indisponível e selo vazio em vez de `Aprovação parcial`.
  Esses testes não foram desabilitados nem alterados para ocultar a falha.
- O novo harness foi incluído no executor Python do portal.
- `conferir_duas_versoes.py --base HEAD`: concluído com sucesso nos canais
  produção e Piloto; em cada canal, 911 testes Python passaram (2 ignorados),
  além dos harnesses de compatibilidade. Uma advertência preexistente de
  depreciação do TestClient/httpx. Nenhum build ou instalação foi executado.
- Sintaxe dos cinco arquivos JavaScript alterados e `git diff --check`: passaram.

## Entrega

Sem commit, publicação, alteração de banco, instalação ou pacote do agente.
A mudança está preparada localmente; publicação exige o fluxo autorizado de
entrega e a revisão das falhas preexistentes acima.
