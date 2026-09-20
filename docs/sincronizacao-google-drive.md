# Copia continua para Google Drive — preparacao

Destino solicitado: `Ideal Imposition/ideal-imposition` na conta Google do usuario.

## Estado

Rotina preparada em `ferramentas/sincronizar-drive.ps1`, sem ativacao nem transferencia.
Google Drive para computador: instalador oficial aberto apos assinatura Google LLC
validada. Na ultima verificacao o instalador ainda estava em execucao, sem unidade
do Drive montada; instalacao e login ainda nao confirmados.
O caminho local exato ainda precisa ser identificado depois do login.
Resposta "1" interpretada e comunicada como escolha de preservar `.git` somente
no computador, excluindo-o do Drive.

## Plano

1. Instalar o aplicativo oficial Google Drive, conferindo assinatura Google LLC.
2. Usuario faz login. Nao adicionar a pasta original do projeto ao backup direto.
3. Preservar `.git` no computador e NAO o enviar: o historico referencia
   `.env.local`. Para incluir historico, e necessaria outra tarefa de sanitizacao.
4. Identificar a pasta `Ideal Imposition` dentro do Drive e simular a copia.
5. Revisar arquivos selecionados e eventuais conflitos no destino.
6. Ativar rotina oculta ao entrar no Windows, sob o usuario atual, sem privilegios
   administrativos. A rotina verifica alteracoes a cada 60 segundos, com uma unica
   instancia. O aplicativo do Google Drive faz o upload da copia filtrada.

## Comportamento e exclusoes

- Copia unidirecional; nunca modifica a origem, nao usa `/MIR` nem `/PURGE`.
- Nao apaga arquivos do destino; arquivos mais novos no destino sao preservados.
- Exclusoes explicitas no script: `.env` inclusive exemplos, credenciais por nome,
  chaves, configuracao SMTP e bancos locais, pool QR, planilhas, PDFs, instaladores,
  arquivos compactados, dependencias, caches, temporarios, builds e configuracoes
  pessoais de ferramentas. Algumas fontes com nomes sensiveis tambem sao excluidas
  conservadoramente; revisar na simulacao.
- Nao confiar somente no `.gitignore`: ele nao exclui todos os dados sensiveis.
- Filtros por nome nao provam ausencia de segredos embutidos em arquivos comuns.
  Antes do primeiro envio, revisar a selecao sem expor valores sensiveis.
- A copia nao e um backup completo restauravel do ambiente ou do Git.
- Nao executar a rotina em destino ja contendo segredos sem tratar isso separadamente:
  exclusoes impedem novas copias, mas nao removem arquivos que ja estao no Drive.

Simular (substituir CAMINHO_DRIVE pelo caminho real confirmado):

```powershell
.\ferramentas\sincronizar-drive.ps1 -Destino 'CAMINHO_DRIVE\Ideal Imposition\ideal-imposition'
```

Depois da revisao, `-Executar` habilita a copia e `-Continuo` repete a cada minuto.
Ainda nao ha tarefa agendada instalada. Remocao/pausa sera documentada quando ativada.

## Verificacao local

- Parser PowerShell: sintaxe valida.
- Verificacao de whitespace: sem erros.
- Teste com dados sinteticos: bloqueado pela politica padrao de execucao de
  scripts PowerShell; nenhuma copia realizada por esse teste. Nenhuma politica
  foi alterada. Resolver a execucao autorizada da rotina antes de agenda-la.
