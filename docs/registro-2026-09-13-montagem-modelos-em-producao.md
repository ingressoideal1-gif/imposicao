# Montagem: modelos de todos os pedidos em produção

## Solicitação

Ao selecionar `Pedidos em produção` no campo Pedido, o campo Modelo aguardando deve reunir os modelos aguardando de todos os pedidos em produção. Cada opção deve mostrar, nesta ordem: Pedido, Modelo, Nome e Quantidade.

## Implementação

- `Pedidos em produção` passou a ser uma opção real do seletor, identificada internamente por `__todos__`.
- A lista geral carrega somente pedidos Em produção compatíveis com o Formato selecionado.
- São realizadas até quatro cargas de pedido simultâneas para evitar uma rajada de consultas.
- Apenas modelos com status de impressão Aguardando entram no seletor.
- As opções usam `Pedido · Modelo · Nome · Quantidade`; o indicador `COM VERSO` ou `Só frente` permanece ao final.
- O valor interno da opção geral combina pedido e modelo. Ao escolher, o estado recupera os dois IDs separadamente, evitando conflito entre modelos de pedidos distintos.
- Ao trocar o Formato, a lista geral é recarregada. Respostas de uma seleção anterior não podem substituir o resultado do formato atual.
- A escolha de um pedido específico continua mostrando apenas os modelos daquele pedido, com o mesmo rótulo completo.

## Validação local

- 214 verificações do navegador para a tela Montagem.
- 3.328 verificações do núcleo da Montagem.
- 136 testes dirigidos de Montagem, faces do PDF, identificação e compilação JavaScript.
- Cobertos: filtro de pedido e formato, exclusão de modelos impressos/correção, par pedido/modelo único, ordem dos quatro campos, quantidade, aviso de verso e troca de formato durante carga.

## Fundo da janela e indicação de verso

A janela da Montagem passou a compartilhar as regras visuais da prévia do painel de produção: fundo escuro translúcido no modo normal e fundo verde `#597d73` quando a montagem é frente e verso. Como a compatibilidade já impede misturar modelos com e sem verso, um único indicador `Modelo com Verso` descreve toda a folha.

A faixa superior de 48 px também é compartilhada com o painel de produção. O cálculo da escala agora lê os paddings reais da janela, para manter o papel inteiro dentro da visualização. Ao voltar para uma montagem apenas frente, classe, aviso e fundo de verso são removidos.

Validação atualizada: 217 verificações da tela, incluindo comparação direta dos fundos calculados com o painel de produção, aviso único, encaixe do papel e retorno ao estado apenas frente.

## Publicação

Publicação autorizada na interface v863. O escopo é somente frontend: seletor geral de modelos, rótulos completos e regras visuais da prévia. Não há alteração do motor Python, banco de dados ou instalador NewProd. A entrega deve ser confirmada pela implantação da Cloudflare e pela comparação dos arquivos públicos após a propagação.
