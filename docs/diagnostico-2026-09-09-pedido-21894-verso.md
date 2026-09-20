# Pedido 21894: verso indevido no modelo Foto

Diagnóstico em 09/09/2026, com consultas GET somente de leitura no projeto de
produção `vwbtitjlpelrcnsytzqw`, limitado aos modelos do pedido e à numeração
vinculada ao Foto. Utilizada a configuração pública do frontend; nenhum arquivo
de credenciais, dado pessoal, conteúdo de elemento ou arquivo de arte foi exposto.
Nenhum dado remoto, código funcional ou publicação foi alterado.

## Evidência atual

- Modelo Foto: `pedidos_modelos.id = 1000940`, `id_int = 21894`.
- Campo persistido: `verso_tipo = "FRENTE E VERSO"`.
- Numeração vinculada: `e1137352-9db7-491b-ae43-9deeb3d637e9`, nome `1000940`,
  `is_custom = true`, tipo `SEQUENCIAL`, `print_mode = "front"`.
- Os cinco elementos de desenho estão em `face = "front"`: dois PDF, um FOTO
  e dois TEXT. O elemento METADATA também registra `print_mode = "front"`.
- O texto `gabarito_operacional` ainda aponta para o gabarito base, mas o
  reconciliador preserva o ID da numeração personalizada. Isso é comportamento
  previsto em `frontend/cor-numeracao-do-modelo.js`.

## Causa confirmada

O HTML público em `https://imposition.ai-ideal.com.br/cliente.html` referencia
`/cliente.js?v=845`. No JavaScript publicado, linha 1381:

```javascript
const itemVerso = !_semVerso(item.verso_tipo) || numIsDuplex;
```

A numeração atual responde `numIsDuplex = false`, mas o campo antigo do modelo
responde verdadeiro para o outro lado do OU. O resultado continua sendo
`itemVerso = true`, que ativa o bloco e o rótulo de frente e verso no portal.

O carregamento do painel usa outra precedência: quando encontra a numeração,
resolve o verso por ela. Assim, painel e portal podem apresentar faces diferentes
para o mesmo registro. Atualizar a página não elimina essa divergência persistida.

Na fonte local, `onItemNumSelect` e o trecho de atualização da amostra convertem
para Frente os valores antigos `FxVerso` e `VERSO COMUM`, mas deixam de fora
`FRENTE E VERSO`. Isso é uma lacuna adicional compatível com a permanência do
campo antigo; esta investigação não atribui a uma ação ou usuário a gravação
histórica desse valor.

## Validação e limites

O trecho de decisão foi extraído do JavaScript publicado e executado em Node,
com quatro entradas sintéticas e assertivas:

| verso_tipo | Numeração com verso | Portal mostra verso |
| --- | --- | --- |
| FRENTE E VERSO | Não | Sim |
| FxVerso | Não | Sim |
| Frente | Não | Não |
| Frente | Sim | Sim |

Quatro assertivas passaram. O caso real tem exatamente as condições da primeira
linha. Não foi aberta a página com token nem exercitado o fluxo de aprovação;
a confirmação cobre os dados atuais e a decisão do código publicado.

## Encaminhamento

Uma correção deve unificar a precedência de frente/verso entre painel e portal
e contemplar os valores legados ao salvar a alteração. Preservar casos sem
numeração resolvida e os modos legítimos de verso. Corrigir somente o campo do
pedido seria um ajuste pontual, sem resolver a divergência geral.

Nenhuma correção foi aplicada: o pedido foi de análise. Uma eventual escrita
no modelo deve ser autorizada e precedida de prévia, filtro pelo ID e pelo pedido,
plano de recuperação e leitura posterior, conforme AGENTS.md.

## Correção autorizada e publicada

Após o diagnóstico, o usuário autorizou executar e publicar a correção.
Implementação isolada em `imposicao-cliente-verso-21894`, preservando o checkout
original. PR https://github.com/ingressoideal1-gif/imposicao/pull/31 integrada,
commit `9d9ccca76e19912dcff0e7ae6d31cb1c91ddb872`.

O portal agora prioriza a numeração resolvida, como o carregamento do painel,
e normaliza a face exibida. Sem numeração disponível, conserva a configuração
salva. Seleção e desenho do painel também deixam de conservar valores legados
ao usar uma numeração de frente. Arquivos originais são preservados.

Validação: 86 testes aprovados; regressão demonstrada contra a base anterior;
Chromium com HTML real e dados sintéticos confirmou uma face no caso corrigido
e duas no controle duplex, com capturas desktop e 390px. Nenhum fluxo de
aprovação real foi acionado.

Publicação confirmada por HTTP 200 em `/cliente.html`, `/` e `/producao`, todos
referenciando scripts v847. Os scripts públicos coincidem com os arquivos
validados (normalizando apenas CRLF/LF):

- cliente.js: `c6205f5d640b7dac3eb3bb917e4eab1642d09f02e2fe4245768e29a5a60f3605`.
- script.js: `872b9c833f0cc276ebc82ac5aeb3433f7179d53c7d764a37cd69c7f94fe08724`.

Leitura posterior do modelo 1000940 confirmou numeração front, nenhum elemento
back e resultado `verso = false` ao executar a decisão do portal publicado com
esses dados. O campo persistido continua FRENTE E VERSO: nenhum SQL foi necessário
para corrigir a exibição. A próxima seleção usa o salvamento normal corrigido.

Registro versionado da implementação e recuperação:
`docs/registro-2026-09-09-cliente-verso.md` no worktree e na PR. Para recuperar,
reverter o commit e publicar com nova versão de scripts; nenhuma migração ou
remoção de arquivo foi feita.
