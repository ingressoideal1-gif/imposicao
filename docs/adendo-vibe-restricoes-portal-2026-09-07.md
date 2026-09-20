# Adendo do Vibe: restrições para a adaptação

Fonte: esclarecimentos enviados pelo parceiro na conversa e arquivos imposition-adendo-1.md, imposition-anon-e-padrao-rpc.md e verificar-md5-ddl.mjs recebidos pela Desktop. O adendo apresenta a estrutura das seis tabelas em quadros e descreve os efeitos dos triggers; não inclui seus corpos SQL. Não houve consulta ao banco.

## Fundo do PWA

O ACL informado permite EXECUTE a authenticated/postgres/service_role em publicar_fundo_do_pwa, e a PUBLIC/anon/authenticated/postgres/service_role em remover_fundo_do_pwa. A ausência de publicar na lista de funções abertas ao anon está explicada. A mesma chave de projeto pode acompanhar chamadas com identidades diferentes: a sessão autenticada altera o papel efetivo.

O par SQL em sql/revisao_vibe foi ajustado para esses destinatários, incluindo rollback distinto por função. O adendo confirma proprietário postgres; grantor e grant option ainda exigem confirmação. Os consumidores e rotas de fundo foram adaptados localmente. A aplicação continua condicionada a deploy e validação dos consumidores.

## Restrições das novas RPCs públicas

- Não devolver propostas_chat.autor_email nem produtos.valor_custo. Respostas terão campos explicitamente permitidos.
- Leituras públicas de chat devem exigir visivel_externo = true e o pedido validado pelo link. Não depender apenas do filtro de visibilidade.
- Escritas devem definir conscientemente a visibilidade no contrato. Não aceitar autor_uid, autor_email ou visivel_externo arbitrários do navegador.
- Sem autor_uid, o trigger descrito atribui autoria a Sistema. Não inventar identidade de funcionário para representar o cliente. A representação de mensagem do cliente e sua visibilidade ficam pendentes de revisão do DDL e do contrato antes da implementação.
- Preservar o literal de verso_tipo informado como SÓ FRENTE e os identificadores sensíveis a maiúsculas, incluindo "Produtos_pkey", "nomeReal", "valorUnt" e "valorFixo", após conferir suas definições no DDL recebido.
- Os índices ausentes relatados em produtos_proposta.id_int, propostas_chat.id_int, produtos.categoria e produtos.ativo serão avaliados separadamente pelo Vibe. Não criar índices remotos nem presumir benefício sem revisar consultas e estrutura.

## Evidências pendentes

O script fornecido foi inspecionado: lê os arquivos SQL indicados, normaliza o texto e calcula hashes localmente, sem acesso à rede ou ao banco. Os quatro blocos SQL do documento original foram extraídos sem alteração em arquivos temporários e passados explicitamente ao Node. Execução concluída com código 0:

| Função | Linhas normalizadas | MD5 conferido |
|---|---:|---|
| link_cliente_abrir | 29 | 6025ceb77e6da2e4bdc3fe5326a14371 |
| link_cliente_pedido | 213 | 95f976914c2358ef794346120dbe3c60 |
| link_cliente_status | 36 | bb7678d5e50ecc0e7b7abb51b99225af |
| link_cliente_visto | 36 | 7652ba17ada7ba2ff70d2537ae3323f4 |

A diferença da tentativa anterior era a remoção do ponto e vírgula final de `$function$;`, agora explicitada no passo 7. A conferência atesta igualdade do texto normalizado com os hashes fornecidos, não a origem no banco nem igualdade dos comentários.

## Pontos para concluir os contratos

- O identificador do link é UUID; modelo_id é bigint, representado como string decimal no contrato. O token é varchar(12), não UUID. id_int do link é texto e o dos modelos/artes é integer. Validar a conversão e o vínculo antes da mutação.
- O índice do par numero_pedido/token não é único. As novas RPCs devem recusar correspondência ambígua, sem escolher uma linha arbitrariamente.
- Não há coluna explícita de versão da arte nas estruturas recebidas. O parâmetro versao_arte permanece pendente: definir com o parceiro uma revisão que mude quando a arte for substituída, antes de implementar a aprovação concorrente. Não tratar updated_at nullable como uma versão garantida sem comprovar todos os caminhos de escrita.
- pedidos_artes admite várias linhas por pedido, inclusive várias com setor nulo. Definir a linha/setor afetado e sua relação com o modelo; não usar LIMIT 1 nem atualizar todas automaticamente nas novas decisões.
- Escritas em pedidos_modelos propagam estado para outras tabelas. Escritas em produtos_proposta disparam recálculo financeiro, inclusive quando a mudança parecer apenas de arte. Revisar os corpos dos triggers envolvidos antes de fechar o SQL de mutação; preservar as regras de cálculo existentes.
- Autoria e visibilidade das mensagens do cliente continuam pendentes do contrato, conforme o parceiro confirmou. A migration de eventual campo novo pertence ao Vibe.

As quatro link_cliente_* existentes permanecem preservadas. Nenhuma revogação das tabelas comerciais está liberada por esta revisão.
