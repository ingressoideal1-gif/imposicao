# Mapas de Teatro — revisão e correções locais, 02/10/2026

## Estado da entrega

- Worktree: `C:\ProjetosLocais\ideal-imposition-mapas-teatro-20261002`.
- Branch: `fix/mapas-teatro-integridade-20261002`.
- Base verificada por fetch de `origin/main`: `1a40bdf87807c59f7e6717049ed719b40fca5379` (web v996).
- Revisão local concluída; entrega segura do frontend autorizada pelo usuário em 02/10/2026. Este documento registra a preparação anterior à publicação; a evidência de versão, commit e arquivos públicos será registrada ao concluir a rotina.
- O checkout operacional foi preservado, incluindo os arquivos preexistentes não rastreados.

## Diagnóstico reavaliado

Os testes sintéticos confirmaram perda de cadeira por colisão, perda de edição após falha de salvamento seguida de consulta bem-sucedida, chamadas a `renderMapa` inexistente, contagem incorreta, mapas excluídos em outro cliente retidos no cache e busca inválida com símbolos de expressão regular.

O diagnóstico inicial sobre impressão precisava de uma distinção: o frontend mantinha o CSV antigo, mas `app.py`, na geração, relê o mapa persistido e reconstrói seus assentos. O teste inicial provava desatualização de tela, sem comprovar sozinho saída física incorreta. A correção atual atualiza a tela e relê o mapa antes de calcular/enviar o trabalho; os testes de geração usam transporte simulado.

A revisão encontrou também propriedades do primeiro setor não preenchidas na reabertura, seletores do Pedido ligados ao seletor da Imposição, seletor do Pedido dentro de ancestral oculto, múltiplos loops de animação ao editar tipos, histórico incompleto da borracha e colisões ao acrescentar fileiras.

## Comportamento corrigido

- Movimento com setas verifica todos os destinos antes da alteração, preservando movimentos simultâneos de grupos e desfazer.
- Inclusão de fileiras prepara uma cópia da configuração e verifica conflitos antes de aplicar; rejeita intervalos inválidos e rótulos repetidos. Inserção após cadeira selecionada preserva o deslocamento dos vizinhos.
- Restauração impede duplicar o rótulo de um assento.
- `renderMapa` desenha um frame; o loop de animação é único. Coordenadas de clique/zoom consideram as dimensões reais do canvas.
- Reabertura preenche as propriedades do primeiro setor; desfazer ajusta o índice do setor; a borracha registra o estado antes da primeira remoção da ação.
- Lista, editor e totais enviados usam cadeiras existentes, excluindo assentos marcados como apagados; os intervalos de fileiras deixam de definir o total.
- Salvamento envia `name`, `config`, `total_lugares` e `lugares_por_setor`. No Supabase exige exatamente uma linha retornada e releitura dos campos persistidos, com comparação independente da ordem das chaves JSON.
- Falhas mantêm a edição aberta. Um ID retornado antes de falhar a releitura é preservado, evitando novo INSERT na tentativa seguinte. Cliques simultâneos são protegidos.
- Cópia e exclusão exigem confirmação de persistência; uma cópia não confirmada permanece recuperável no editor.
- O caminho local reutiliza a configuração `api` existente e confirma a gravação por releitura.
- Sincronização consulta páginas completas e ordenadas. Após leitura bem-sucedida, o servidor define os cadastros existentes; rascunhos legados `local_*` são preservados. Consultas anteriores à gravação não sobrescrevem seu resultado.
- Busca trata símbolos literalmente. Nomes e legenda são escapados ao montar HTML; opções de mapa usam `textContent`.
- Migração de cadeiras antigas preserva posições em conflito e setores ausentes; gravação é bloqueada quando restam cadeiras sem conversão segura.
- Imposição e Pedido usam seus respectivos seletores e resumos. A seleção do Pedido é acessível quando o tipo é TEATRO.
- A configuração alterada de um mesmo ID invalida os dados da prévia. Respostas atrasadas de outro mapa/tipo são descartadas; uma falha pode ser repetida.
- Geração com TEATRO exige mapa salvo e não vazio, relido antes do trabalho. Um modelo comum não envia o ID retido no seletor oculto.

## Arquivos

Fonte: `frontend/mapas.js`, `frontend/script.js`, `frontend/pedido.js`, `frontend/index.html`.

Regressões: `tests/mapas_teatro_harness.js`, `tests/mapas_teatro_browser_harness.js`. Ambos registrados em `tests/test_harness_de_imposicao.py`. As fixtures de `impressao_combinada_fluxo_harness.js` carregam as funções reais novas; `csv_fatia_do_modelo_harness.js` reconhece a condição de TEATRO mantendo a conferência da fatia do banco nas duas telas.

## Validação

- 46 regressões específicas aprovadas, incluindo falhas, repetição, colisões, migração legada, paginação, resposta atrasada e geração real da função do Pedido com transporte simulado.
- Chromium/Puppeteer: HTML do editor e código reais, nove cadeiras em três filas ímpares, clique no canvas, colisão, reabertura, erro/repetição de salvamento, resumos reais da Imposição e Pedido e visibilidade do seletor. Zero erros JavaScript. APIs e desenho de prévia de impressão simulados.
- Dez harnesses relacionados aprovados: mapas (Node e browser), impressão combinada (prévia e fluxo), faixa/modelo ausente, fatia CSV, modelos somados, aproveitamento, número da página e carregamento do Pedido em navegador.
- Sintaxe de 79 arquivos JavaScript do frontend aprovada, seguida da conferência do arquivo alterado na revisão final e dos dois testes novos.
- `git diff --check` aprovado.
- `pytest` indisponível: nenhum dos dois Python 3.14 encontrados possui o módulo; os harnesses foram executados diretamente com Node. Não houve instalação de dependências.

Reprodução nesta worktree, reutilizando dependências existentes:

```powershell
$env:NODE_PATH = 'C:\ProjetosLocais\ideal-imposition\node_modules'
node tests/mapas_teatro_harness.js
node tests/mapas_teatro_browser_harness.js
git diff --check
```

## Limites e continuação

O SQL disponível define políticas abertas para `producao_mapas_teatro`. A configuração aplicada, grants, papéis e regra de isolamento por empresa não foram consultados. Nenhuma política foi alterada nem uma migração antiga reescrita. A adequação depende de inspeção autorizada do ambiente e definição da regra de acesso; o SQL disponível sozinho não comprova as permissões atuais.

Na preparação, ainda sem comprovação de publicação web, instalação do agente, escrita real no Supabase, PDF do motor ou impressão física. A entrega pública autorizada segue o fluxo de integração/versionamento, validação e comprovação de arquivos públicos nos dois domínios. O painel local do NewProd requer sua própria atualização.

As mudanças estão isoladas e revisáveis via `git diff`; a base e o checkout operacional permanecem disponíveis para recuperação. Não substituir arquivos completos de uma versão publicada futura por esta cópia sem integração seletiva.
