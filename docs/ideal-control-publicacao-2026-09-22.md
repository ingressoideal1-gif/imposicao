# Ideal Control — publicação de 22/09/2026

## Escopo autorizado

QR genérico de instalação, QR por evento, importação da imagem, senha de seis números por instalação/celular e consulta auditada pela gráfica. Inclui a correção de zeramento anteriormente autorizada. Checkout operacional preservado; trabalho em `ideal-imposition-ideal-control-zeramento`.

## Banco e servidor confirmados

- Alvo: e-deal, `vwbtitjlpelrcnsytzqw`, PostgreSQL 17.4.
- SQL de QR e chave protegida aplicados conforme `ideal-control-sql-pin-aplicado-2026-09-22.md`. Chave preservada na tabela protegida existente, sem exposição do valor.
- `schema_acesso_zeramento_atomico.sql` validado com dados sintéticos em estruturas isoladas na mesma transação, finalizada com ROLLBACK. Exercitados zeramento, descarte de reenvio anterior/igual ao corte, entrada posterior, avanço do marcador e restrição de execução. Não foi realizado teste com conexões simultâneas.
- Migração de zeramento aplicada em transação, `lock_timeout=3s`, `statement_timeout=45s`. Instalação da RPC e dos dois triggers confirmada em nova consulta. Antes/depois: 9 eventos, 24 leituras, zero entradas únicas. Nenhum evento real foi zerado.
- Edge Functions publicadas: `portaria` versão 253, `acesso-interno` 254, `acesso-conta` 268. Todas ACTIVE. `verify_jwt=false` somente na portaria, que usa autenticação própria; true nas duas funções autenticadas.
- Verificação HTTP pública sem dados reais: cadastro/QR malformados retornam 422; edição, consulta de senha pela gráfica e conta sem autenticação retornam 401.
- 66 testes Deno aprovados (configuração, portaria e QR/PIN).

## Publicação web

Versão: v940. Referências dos assets atualizadas pelo módulo `EntregaSegura.psm1`, com normalização das páginas alteradas, incluindo `sw-registro.js` em controle/portaria para atualizar o cache do PWA. A entrega inclui SQL, Edge e frontend: as etapas são executadas separadamente, pois `entrega-segura.ps1` rejeita escopo misto e não aplica SQL.

Testes finais: 335 testes Python/navegador aprovados em 285,28 segundos, incluindo QR/PIN, zeramento, conta, Ideal Control, controle e sintaxe de todo o frontend. As duas verificações de versões uniformes também passaram. Diff e verificação de segredos sem achados. Confirmação de commit e hashes públicos será registrada após propagação.

## Recuperação e limites

Preservar tabelas, instalações, auditoria e a chave ao reverter a interface. Manter RPC e triggers de zeramento enquanto qualquer Edge publicada depender deles. Não apagar dados nem trocar a chave para desfazer o frontend.

Testes de navegador usam rede sintética. Instalação real em Android/iPhone, dois celulares físicos com senhas diferentes e leitura sem internet em evento real continuam como aceite operacional. Agente Windows e impressão física não fazem parte desta publicação.

Este registro atualiza o estado histórico dos documentos anteriores, que descreviam o trabalho ainda local ou o zeramento não aplicado.
