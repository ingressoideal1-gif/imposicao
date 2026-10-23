# Atualizacao confiavel do NewProd — preparacao local de 23/10/2026

## Escopo

Branch `fix/atualizador-confiavel-20261023`, baseada em `64ae1512`.
Entrega local autorizada: codigo, testes e roteiro. Sem build, instalacao,
publicacao, alteracao de manifesto ou escrita em producao.

## Evidencia e limites

Na consulta de 23/10 as 18h31 BRT, LASER-01 reportou MSI 1603 com codigo
1722 no resumo; TEX-02, GUSTAVO-PROD e ACABAMENTO-TEX reportaram MSI 1603.
TEX-01 reportou falta de espaco no download e, em coleta posterior, 53,15 GiB
livres no disco do TEMP. LASER-02 reportou executavel 1.3.33 com estado
`instalando`. Esses registros nao demonstram uma causa unica.

Nao houve acesso ao log local da LASER-01. O 1722 nao identifica por si so
qual programa falhou. A hipotese de heranca do ambiente PyInstaller continua
sem reproducao na estacao; limpar o ambiente antes do MSI elimina essa
dependencia sem afirmar que ela causou todos os erros.

## Alteracoes

- Download em arquivo `.part` exclusivo, conferencia incremental de hash e
  tamanho, substituicao apenas ao concluir e descarte somente do parcial
  criado pela propria tentativa. Pacote anterior permanece em caso de erro.
- Espaco conferido no TEMP e no destino da instalacao. Reserva conservadora:
  quatro vezes o tamanho declarado mais 512 MiB; sem tamanho, utiliza limite
  de 512 MiB. Nao representa medicao do pacote descompactado.
- Ambiente PyInstaller limpo antes de chamar o MSI; encerramento por PID e
  caminho, espera e verificacao de processo restante. Nenhuma fila e apagada.
- Mutex por caminho do executavel na sessao Windows. MSI 1618 continua sendo
  registrado e exige nova tentativa humana; nao encerra outro instalador.
- Falhas MSI reiniciam o executavel disponivel e conservam o erro. Falhas
  do coordenador indicam preparacao, encerramento, execucao MSI, reinicio ou
  confirmacao, sem mensagens livres de bibliotecas.
- Sucesso exige recibo novo da partida, versao esperada e painel validado.
  Ausencia de confirmacao em 120 segundos permanece `validacao_pendente`.
  A partida pode confirmar posteriormente. Nao significa teste de impressao.
- Falha de instalacao impede repeticao automatica para a mesma versao.
  Tentativa humana explicita ou versao nova permite tentar novamente.
  Consultas passivas nao apagam o registro de falha. Estado Python gravado
  com substituicao atomica usando o mecanismo existente.
- Diagnostico MSI acrescenta apenas acoes reconhecidas por lista positiva:
  PreservarDadosEstacao, RemoveExistingProducts, InstallFiles, InstallFinalize.
  Nao transmite linhas de log, caminhos ou propriedades MSI. Isso indica a
  etapa observada, sem confirmar automaticamente a causa.

## Recuperacao e liberacao futura

1. Na LASER-01, com acesso autorizado, localizar o log da tentativa 1.3.33
   e identificar a acao associada ao 1722 e sua falha anterior. Inspecionar
   localmente; nao publicar o log bruto nem credenciais.
2. Se a falha for PreservarDadosEstacao, conferir separadamente liberacao,
   preservacao e preparacao de perfil. Nao remover essa protecao para instalar.
3. Na TEX-01, conferir espaco nos volumes usados pelo download, extracao e
   Windows Installer no momento da tentativa. Nao apagar TEMP ou caches
   indiscriminadamente nem inferir a causa pela coleta posterior.
4. Preparar MSI e backup recuperavel conforme o fluxo oficial, em etapa
   posteriormente autorizada. Testar atualizacao automatica de uma instalacao
   antiga em maquina controlada, incluindo falha e retorno ao executavel.
5. Liberar no manifesto oficial para uma estacao fora de producao; verificar
   versao, painel, identidade, dados preservados e estado final. Depois ampliar
   por grupos. Nao ativar liberacao universal apenas porque o MSI foi enviado.
6. Estacoes antigas ainda executarao seu atualizador antigo na primeira troca.
   A correcao nova nao conserta esse primeiro transporte retroativamente.
   Quando necessario, instalar manualmente com ambiente limpo, backup e log,
   em janela autorizada, preservando dados e configuracoes.

## Validacao

Testes sinteticos cobrem download completo, interrompido, tamanho, hash,
espaco, preservacao de pacote, repeticao e preservacao do registro de falha.
O PowerShell gerado e executado com comandos de processo substituidos por
simulacoes: MSI 0, 3010, 1603, 1618 e versao errada apos reinicio. Nao executa
MSI real, nao encerra agentes reais nem acessa impressoras nesses testes.
Conferencia completa por `ferramentas/conferir_duas_versoes.py`, com ambiente
de teste isolado, concluida com retorno zero nos tres canais:

| Canal | Python | Harnesses de interface |
| --- | --- | --- |
| Producao | 889 aprovados, 2 ignorados, 2 subtestes aprovados | Todos aprovados |
| Piloto | 891 aprovados, 2 ignorados, 2 subtestes aprovados | Todos aprovados |
| Oficial | 893 aprovados, 2 ignorados, 2 subtestes aprovados | Todos aprovados |

Novos casos foram acrescentados durante a conferencia. A revisao final dos
arquivos afetados foi novamente validada com 52 testes focados em cada um
dos tres canais (156 aprovacoes), incluindo a gravacao de estado, simulacao
do PowerShell e confirmacao de partida. `git diff --check` sem erros.
Houve um aviso de depreciacao do Starlette/httpx em cada bateria completa;
nenhuma dependencia foi alterada.

Logs e tempos locais: `%TEMP%/newprod-validacao-atualizador-wck9sy6h/`.

Teste sintetico nao substitui atualizacao automatica real de versao antiga,
teste do executavel PyInstaller empacotado ou confirmacao fisica de impressao.
