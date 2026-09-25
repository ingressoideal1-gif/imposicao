# Integridade do cadastro e da resolução de Formatos

## Escopo e entrega local

Correções dos quatro pontos autorizados após a análise da página Formatos.
Base: `origin/main` disponível localmente, commit `47fe5b9b` (v959 / agente 1.2.340).
Branch: `fix/formatos-integridade-20260925`.
Worktree: `C:\ProjetosLocais\ideal-imposition-formatos-integridade`.
O checkout operacional e seus arquivos não rastreados foram preservados.

## Comportamento corrigido

1. **Duplicação:** copia também saída, paginação, modo de blocos, folhas,
   profundidade, rotação padrão e todos os campos de capa. Preserva valores zero.
   A cópia recebe identidade própria; não reutiliza `id`, `id_formato_num` nem
   datas do original.
2. **Persistência do cadastro:** criar/editar exige retorno da linha esperada e
   releitura dos campos enviados. Erros de coluna em Formatos interrompem a
   operação, sem repetir uma escrita omitindo o campo. O caminho pela API local
   também exige releitura. Falha de confirmação mantém o formulário aberto e
   não anuncia sucesso; uma escrita pode ter ocorrido antes de uma falha de
   leitura, portanto a mensagem orienta recarregar antes de repetir.
3. **Fila:** os padrões do ERP completam apenas campos ausentes. Redesenhar
   Pedido/Imposição preserva formato e saída existentes, usa a saída do formato
   de cada item e não agenda gravações durante a renderização. Um grupo com
   formatos diferentes não exibe um formato único como se fosse comum a todos.
4. **Formato ausente:** preparação de impressão, amostras compostas, exportações,
   Criador de Arte e portal deixam de usar o primeiro formato do catálogo ou a
   medida arbitrária de 180 × 50 mm. A preparação limpa controles anteriores e
   registra erro; a exportação não baixa PDF parcial devido a essa falha; o
   editor recusa abrir/salvar sem formato. A prioridade do painel é mantida:
   cor, numeração, formato do item e, na ausência destes, produto vinculado ao ERP.
   Vínculo explícito para formato excluído não é substituído por outro cadastro.

O caminho de impressão agora usa o mesmo resolvedor da prévia. Correspondência
aproximada por nome/tamanho não é usada nessa preparação: modelos sem vínculo
identificável precisam ter o cadastro corrigido, em vez de receber um palpite.
O portal tem implementação equivalente porque não carrega `script.js`.

## Arquivos funcionais

- `frontend/script.js`: confirmação do cadastro, duplicação, resolução e fila de
  Imposição, amostras e exportações.
- `frontend/pedido.js`: aplicação dos padrões na fila compartilhada de Pedido.
- `frontend/cliente.js`: resolução e aviso de formato ausente no portal.
- `frontend/criador-arte.js`: bloqueio de abertura/salvamento sem formato.

## Validação local

Todos os dados e transportes dos testes são sintéticos/simulados.

- `node tests/formatos_integridade_harness.js --baseline`: falha esperada na
  versão original, reproduzindo a duplicação sem padrões e configurações de capa.
- `node tests/formatos_integridade_harness.js`: 15 cenários aprovados, incluindo
  retorno vazio, linha incorreta, coluna ausente, releitura divergente, API local,
  seleção preservada, ERP, portal, três exportações e amostra sem formato.
- `node tests/producao_por_cor_formato_saida_harness.js`: aprovado no navegador;
  abertura interna/externa, formato padrão/escolhido e saída padrão/escolhida.
- `node tests/navegacao_seguranca_harness.js`: 5 regressões aprovadas.
- `node tests/editor_persistencia_segura_harness.js`: aprovado.
- `node tests/integridade_impressao_harness.js`: 24 verificações aprovadas.
- `node tests/escala_da_arte_harness.js`: 49 verificações aprovadas.
- `node tests/cliente_pdf_duplicate_back_harness.js`: aprovado.
- `node tests/controles_pdf_harness.js`: 41 verificações aprovadas no navegador.
- `node tests/fila_do_pedido_harness.js`: 52 verificações aprovadas no navegador.
- `node --check` nos quatro arquivos funcionais e `git diff --check`: aprovados.

Os testes de navegador usaram o Puppeteer já instalado no checkout operacional,
via `NODE_PATH`, sem instalar dependências. Os harnesses que extraem funções
receberam as novas dependências reais. O teste de abertura também foi adaptado
aos wrappers de carregamento já existentes na base v959.

## Limites e continuação

- Não houve acesso ao banco compartilhado, migração, commit, publicação ou build
  do agente. Nenhum dado real foi alterado.
- Não foi executado pytest: o Python do venv indicado pelo projeto não existe
  no checkout operacional. A validação realizada foi em Node e navegador.
- `formato_id` e `saida_id` dos modelos continuam em memória no fluxo Supabase
  existente. Esta entrega impede a sobrescrita ao redesenhar; não adiciona
  persistência dessas escolhas após recarga/F5 nem novas colunas.
- A releitura foi validada com transporte simulado. Não comprova políticas ou
  dados atuais do banco, publicação, atualização das estações ou impressão física.
- Próximo passo de entrega: revisar este diff e publicar somente mediante
  autorização; depois confirmar os arquivos públicos com cache-bust e hashes.
