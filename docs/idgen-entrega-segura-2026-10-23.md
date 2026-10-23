# Entrega segura IdGen — 23/10/2026

Autorização: pedido humano “entrega segura”, após a integração local da janela.
Alvo: Imposition web nos dois domínios operacionais e somente objetos novos IdGen
no E-Deal `vwbtitjlpelrcnsytzqw`. Não inclui instalação/publicação de NewProd,
alterações comerciais ou liberação dos novos pedidos no portal do cliente.

Base remota conferida por fetch: `cd9275c8`. Worktree isolada
`imposition-idgen-menu-20261022`; checkout operacional preservado.
Cache web planejado: v1101, incluindo o import dinâmico do documento.

## Plano de aplicação e recuperação

1. Revisão e PR, com validações específicas e compatibilidade Produção/Piloto.
2. Migração única `sql/idgen_pedidos_editor.sql`, dentro de transação.
   Cria `idgen_app.pedidos_editor` e `public.idgen_editor_operar(uuid,text,jsonb)`.
   Nenhuma linha comercial será alterada; zero pedidos novos na implantação.
   Não há UPDATE/DELETE sobre dados legados. Não aplicar outros SQLs.
3. Comparar `sql/idgen_editor_preflight.sql` antes/depois: ACL/RLS das tabelas,
   funções e políticas de public/auth/storage devem permanecer iguais.
   Conferir tabela vazia, RLS e função acessível apenas a service_role.
4. Publicar exclusivamente `idgen-interno` com JWT e conferir rejeição sem sessão.
5. Integrar frontend por PR; verificar assets públicos com cache-busting nos dois
   domínios. Não confundir publicação web com instalação nas estações.

Falha na migração: transação deve reverter. Após aplicação, rollback preferido
desabilita a entrada/endpoint e preserva documentos; não apaga tabelas.
Não repetir implantação automaticamente se a resposta for inconclusiva.

O comando `entrega-segura.ps1` não executa SQL remoto e rejeita escopo misto;
esta entrega exige etapas próprias de banco/endpoint, com revisão independente
e PR para integração do conjunto. Nenhum bloqueio de branch ou teste será removido.

## Evidências anteriores à aplicação

- Objetos novos ausentes, colunas ERP compatíveis, user_id único na tabela de
  permissões; 15 operadores com papel admin/atendimento/designer.
- Hash tabelas/ACL: `21d6e8513168ec701ff758192636a3a3`.
- Hash funções legadas: `992f2db1e0e6ed09e9d2d7d3f27aa5cb`.
- Hash políticas: `8ae2bb790783509f5b0020eff79f6581`.
- 12 testes Node aprovados; Chromium completo: `%TEMP%/idgen-editor-browser-GXuISN`.
- Migração em PostgreSQL temporário aprovada: `%TEMP%/idgen-editor-test-047yyvsn`.
- `deno check` aprovado usando o binário já instalado no checkout operacional.
- Revisão de segredos e whitespace sem achados.

A bateria completa encontrou três recursos ausentes na lista de sincronização.
Foi corrigida a lista `PAINEL_ARQUIVOS` em `security_config.py`, incluindo também
o módulo importado `idgen-pedidos.mjs`. Isso apenas registra os recursos; não
distribui um agente novo nem comprova funcionamento nas estações instaladas.
Repetição completa: Produção e Piloto, cada um com 868 testes Python aprovados,
2 ignorados, e todos os harnesses de interface aprovados. Relatório local:
`dist/entrega/idgen-canais.json`. Testes Chromium finais após versionamento de
cache: `%TEMP%/idgen-editor-browser-B3By21` e `%TEMP%/idgen-menu-browser-KqFV6E`.

Limites mantidos: 5 MiB por arquivo, 16 MiB por documento/corpo de requisição.
Validação autenticada real e envio à produção gráfica não foram realizados.

## Estado efetivo da entrega

- Commit de implementação `88c12f61d5a0e9148a14d856f37b789c0fe79148` enviado.
- PR [194](https://github.com/ingressoideal1-gif/imposicao/pull/194) aberto,
  ainda não integrado. CI de compatibilidade em execução na última consulta.
  Check Cloudflare Pages da branch aprovado; não é publicação de produção.
- Migração específica aplicada no E-Deal em transação. Tabela e RPC confirmadas.
- Pós-aplicação: os três hashes legados acima permaneceram exatamente iguais.
- Tabela nova com zero pedidos e RLS ativo. `anon`/`authenticated` sem EXECUTE
  na RPC; `authenticated` sem SELECT na tabela; `service_role` com EXECUTE.
- Deploy exclusivamente de `idgen-interno` tentado e recusado pelo Supabase:
  HTTP 403, `Missing required permission(s): edge_functions_write`.
  O comando terminou com falha. Nenhum sucesso de deploy desse endpoint é alegado.
- Frontend de produção ainda não integrado/publicado. Não houve instalação ou
  publicação de agente NewProd. Não executar a migração novamente na retomada.

Para retomar: atualizar o acesso conectado com a permissão necessária (sem
enviar tokens em chat), publicar somente `idgen-interno`, verificar JWT/CORS e
recusas sem sessão, aguardar todos os checks do PR e integrar. Só então comparar
os assets em `imposition.ai-ideal.com.br` e `imposicao.pages.dev`, registrar
deployment/tag e validar com uma sessão real de operador sem expor credenciais.
