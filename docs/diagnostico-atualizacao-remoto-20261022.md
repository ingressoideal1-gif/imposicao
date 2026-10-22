# Diagnostico de atualizacao e acesso remoto

Preparacao local sobre a fonte NewProd 1.3.27 (a3ac5887), em checkout isolado.
Nao representa pacote publicado, instalacao nem acesso remoto configurado.

O heartbeat passa a incluir `printers_json.diagnostico_update`. O campo existente
`ultimo_update` permanece compativel. O resumo le somente `update-X.Y.Z.log`
na pasta local do agente e apenas quando o registro indica `instalacao_falhou`.
O atualizador oficial ja gera esse log com `/L*v`.

O novo campo envia exclusivamente schema, estado enumerado, versao numerica,
data da tentativa, codigos MSI de lista positiva, indicador de retorno 3 e
leitura parcial. Nunca envia linhas do log, caminhos, propriedades MSI,
usuarios, tokens ou senhas. Codigos encontrados sao pistas, nao prova de causa.
Nao houve alteracao de permissoes, tabela, endpoint ou credenciais. O resumo
usa o transporte HTTPS e as permissoes do heartbeat existente; nao e um canal
para enviar logs completos ou executar comandos.

A leitura tem limite de 256 KiB por heartbeat, suporta UTF-8/UTF-16, recusa
links/juncoes e exige que a modificacao do log esteja a ate cinco minutos da
tentativa. Ausencia, inacessibilidade e divergencia ficam explicitas. Sem
registro de falha nao abre logs. Nao percorre TEMP nem exclui arquivos.

## Implantacao e limite de recuperacao

Esta mudanca precisa de novo executavel. O sincronismo do painel nao a entrega.
Estacoes que nao conseguem instalar o MSI podem continuar sem este diagnostico:
nao usar uma nova publicacao como prova de recuperacao. Primeiro testar o pacote
em uma estacao acessivel, depois conferir heartbeat e uma falha simulada em
ambiente isolado. Reversao da fonte: retirar o campo e modulo adicionados;
nenhuma migracao de banco e necessaria.

O usuario informou nao existir ferramenta de acesso remoto nas estacoes.
Sem um canal administrativo ja configurado, a primeira instalacao depende de
alguem na estacao. O NewProd nao ganhou shell remoto, acesso a tela nem uma
senha de suporte embutida. Escolher a ferramenta e a conta responsavel antes
de preparar sua instalacao; registrar estacao/identificador, testar conexao e
revogacao. Nao guardar credenciais no heartbeat, no repositorio ou no chat.

## Visita presencial em 23/10/2026

O usuario informou que estara na grafica nesta data. Priorizar TEX-02,
ACABAMENTO-TEX e GUSTAVO-PROD, que reportaram falha MSI 1603 em 22/10.
Reconsultar o estado ao iniciar a visita; o registro anterior nao garante
que a falha persista.

1. Escolher a ferramenta e a conta administrativa para o acesso remoto.
   Instalar pelo fornecedor oficial na conta Windows habitual; configurar
   autenticacao forte e acesso apenas aos responsaveis designados.
2. Testar uma conexao de fora da estacao e reconexao apos reinicio, em uma
   janela sem impressao. Registrar identificador e responsavel, sem senha.
3. Antes de tentar outra atualizacao do NewProd, preservar localmente o
   `update-1.3.27.log` da pasta `%LOCALAPPDATA%\NewProd Agent`, quando existir,
   e conferir a data da tentativa. Nao colar o log integral em chat: pode
   conter propriedades sensiveis. Inspecionar localmente o contexto da falha.
4. Corrigir somente a causa comprovada. Nao apagar TEMP, caches, fila ou
   configuracoes como tentativa generica de corrigir MSI 1603.
5. Depois da instalacao, conferir versao do executavel, painel, heartbeat e
   atualizacao. Fazer teste de impressao controlado separadamente.

Nao foi agendado lembrete nem instalada ferramenta remota nesta preparacao.

## Validacao

Testes sinteticos cobrem redacao por lista positiva, UTF-16, leitura limitada,
arquivo ausente, tentativa antiga, versao com traversal e juncao recusada.
Executar junto aos contratos do atualizador e dos canais. A bateria completa
dos dois canais deve ser aprovada antes da publicacao; resultados e bloqueios
da execucao local sao relatados na entrega.

Resultado local em 22/10: nove testes do novo diagnostico aprovados; contratos
do atualizador, seguranca e canais aprovados. A conferencia completa por
`ferramentas/conferir_duas_versoes.py --base a3ac5887` concluiu com sucesso nos
canais producao e piloto, incluindo os harnesses JavaScript. Cada canal teve
1.140 testes Python aprovados e dois ignorados. O ambiente usou `NODE_PATH`
para dependencias ja instaladas no checkout original, sem instalar pacotes.
As primeiras execucoes identificaram essa dependencia do ambiente e dois
harnesses de heartbeat que precisaram receber a pasta temporaria simulada.
O aviso de deprecacao Starlette/httpx permanece; nao impede estes testes.
Nenhum build, commit, push, publicacao ou instalacao foi executado.
