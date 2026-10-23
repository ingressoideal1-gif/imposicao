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
Primeira repetição: Produção Python 868 aprovados, 2 ignorados. Demais resultados
e identidades de publicação devem ser registrados após conclusão.

Limites mantidos: 5 MiB por arquivo, 16 MiB por documento/corpo de requisição.
Validação autenticada real e envio à produção gráfica não foram realizados.
