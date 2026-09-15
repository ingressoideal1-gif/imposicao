# Registro — revisão profunda da Montagem — 15/09/2026

## Resultado local

A página Montagem foi revista como editor de produção, preservando o contrato
do motor e separando duas intenções que antes dividiam os mesmos controles:
reposição manual e planejamento recomendado.

## Mudanças aplicadas

- dois modos explícitos, com o manual como padrão;
- compatibilidade por formato, material/cor, saída, bloco e paginação;
- candidatos de vários pedidos materializados em série com o banco correto;
- entrada de posições transacional, com faixas espaçadas e limite anti-congelamento;
- validador único antes do rascunho, resumo, payload e geração;
- recusa explícita de célula órfã e de posição acima da tiragem atual;
- nova conferência visível ao lado do botão de gerar;
- rascunho local válido por 24 horas;
- otimizador determinístico por orçamento de operações e detecção de ciclos;
- nome de arquivo com pedidos, quantidade de modelos, data e hora;
- navegação vinculada à permissão de produção existente;
- melhorias de teclado, foco e controles semânticos.
- parser, validador e tradução para o motor isolados em `MontagemDominio`, sem
  dependência de DOM ou estado global e no mesmo asset já conhecido pela estação.

## Contratos preservados

- `QTD` continua sendo quantidade física; não há divisão por `ticket_qtd`;
- posições combinadas continuam deslocadas pela tiragem integral das artes;
- o payload continua `multi_artes` com `refazer_repetir=true`;
- a ordem das células continua independente da ordem dos modelos;
- nenhuma mudança grava status, quantidade, numeração ou dados comerciais;
- Python, motor, APIs, banco, Edge Functions e schema não mudam.

## Provas locais

- `node tests/montagem_harness.js`: 3.569 verificações aprovadas;
- `node tests/montagem_tela_harness.js`: 245 verificações aprovadas em Chrome;
- `pytest -n 0 tests/test_montagem.py tests/test_o_javascript_do_frontend_compila.py tests/test_painel_estacao.py`:
  99 testes aprovados.

O harness de tela usou o Puppeteer já instalado no checkout de trabalho
anterior por meio de `NODE_PATH`; nenhuma dependência foi instalada ou alterada.

## Limites e entrega

O trabalho está somente na worktree
`C:\ProjetosLocais\ideal-imposition-montagem-profunda`, branch
`codex/montagem-profunda`. Não houve commit, push, PR, publicação, atualização
de estação nem impressão física. O checkout principal permaneceu intocado.
