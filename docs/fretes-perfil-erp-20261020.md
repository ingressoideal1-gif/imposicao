# Fretes: reconhecer ADM do ERP

Diagnóstico por leitura em produção: a conta informada possui perfil ERP `super_admin` ativo e perfil Imposition `visualizador`. O menu consultava apenas `papelAtual()`, que usa o perfil Imposition.

A correção adiciona `imposition_fretes_adm()`, uma consulta autenticada que reconhece ADM do Imposition ou `admin`/`super_admin` ativo no ERP. O módulo Fretes e a proteção da navegação usam esse resultado. Falha de consulta ou revogação fecha o acesso adicional. Não altera perfil, grade de permissões ou acesso às demais telas.

Testes PGlite: super_admin ERP com visualizador local, perfil inativo, Financeiro, ADM local, ausência de sessão e acesso anônimo. Chromium: menu/navegação, falha da consulta de perfil, consulta e edição de fretes existentes. Sintaxe e diff aprovados.

RPC aplicada e conferida no e-deal em 20/10/2026; a definição normalizada coincide com a fonte, authenticated pode executar e anon não pode. A consulta com contexto autenticado da conta afetada retornou true. As 920 tarifas e a grade de permissões mantiveram os fingerprints. Frontend em publicação v1090, por PR. Não há escrita em cadastros ou tarifas. A política existente de `transportadoras` é permissiva; esta mudança apenas corrige reconhecimento da interface e não endurece RLS. Uma revisão dessa política tem escopo próprio.

Evidências em `dist/entrega/fretes-*.json` (não versionadas). A verificação de banco não equivale a um login real da usuária. Para recuperação, restaurar o frontend anterior; a função de consulta pode permanecer sem efeito nas telas antigas.
