# TraceDraw para designers — entrega da interface

## Escopo

Integra a interface publica com a Ponte Imposition 1.6.0 ja aprovada na estacao.
Mantem o link de download publicado pelo PR #217 e o layout atual. Acrescenta
TraceDraw/Atualizar a direita da barra de arte e identifica origem, revisao e backup.
Nao distribui o aplicativo TraceDraw: ele deve estar instalado no PC do designer.

Fonte aprovada: imposition-ponte-release-20261028. Integracao aplicada por patch
sobre origin/main ac0abfc5, sem substituir o script.js inteiro. Backend nao alterado
nesta entrega. Consulta administrativa somente leitura confirmou ponte-drive
ACTIVE, versao 8, verify_jwt=true; as duas RPCs de estado existem; tres backups
estao done e nao ha pendencias na fila no instante da verificacao.

## Uso na estacao

1. No Windows, instalar TraceDraw e habilitar em suas preferencias a integracao
   local MCP (agentes locais podem editar o desenho aberto).
2. No Imposition, abrir os modelos de um pedido e usar Baixar Ponte Imposition.
   Baixar/executar Instalar-Ponte-Imposition.exe pelo link do Google Drive.
   Pacote atual sem assinatura Authenticode; nao desativar Defender/SmartScreen.
3. A ponte inicia com o Windows. Entrar normalmente no Imposition com a conta do
   designer, que precisa de permissao para editar a Lista de Arte. Se o navegador
   solicitar acesso a rede local, permitir para o dominio oficial do Imposition.
4. TraceDraw abre o documento; Ctrl+S salva localmente. Atualizar publica todas
   as paginas/modelos do documento, gera amostras e agenda backup no Drive.
5. Aguardar backup confirmado antes de Pronto/Voltar ao Atendimento.

O designer nao recebe credenciais Google ou administrativas. Login e autorizacao
do Imposition sao conferidos pelo servico central. Nao ampliar permissoes de
usuarios nesta entrega. Instalar a ponte nao instala o TraceDraw.

## Comportamentos preservados

- Arquivo local prioritario, recuperacao do Drive e escolha disco/Drive quando
  houver divergencia compativel; nenhum popup intermediario de transporte.
- PDF e amostras oficiais permanecem no Supabase; cliente e motor mantem contratos.
- Exclusao de arte solicita limpeza apenas das paginas correspondentes no nativo.
- Numeracao e picote sao referencias; exportacao inclui somente a arte.
- PDF/X-1a, ISO Coated v2 FOGRA39 330%, imagens acima de 400 ppi reduzidas a 300,
  JPEG maximo, limite de 30 MiB por arquivo, conforme ponte aprovada.
- Operacoes comuns continuam independentes dos botoes TraceDraw. A passagem
  consulta backups e aguarda somente quando a revisao vigente tem backup pendente.

## Validacao e retorno

Harnesses: montagem dos dois botoes, lote, escolha de origem, transporte sem
popup, espera de backup e falha de consulta. Sintaxe dos tres JS aprovada.
Prova real anterior informada pelo usuario: quatro modelos em 19 segundos e
fluxo aprovado. Nao representa teste em todas as estacoes dos designers.

Retorno da aplicacao: reativar o deployment anterior a esta entrega. Ponte possui
retorno de versao no instalador. Manter worker/fila ativos ate concluir eventuais
backups; nao excluir dados nem restaurar PDFs individuais automaticamente.
