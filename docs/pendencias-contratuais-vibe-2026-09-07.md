# Próximo contrato com o Vibe — para revisão, não enviado

As quatro funções existentes tiveram os MD5 conferidos com o script fornecido. Os SQL de privilégios do fundo foram ajustados ao baseline distinto de publicar/remover. Nada foi aplicado no banco. Seguem as definições necessárias para concluir as novas RPCs sem presumir comportamento dos triggers.

## Revisão da arte

Precisamos de uma revisão persistida que permita rejeitar aprovação de uma arte que mudou desde sua exibição. Proposta para avaliação: revisão UUID gerada no servidor, retornada pela consulta e enviada como versao_arte na decisão. A decisão compara a revisão sob lock, junto da validação de modelo e pedido; revisão diferente retorna conflito sem escrita.

Antes de fechar a migration, precisamos definir o conjunto de mudanças que renova a revisão: arte e verso, amostras, seleção CSV, numeração, quantidade e demais parâmetros que alteram a prévia aprovada. Todos os consumidores que alteram esses campos devem acionar a mesma regra no banco. Não vamos usar updated_at nullable como substituto sem essa garantia. O formato de hash v1 permanece; o tipo canônico de versao_arte será fechado após aprovação desta proposta.

## Qual briefing recebe a decisão

pedidos_artes não é único por pedido; o índice parcial por pedido/setor não cobre setor nulo. Precisamos confirmar o vínculo inequívoco entre pedidos_modelos e pedidos_artes e os efeitos esperados de aprovar/reprovar um modelo. Não vamos selecionar um briefing com LIMIT 1 ou alterar todos por conveniência. Se for necessário um identificador de vínculo novo, a migration e a regra de preenchimento dos registros existentes pertencem ao Vibe.

## Mensagem do cliente

Precisamos distinguir origem de mensagem de identidade de funcionário. Proposta para revisão: campo de origem com valor CLIENTE e referência ao link validado, ambos definidos pela RPC no servidor, nunca aceitos livremente do navegador. Os triggers devem preservar essa origem sem consultar usuarios nem inventar autor_uid. O texto exibido pode ser “Cliente”; autor_email não sai em resposta pública.

Proposta de visibilidade: textos enviados pelo cliente nas correções ficam visíveis ao cliente do mesmo pedido; eventos internos de sincronização/auditoria permanecem internos. A leitura sempre exige link ativo, pedido correspondente e visivel_externo = true. Essa decisão ainda não foi aplicada nem altera o default existente. O parceiro deve revisar os campos e adaptar os triggers na sua migration antes de implementarmos essa escrita.

## Definições ainda necessárias

- Corpos instalados das funções de trigger que atuam nas escritas previstas em pedidos_modelos, pedidos_artes, propostas_chat e produtos_proposta, incluindo as funções que elas chamam para sincronização/recálculo. A estrutura recebida informa nomes e efeitos, mas não suas implementações.
- Estrutura de propostas_os_setores e regras/triggers envolvidos nas operações de apoio que ainda precisam migrar.
- Migration proposta da tabela de idempotência com os seis campos, incluindo nomes e tipos definitivos. O contrato aceito é 7 dias da primeira conclusão, SHA-256/JCS calculado no servidor, resultado JSONB de até 16 KiB, UUID global, transação única e expurgo horário pelo Vibe.
- Grantor e grant option do ACL das duas RPCs de fundo. O proprietário postgres já foi confirmado. As asserções continuam abortando em divergência.

## Critérios para aceitar as novas RPCs

Token errado e link revogado retornam a mesma recusa; par ambíguo é recusado. Validar o link novamente em replay. Serializar a validação do link com a revogação e a mutação; validar uma vez e escrever depois sem proteção concorrente não basta.

Para mutações: pedido/modelo/briefing/revisão válidos, efeitos equivalentes aos atuais, nenhum campo financeiro arbitrário, nenhuma autoria fornecida pelo navegador, nenhuma resposta com custo ou e-mail de funcionário. Requisição repetida devolve recibo armazenado; mesmo UUID com payload diferente conflita. Falha em trigger, resultado ou deduplicação desfaz toda a transação.

O Imposition prepara o SQL revisável. O Vibe revisa, numera e aplica migrations com asserções e rollback. Não criar funções diretamente pelo painel/MCP. As quatro link_cliente_* existentes permanecem como estão.
