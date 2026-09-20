# Material para revisão do Vibe

Os arquivos daqui **não foram aplicados** e não integram um migrador automático do Imposition. Devem ser incorporados pelo parceiro ao seu repositório, com a numeração e o cabeçalho adotados por ele.

O par `20260907_fundo_apenas_backend.up.sql` / `.down.sql` contém transação, pré-condições e asserções posteriores. Não cria funções nem altera a leitura pública. Revoga EXECUTE de PUBLIC/anon/authenticated e concede a service_role somente nas duas assinaturas indicadas.

O baseline foi atualizado com o ACL informado pelo parceiro: `publicar_fundo_do_pwa` permite postgres/authenticated/service_role; `remover_fundo_do_pwa` permite postgres/PUBLIC/anon/authenticated/service_role. UP confere os destinat?rios de cada fun??o separadamente. DOWN restaura esses grants, mant?m service_role e s? reabre PUBLIC/anon em remover. Ainda se exige propriet?rio/grantor postgres e aus?ncia de grant option para n?o donos; esses detalhes n?o constam do resumo recebido e precisam ser confirmados pelo Vibe. Diverg?ncia aborta a transa??o; n?o remover as asser??es para contorn?-la.

O UP exige o marcador `imposition.fundo_consumidores_validados = 'sim'`, configurado no contexto da migration aprovada. O DOWN exige `imposition.fundo_rollback_publico_aprovado = 'sim'`. Não há comando automático aqui para habilitá-los. O rollback restaura o acesso público anterior; não é a resposta automática a uma falha de implantação.

As rotas administrativas e os consumidores do fundo foram adaptados localmente em painel/acesso-estacao, na ponte Python e no frontend. Deploy e validação nas estações continuam pendentes; o código local não autoriza revogação. Conservar as quatro `link_cliente_*` existentes; o DDL fornecido teve seus hashes conferidos, e seu versionamento sem mudanças permanece a cargo do fluxo acordado com o parceiro, após estabilização.

Validação desta entrega: revisão estática de escopo, assinaturas e transação; não houve execução nem teste em PostgreSQL. Confirmar versão e testar o ciclo UP/DOWN em ambiente autorizado antes de aplicar.
