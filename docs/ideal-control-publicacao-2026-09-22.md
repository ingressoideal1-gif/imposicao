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

Testes finais: 335 testes Python/navegador aprovados em 285,28 segundos, incluindo QR/PIN, zeramento, conta, Ideal Control, controle e sintaxe de todo o frontend. As duas verificações de versões uniformes também passaram. Diff e verificação de segredos sem achados. Commit funcional `dc534455`, tag `v940`, integrados em `origin/main`. Cloudflare Pages confirmou sucesso no deployment `a6d25d79-800e-4140-84f4-7f019c6be35c`.

## Recuperação e limites

Preservar tabelas, instalações, auditoria e a chave ao reverter a interface. Manter RPC e triggers de zeramento enquanto qualquer Edge publicada depender deles. Não apagar dados nem trocar a chave para desfazer o frontend.

Testes de navegador usam rede sintética. Instalação real em Android/iPhone, dois celulares físicos com senhas diferentes e leitura sem internet em evento real continuam como aceite operacional. Agente Windows e impressão física não fazem parte desta publicação.

Este registro atualiza o estado histórico dos documentos anteriores, que descreviam o trabalho ainda local ou o zeramento não aplicado.

## Evidência pública final

- 28/28 comparações SHA-256 normalizadas (BOM/quebras de linha), com cache-buster, iguais aos arquivos locais: 14 caminhos em cada domínio `imposition.ai-ideal.com.br` e `imposicao.pages.dev`. Incluem painel, páginas do aplicativo, novos módulos QR/PIN, edição, portaria e service worker. Resultado em `evidencias/ideal-control-v940-public-verification.json`.
- Chrome real automatizado na URL publicada: botão de QR e módulo de senha carregados, service worker ativo `/ic/sw.js?v=940`, cache `ideal-control-940`. Após desligar a rede no navegador, `/ic/controle.html` abriu com QR/PIN disponíveis e zero erros JavaScript. Nenhum cadastro ou edição real foi feito nessa conferência.
- A primeira tentativa do teste de navegador foi interrompida pela navegação automática ao ativar o service worker; aguardada essa ativação, a repetição passou. Não foi necessário mudar o produto.
- A abertura offline da interface não comprova a operação física completa; permanece o aceite Android/iPhone e evento real descrito acima.
