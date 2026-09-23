# Ideal Control: correção local do zeramento — 22/09/2026

## Estado da entrega

Implementação local no worktree `C:\ProjetosLocais\ideal-imposition-ideal-control-zeramento`,
branch `fix/ideal-control-zeramento-20260922`, base `54a85d630ca14f529f996b3a7e48a143d7cf1b9e`.
O checkout operacional e seus arquivos preexistentes foram preservados.
Sem commit, publicação ou acesso ao banco compartilhado nesta tarefa.

## Defeitos e regra aplicada

O diagnóstico reproduziu em Chromium/IndexedDB real um ingresso recusado como
`JÁ ENTROU` após receber a marca de zeramento e recarregar a página. A carga era
zerada, mas a loja `entradas` permanecia com a entrada anterior.

Também reproduziu, com as funções Edge originais e banco simulado, uma leitura
feita offline antes do zeramento que era enviada depois e recompunha a contagem.

Foi mantida a regra do botão existente: o zeramento apaga as leituras anteriores;
as pendências feitas até o instante do corte recebem o mesmo tratamento quando
chegam atrasadas. Elas só saem da fila local após confirmação do servidor. Leituras
posteriores ao corte permanecem válidas. Não foi criado um histórico separado das
leituras zeradas, pois o comando existente já elimina esse histórico.

O corte compara `momento` da leitura com `entradas_zeradas_em`, incluindo igualdade,
em instantes com fuso. `momento` continua sendo a hora do aparelho, conforme o
contrato atual; relógio incorreto no celular continua sendo uma limitação desse
contrato. Não foi introduzido um protocolo novo de relógio ou de geração do evento.

## Implementação

- `frontend/portaria-deposito.js`: grava carga, entradas e totais no mesmo commit
  do IndexedDB; remove somente marcas de entrada até o corte e preserva as novas.
  Reaplicar uma marca repara também o estado deixado pela versão anterior.
  Respostas de evento diferente ou anteriores à marca aplicada não sobrescrevem
  os dados atuais. Leituras em voo consultam uma chave pequena de zeramento antes
  de marcar uso; não carregam a lista inteira de credenciais a cada leitura.
- `frontend/portaria.js`: só troca o estado em memória depois do commit; incrementa
  o contador local após a gravação de uma leitura vigente.
- `sql/schema_acesso_zeramento_atomico.sql`: prepara uma RPC que bloqueia o evento,
  apaga suas leituras e entradas únicas e publica a marca na mesma transação.
  Triggers nas duas tabelas coordenam os INSERTs com esse bloqueio e descartam
  registros anteriores ao corte. Não muda registros ao instalar a migração.
- `_compartilhado/configuracao.ts`: chama a RPC e exige exatamente uma marca válida
  retornada. RPC ausente/erro não provoca fallback para deletes separados.
- `portaria/index.ts`: diferencia uma reserva descartada pelo zeramento de uma
  entrada já usada. Ausência inesperada de confirmação continua sendo erro.

Os locks `FOR SHARE` das inserções conflitam com `FOR UPDATE` do zeramento; inserts
concorrentes entre si podem compartilhar o lock. Essa revisão se baseia na
[documentação oficial dos locks de linha](https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS).
O retorno nulo de um trigger `BEFORE INSERT` omite a inserção, conforme a
[documentação oficial de triggers](https://www.postgresql.org/docs/current/plpgsql-trigger.html).
Esta revisão não substitui execução em PostgreSQL.

## Validação executada

- 9 novas regressões Python: IndexedDB real, falha de gravação/rollback, respostas
  antigas, troca de evento, fusos, leituras concorrentes, reparo de marca antiga e
  integração navegador/Edge com banco simulado.
- 103 testes existentes em `test_portaria_deposito.py`,
  `test_portaria_sincronismo.py` e `test_portaria_tela.py`: aprovados.
- 36 testes Deno de `_compartilhado/configuracao_test.ts`: aprovados, incluindo
  recusa de resposta vazia/ambígua, marca inválida e RPC indisponível.
- Type check das funções `portaria`, `acesso-conta` e `acesso-interno`: aprovado.
- Sintaxe dos JavaScripts alterados e `git diff --check`: aprovados.

O teste completo usa os módulos originais de frontend e Edge. O Deno não recebe
permissão de rede; o PostgREST é simulado em memória, inclusive o comportamento
proposto dos triggers. Portanto **não foi executada a migração nem comprovado o
comportamento dos locks em PostgreSQL real**. PostgreSQL/psql/Docker não estão
disponíveis neste ambiente; não foram instaladas dependências.

O comando `deno check --cached-only` não é aceito pela versão instalada; foi
corrigido para `deno check --no-config --no-lock --no-npm`, que passou.

Comandos, a partir do worktree:

```powershell
& 'C:\Users\Junior\Projetos Ingresso ideal\ideal-imposition\venv\Scripts\python.exe' -m pytest -n 0 tests/test_ideal_control_zeramento.py tests/test_portaria_deposito.py tests/test_portaria_sincronismo.py tests/test_portaria_tela.py -q
& .\node_modules\.bin\deno.cmd test --cached-only --allow-env --allow-read --quiet supabase/functions/_compartilhado/configuracao_test.ts
& .\node_modules\.bin\deno.cmd check --no-config --no-lock --no-npm supabase/functions/portaria/index.ts supabase/functions/acesso-conta/index.ts supabase/functions/acesso-interno/index.ts
node tests/ideal_control_zeramento_harness.cjs
```

O `node_modules` deste worktree é uma junction para a instalação já existente no
checkout operacional. O harness grava a evidência sintética em
`tmp_ideal_control_zeramento/prova.json` e `apos-zerar-permitido.png`.

## Pendências para publicação

1. Executar a migração em ambiente PostgreSQL de teste explicitamente definido,
   usando dados sintéticos. Confirmar rollback integral em falha e, em duas
   conexões, INSERT durante zeramento e zeramento durante INSERT. Conferir que
   somente o evento alvo é zerado, que credenciais permanecem e que os dois
   sentidos de concorrência recusam registros até o corte.
2. Conferir funções, triggers e ACLs existentes no alvo antes da aplicação remota.
   A RPC usa `SECURITY INVOKER`, tem execução revogada de PUBLIC/anon/authenticated
   e concedida à service_role. A autorização do dono/atendente continua na Edge.
3. Após autorização de publicação: SQL primeiro; depois `portaria`,
   `acesso-conta` e `acesso-interno`; depois frontend com nova versão de cache do
   PWA. Não publicar as Edges que dependem da RPC antes da migração.
4. Verificar assets públicos com cache-buster e testar aparelho físico: ler,
   sincronizar, zerar, ler novamente; depois repetir com fila offline pendente.

Não foi afirmado que produção está corrigida. A comparação anterior de assets
públicos comprova o diagnóstico da versão antiga, não a publicação desta correção.

## Recuperação

Uma reversão somente do frontend pode manter a migração e as Edges novas; os
triggers também protegem envios de versões anteriores do aplicativo. Remover a
RPC antes de reverter as Edges interrompe o comando de zerar. Voltar ao backend
antigo reintroduz o zeramento em requisições separadas e sua janela de concorrência.
Dados apagados por um zeramento autorizado não são restaurados por rollback de
código, como já acontecia no comando anterior.

Retomada: usar este worktree, validar PostgreSQL e então preparar a publicação
coordenada. Não alinhar nem sobrescrever o checkout operacional para isso.
