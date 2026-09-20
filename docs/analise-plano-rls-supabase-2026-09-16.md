# Análise e plano de segurança RLS — 16/09/2026

## Escopo e conclusão

Inspeção estática da árvore local `C:\ProjetosLocais\ideal-imposition`, branch `main`, HEAD `a306ff06`, incluindo alterações preexistentes. Não representa necessariamente o código publicado. Nenhum banco, dado real, segredo ou estação foi acessado; nenhum SQL, teste de integração, deploy ou alteração de aplicação foi executado. Esta entrega acrescenta somente este documento.

Há definições locais permissivas e dependências que impedem uma revogação indiscriminada sem interromper a operação. A prioridade é comprovar a configuração instalada e eliminar os caminhos de acesso direto que contornam as permissões da aplicação. **Não há evidência nesta análise de exploração nem comprovação de exposição atual em produção.** Comentários antigos sobre medições são histórico, não uma medição de hoje.

O contrato documentado em `docs/plano-execucao-supabase-2026-09-07.md` permite à equipe identificada trabalhar nos pedidos das empresas do grupo, conforme a funcionalidade autorizada. Não introduzir automaticamente segregação por empresa ou vínculo operador–pedido. Confirmar quais empresas pertencem a esse domínio e impedir acesso externo a ele. O cliente do portal deve acessar somente o pedido autorizado pelo link. Uma sessão Supabase válida, isoladamente, não comprova vínculo com a equipe.

## Achados e prioridades

Prioridades indicam ordem de investigação/correção. P0 significa contenção urgente **se o caminho estiver exposto no ambiente instalado**; P1 significa correção prioritária coordenada; P2 significa endurecimento complementar. Não são classificações de incidentes confirmados.

| Prioridade | Evidência local | Consequência e encaminhamento |
|---|---|---|
| P0 | `sql/schema_acessos_locais.sql:68` desliga RLS; a política em `:86` é permissiva. Há scripts posteriores de fechamento em `rls_acessos_e_permissoes.sql` e `rls_passo3_fechar_leitura.sql`. | Risco de regressão por reaplicação de script antigo sobre códigos/permissões. Conferir privilégios efetivos de `imposition_acessos_locais` e `imposition_user_permissions`, inclusive herança de PUBLIC e caminhos por views/RPCs. Não reaplicar a sequência antiga. |
| P0 | `frontend/cliente.js:1280` abre por RPC com token; `:1383` lê modelos por `id_int`; `:199` atualiza modelo por ID; `:114`/`:131` leem e atualizam artes por pedido. `cliente-confirmacoes.js:390` escreve diretamente no chat. | A chamada de abertura não cria uma autorização vinculada aos requests diretos seguintes. Se permissões instaladas permitirem esses requests como anon, o filtro controlado pelo navegador não limita um atacante ao pedido do link. Substituir por operações que validem o link em cada chamada. Acesso direto presente no código não prova que o banco o aceita hoje. |
| P1 | `sql/link_cliente_fechar_a_chave_publica.sql:79` define `FOR ALL TO authenticated USING (true) WITH CHECK (true)`; o mesmo arquivo concede SELECT/INSERT/UPDATE. | Com esses grants e policy, qualquer sessão desse papel pode alcançar links/tokens, independentemente da grade Imposition. Migrar gestão de links para autorização por funcionalidade e limitar leitura de tokens. O papel authenticated inclui usuários que podem não ser funcionários. |
| P1 | `sql/schema_catalogo_fontes.sql:66–78` permite INSERT/UPDATE/DELETE sem restringir papel ou linha. | RLS ligado não restringe essas operações se houver grants correspondentes. Escrita deve passar por operador autorizado; leitura pública apenas dos campos efetivamente necessários. |
| P1 | `sql/rls_fase1_catalogo.sql` e `sql/schema_catalogo.sql:167–200` permitem escrita geral a authenticated. A primeira remove apenas policies de nomes específicos. | Autenticação não substitui permissão de editar catálogo. Policies permissivas remanescentes podem manter acesso amplo. Revisar todas as policies efetivas por comando; não excluir cegamente políticas do parceiro. |
| P1 | `sql/fundo_do_pwa.sql:141` define ALL para PUBLIC e concede EXECUTE público às funções de publicação/remoção. O rascunho `sql/revisao_vibe/20260907_fundo_apenas_backend.up.sql` altera somente ACLs de funções. | Fechar RPCs não basta se a tabela ou Storage continuarem graváveis diretamente. Coordenar fechamento de RPCs, DML da tabela e escrita dos arquivos, preservando leitura pública do fundo. O estado instalado pode diferir desse SQL antigo. |
| P1 | RPCs `link_cliente_*` usam SECURITY DEFINER e `search_path = public`; `link_cliente_funcoes.sql:66–71` e `link_cliente_pedido.sql:83–89` conferem número/token/ativo e usam LIMIT 1. | Há controle de link, mas é necessário revisar dono, ACL efetiva, schemas graváveis, unicidade, relações e efeitos de triggers. Nas verificações citadas não há expiração temporal. Não revogar as quatro RPCs atuais sem substituição compatível. |
| P1 | `supabase/functions/_compartilhado/banco.ts:49` usa service_role; `sessao.ts` decodifica JWT confiando na validação do gateway; `supabase/config.toml` declara verify_jwt para painel. | Chamadas privilegiadas dependem das guardas do servidor, pois service_role contorna RLS. Conferir configuração efetivamente publicada e autorização por rota. RLS não corrige uma rota privilegiada que autorize demais. |
| P1 | `frontend/script.js:39844`, `:39868`, `:41603` usa URLs públicas para artes/arquivos de impressão; `sql/storage_sem_listagem_anonima.sql:51` restringe SELECT anon em alguns buckets. | Bloquear listagem não torna privado um arquivo servido por bucket público. Confirmar configuração real, classificar documentos e migrar material sensível para acesso privado com autorização. |
| P2 | `frontend/script.js:40035` gera token de seis caracteres, com `crypto.getRandomValues` e redução módulo 36. | Espaço máximo de cerca de 31 bits, com distribuição ligeiramente desigual. Planejar tokens de pelo menos 128 bits gerados no servidor, hash armazenado, revogação, expiração definida e limites de tentativa. Preservar links existentes durante transição controlada. Não atribuir o problema a Math.random. |

Outro cuidado: `producao_numeracoes` não é necessariamente apenas geometria pública. `cliente.js` carrega conteúdo de numerações para renderização, e os comentários do fluxo mencionam `elements` e `csv_data`. Classificar campos, previews, bancos de dados de numeração e URLs antes de manter SELECT público. Não copiar esses conteúdos para o inventário.

## O que já existe e deve ser aproveitado

- Rotas locais para propostas, cadastro e pagamentos em `_compartilhado/propostas.ts`, registradas em `painel` e `acesso-estacao`, com permissões e projeções explícitas. O operador local é revalidado no servidor. O código declara acesso sem filtro de empresa, em conformidade com o contrato interno documentado.
- Transporte em `frontend/supabase-config.js` que não deve voltar ao acesso anon quando a rota autorizada falha. A busca literal desta análise não encontrou chamadas SDK diretas às quatro tabelas `propostas`, `clientes`, `enderecos` e `pagamentos_v2` no frontend. Isso não cobre nomes dinâmicos, REST manual, backend, cópias `painel/` nem versões instaladas.
- Proteções e rascunhos de grants de fundo, testes de propostas/permissões e documentação de contratos. A existência local não comprova deploy nem validação no banco.
- Permanecem acessos diretos a modelos, artes, itens e chat. O inventário precisa incluir também `pedidos_bancos`, `pedidos_modelos_banco`, `propostas_os`, `propostas_os_setores`, links, usuários, impressão e catálogos; as sete tabelas do plano anterior não encerram toda a superfície RLS.

## Modelo de acesso proposto

| Identidade | Caminho e autorização |
|---|---|
| Visitante sem link | Somente recursos deliberadamente públicos e projeções mínimas; nenhum DML comercial, de catálogo, de links ou permissões. |
| Cliente com link | RPC/endpoint de escopo fechado; validar link ativo, prazo quando implementado, pedido, modelo e ação em cada request. Não aceitar PATCH arbitrário nem autoria/status livre. |
| Usuário autenticado sem vínculo Imposition | Recusar acesso operacional Imposition. Preservar separadamente as permissões legítimas de outros consumidores do ERP. |
| Equipe Imposition | Identidade comprovada, grade obtida no servidor, autorização por funcionalidade e domínio empresarial autorizado. RLS/grants compatíveis nos acessos que permanecerem diretos. |
| Estação | Canal autenticado do agente, operador ativo e permissão por ação. Segredo do agente não deve equivaler a autorização humana irrestrita. Nunca distribuir service_role. |
| Backend privilegiado | Operações limitadas, entrada validada, autorização antes do acesso, filtros e projeções explícitos, autoria derivada da identidade e auditoria sem tokens. |

RLS controla linhas, não oferece sozinha uma lista de campos editáveis. Proteger colunas críticas por grants de coluna, separação de recursos ou RPCs restritas. Em UPDATE, revisar linha original (`USING`) e estado resultante (`WITH CHECK`), incluindo troca de pedido/modelo/empresa. Manter cálculos, financeiro, numeração e estados existentes.

## Plano de execução e critérios de passagem

### 1. Obter fotografia somente de metadados do ambiente

Responsável: equipe do banco/Vibe, com apoio Imposition. Antes de qualquer acesso remoto, confirmar projeto, ambiente e autorização de leitura. Obter:

- Versão PostgreSQL, schemas expostos na Data API e configuração efetiva das Edge Functions.
- Tabelas com RLS/FORCE RLS, donos, roles privilegiados e grants de tabela/coluna/schema, inclusive PUBLIC, heranças e privilégios padrão.
- Policies completas: comando, papéis, permissiva/restritiva, USING e WITH CHECK. Conferir `pg_class`, `pg_policies`, ACLs e privilégios efetivos, não apenas presença de policies.
- Views, materialized views e dependências; modo invoker/definer; funções com assinatura completa, dono, SECURITY DEFINER, search_path e EXECUTE efetivo. Triggers e recursos tocados pelas mutações previstas.
- Configuração de buckets e policies de `storage.objects`, recursos Realtime/publicações e demais consumidores do ERP, jobs e agentes.
- Relatório Security Advisor como auxílio; alertas não substituem a avaliação de alcance efetivo.

Não exportar linhas de negócio, códigos, tokens, URLs assinadas ou corpos que contenham segredos. Se o corpo de uma função precisar de revisão, tratar o material em acesso restrito. Inventário deve ter data, ambiente e origem. Saída: matriz objeto × identidade × operação × consumidor, com decisões do parceiro. Nenhuma tabela fica liberada para revogação apenas por não aparecer numa busca local.

### 2. Tratar riscos imediatos confirmados

Responsáveis: banco e manutenção Imposition. Priorizar códigos/permissões, acesso externo a links e alterações anônimas em pedidos/arquivos. Preparar contenção específica, com substituição funcional ou suspensão temporária do recurso afetado acordada com a operação. Não prolongar exposição crítica confirmada esperando toda a modernização.

Separar scripts históricos de migrações aplicáveis em uma futura alteração autorizada; documentar supersessão. Capturar baseline antes de alterar grants/policies. A ausência de SELECT por RLS pode resultar em lista vazia; tratar esse caso explicitamente nos clientes. Não fixar toda a lógica em um código HTTP: recusas de privilégios podem variar conforme a identidade.

### 3. Completar rotas internas e operações do portal

Responsável: Imposition; contratos de banco e triggers: Vibe. Adaptar artes/modelos/chat/itens/setores e depois os demais acessos inventariados. Reaproveitar canais existentes. Para cada operação, definir entrada permitida, saída mínima, identidade, permissão, registros atingidos e efeitos indiretos.

No portal, resolver o pedido a partir do link no servidor e conferir modelo/arte pertencentes a ele. Validar revisão aprovada, impedir aprovação de versão obsoleta, garantir idempotência e transação quando houver múltiplas gravações. Revisar gatilhos que repercutem em propostas/financeiro antes de transportar escritas. Não substituir regras de status por novos valores.

Preservar `link_cliente_abrir`, `link_cliente_pedido`, `link_cliente_status` e `link_cliente_visto` até migração e validação dos consumidores. Para SECURITY DEFINER, preferir referências qualificadas e search_path seguro, dono de privilégio mínimo compatível e EXECUTE nominal; revisar PUBLIC e privilégios padrão. Verificar unicidade do vínculo em vez de confiar em LIMIT 1 para resolver ambiguidade.

Saída: implementação local revisável, contratos completos e testes com dados sintéticos. Exigir exatamente um registro quando a operação individual assim requer; alterações de conjunto precisam de cardinalidade esperada explícita. `data: []` não pode produzir confirmação visual de gravação.

### 4. Preparar migrações pequenas e coordenadas

Responsável: banco/Vibe. Um conjunto por domínio, com pré-condições que abortem em caso de baseline diferente. Revisar grants e policies em conjunto, incluindo políticas permissivas sobrepostas. Não copiar o rollback antigo que desliga RLS ou reabre escrita pública.

Ordem proposta, ajustável após inventário: permissões/códigos; links e portal; dados comerciais; catálogos/fontes; fundo; arquivos e impressão. Domínios independentes podem avançar sem aguardar os demais, desde que os consumidores correspondentes estejam resolvidos. Views devem respeitar o chamador quando aplicável e compatível com a versão PostgreSQL; outras precisam de ACL e projeção próprias.

Cada lote deve declarar ambiente, objetos, grants antigos/novos, consultas afetadas, estimativa de linhas alcançáveis, transação, limites de espera por lock, validação e recuperação. Preferir nenhuma alteração de dados. Mudanças de tokens/constraints exigem planejamento próprio e levantamento de duplicidades autorizado.

### 5. Validar em ambiente isolado autorizado

Não presumir homologação existente. Providenciar ambiente e schema representativos com dados sintéticos e triggers necessários antes de executar testes SQL. Instalações/dependências e alterações de backend ficam para a implementação autorizada.

| Teste | Resultado necessário |
|---|---|
| Anon sem link, REST direto e RPC fora da lista | Sem leitura sensível ou escrita; incluir consulta sem filtro, contagem e relacionamentos. |
| Sessão válida sem permissão Imposition | Sem acesso operacional; nenhuma elevação alterando metadados de usuário ou campos no corpo. |
| Operador autorizado e operador sem permissão | Caminho legítimo funciona; operação vedada falha também quando chamada fora da interface. |
| Cliente A tentando pedido/modelo/arquivo de B | Recusa mesmo alterando IDs e filtros; link não autoriza outros recursos. |
| Link inválido, revogado, expirado quando aplicável | Recusa em leitura e mutação; revogação durante sessão aberta também funciona. |
| Mudança de vínculos por UPDATE e campos extras | Impedida; entrada não permite editar preço, permissão ou autoria incidentalmente. |
| Arte obsoleta, repetição, concorrência e erro de trigger | Sem aprovação indevida, duplicidade ou gravação parcial. |
| JWT forjado/vencido, agente sem segredo e operador inativo | Recusa antes do acesso privilegiado; confirmar gateway publicado em validação posterior. |
| Lista vazia, 401/403 e indisponibilidade | Sem sucesso visual falso e sem liberar acesso local por perda da lista. |
| Storage: download/listagem/upload/upsert/delete | Autorização por operação e recurso, incluindo sobrescrita de arquivo alheio. |
| ERP, painel, portal e estação compatíveis | Consulta, aprovação, correção, chat, fontes, acabamento e impressão preservados; sem alteração financeira. |

Executar testes como anon e usuários reais sintéticos via API, além de testes SQL de policy; testar só como postgres/service_role não comprova RLS. Conferir planos/índices das condições de autorização e latência em massa representativa. Testes simulados existentes não comprovam o banco instalado.

### 6. Publicar compatibilidade e fechar por domínio

Após autorização de implementação/publicação: disponibilizar rotas compatíveis, publicar frontend, distribuir agente e comprovar atualização das estações. Publicação web não prova instalação do NewProd nem atualização de `painel/`.

Somente após testes de consumidores e janela aprovada, aplicar o lote de restrições correspondente. Comparar metadados antes/depois e validar identidades autorizadas e recusadas no ambiente permitido, sem testes destrutivos contra pedidos reais. Acompanhar 401/403/42501, vazios inesperados, erros de portal, filas e falhas de Storage, sem registrar tokens ou dados pessoais.

Recuperação: manter versões de aplicação compatíveis com o banco fechado; reverter somente a mudança específica para um estado seguro conhecido ou suspender a função afetada. Não reabrir anon, desabilitar RLS ou distribuir service_role como solução de emergência. Qualquer exceção de risco exige decisão própria, escopo e prazo.

## Critério de conclusão e próximo passo

Concluído somente quando a matriz de acessos estiver aprovada; acessos indevidos recusados por todos os caminhos relevantes; fluxos legítimos preservados; alterações versionadas/aplicadas no ambiente correto; consumidores atualizados e validação posterior registrada. Alertas restantes precisam de justificativa por objeto, nunca de supressão genérica.

O próximo passo é a fotografia autorizada dos metadados do projeto Supabase. Este relatório conclui a análise local e o planejamento, mas não libera a aplicação dos SQLs existentes. Estimativas antigas de 10–15 dias úteis dependiam de contratos; não constituem um prazo atualizado para todo este escopo.

## Referências técnicas consultadas

Grants e RLS são camadas complementares; views e funções precisam de revisão própria. Ver [proteção da Data API](https://supabase.com/docs/guides/api/securing-your-api).

Policies, papéis, bypass por service_role e cuidados com metadados de usuário: [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security). Política permissiva ampla não é neutralizada simplesmente acrescentando outra permissiva mais restrita.

EXECUTE e search_path em funções privilegiadas: [Database Functions](https://supabase.com/docs/guides/database/functions). Permissões do chamador em views: [Views](https://supabase.com/docs/guides/database/views).

Downloads em bucket público permanecem públicos mesmo com restrições de listagem: [Storage Buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals). Escrita e outras operações exigem revisão própria: [Storage Access Control](https://supabase.com/docs/guides/storage/security/access-control).
