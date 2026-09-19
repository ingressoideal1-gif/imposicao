# Segunda contenção — TRUNCATE anônimo em pagamentos

Aplicada em e-deal produção (`vwbtitjlpelrcnsytzqw`) em 16/09/2026 às 08:10 -03:00: `REVOKE TRUNCATE ON TABLE public.pagamentos_v2 FROM anon`. SQL: `05_pagamentos_sem_truncate_anon.sql`, SHA-256 `F1BF0ACF200E054BAAFAE87DDB0BDB15E66011026D7162B7B6A6B703AA366693`.

Nenhum TRUNCATE foi executado em produção; nenhuma linha de negócio foi alterada. Trata-se da retirada de um privilégio administrativo. RLS não protege TRUNCATE, conforme a [documentação PostgreSQL 17](https://www.postgresql.org/docs/17/ddl-rowsecurity.html). A existência do grant não comprova uma rota HTTP pública de exploração: esta etapa reduz privilégios e não declara ter reproduzido um ataque pelo PostgREST.

## Revisão e testes

Consultados somente catálogos de funções public, sem executar funções da aplicação. A única função cujo corpo continha TRUNCATE foi `gerar_sudeste_matriz`, invoker e executável por anon; seu alvo é sudeste_matriz. A outra função invoker com SQL dinâmico, `buscar_em_todas_tabelas`, faz consulta e não contém TRUNCATE. Os trechos inspecionados tiveram literais omitidos; nenhum dado de negócio foi consultado. A busca não comprova ausência de SQL composto em todos os serviços externos, nem cobre rotinas em todos os schemas. Usuários authenticated/service_role foram preservados.

Cinco testes em PostgreSQL 17.5/PGlite, usando exclusivamente dados sintéticos, passaram: sucesso com SELECT e UPDATE de coluna preservados; revisão ausente; TRUNCATE herdado de PUBLIC; herdado de grupo; DELETE inesperadamente reaberto. O teste de sucesso reproduz TRUNCATE permitido antes e negado depois, e confirma TRUNCATE dos demais papéis em transações revertidas. O aplicador também passou nos cenários HTTP simulados em PowerShell 7 e Windows PowerShell 5.1: prévia, sucesso, alvo incorreto, falha HTTP e pós-verificação divergente.

## Evidências

Pasta restrita a evidências locais fora do Git: `C:\ProjetosLocais\auditorias-rls\e-deal`.

- Antes: `20260916T111046130Z-fdb8462d-metadados.json`.
- Recibos: prefixo `20260916T111051748Z-9bcb220074234f3aa73bf2bb17477054`, sufixos `-intencao-truncate-pagamentos.json` e `-resultado-truncate-pagamentos.json`.
- Depois: `20260916T111101616Z-e7228e90-metadados.json`.

Comparação de todas as seções, desconsiderando contexto/horário: somente `acessos` e `acl_tabelas` mudaram, pela retirada de TRUNCATE de anon em pagamentos. Demais grants, ACLs de coluna, funções, policies e triggers permanecem iguais. Estado anon: SELECT=true, DELETE=false, TRUNCATE=false; INSERT/UPDATE por coluna permanecem presentes. O canal de pós-verificação confirmou TRUNCATE de authenticated e service_role preservado.

O script usa transação, timeout, asserção do estado deixado pela revisão 04, comparação de todos os ACLs de tabela e de coluna. Herança que mantém TRUNCATE aborta a transação. Em falha após envio, conferir metadados antes de repetir. Não reabrir o grant automaticamente.

## Limites e sequência

Continuam pendentes leitura e escrita sensíveis por coluna, RPCs privilegiadas, Storage e outros domínios. Esta alteração não elimina todos os caminhos de exclusão por serviços privilegiados nem certifica a usabilidade integral. Não houve deploy de frontend/agente. O roteiro `validacao-erp-sem-codigo-rls.md` descreve como obter a evidência de integração sem acesso ao código do ERP.
