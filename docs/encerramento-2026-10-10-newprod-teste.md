# Encerramento — NewProd Teste — 10/10/2026

Trabalho encerrado a pedido do usuário. Horários deste documento em Brasília.

## Estado confirmado ao encerrar

| Estação | Situação |
| --- | --- |
| Junior / PC-JR-HOME | API local informa **1.2.382-teste.1**. Painel recebeu a correção de GDI por blocos/folha sem troca do executável. Usuário confirmou **“testes ok”**. |
| LASER-01 | Último heartbeat consultado: **17h54**, versão **1.2.381-teste.1**. Painel saudável, coleta automática concluída e fila vazia na consulta. **Instalação da .383 não confirmada.** |
| Canal de teste | **1.2.383**, liberada para LASER-01 e PC-JR-HOME. MSI publicado, download integral, tamanho e SHA-256 conferidos. |
| Demais estações | Manifestos estáveis preservados; nenhuma nova atualização geral realizada nesta entrega. |

## Correções e decisões

- Os modos GDI atual e GDI otimizado de 300 DPI respeitam `entregar_por_bloco` e `folha_a_folha`. Antes, `trabalho_unico` era imposto para ambos e acumulava todos os arquivos até o fim da geração.
- Com blocos ativos, cada arquivo segue para o endpoint experimental de envio assim que recebido pelo painel. Sem blocos e sem folha a folha, conserva-se o trabalho único.
- Folha a folha em simplex separa uma página por trabalho; duplex preserva os pares frente/verso. A ordem reversa inverte folhas, sem inverter as faces de cada folha. Nomes de capa/miolo continuam determinando as bandejas.
- PDF direto, que já respeitava os blocos, permanece inalterado. Não há fallback automático entre motores nem confirmação comercial automática de pedido impresso.
- Removido o botão separado de teste da prévia. O teste usa o seletor de saída e **Imprimir** do próprio modelo.
- No experimental GDI, diferenças de papel/orientação geram avisos e permitem prosseguir a 100%, com possibilidade de corte quando o papel não comporta a página. Não é ajuste automático de escala.
- Controlador informado pelo usuário: **Konica Minolta IC-607**, com suporte a PDF direto. Opções do driver Windows não acompanham o PDF RAW; bandeja/duplex dependem da configuração do RIP nesse modo.

## Cancelamento: pendência não resolvida

O usuário relatou “Os dados do modelo mudaram. Selecione novamente antes de gerar” após cancelar impressões. Uma tentativa de priorizar o cancelamento foi aplicada somente ao painel Junior e depois retirada diante do relato de ausência de envio.

Após o recuo, a primeira confirmação de envio se referia **somente ao PDF direto**. O usuário esclareceu que os dois GDI ainda não chegavam ao spool. Portanto, **não tratar o recuo como prova de que a correção de cancelamento causou a falha de todos os modos**. O acúmulo obrigatório dos blocos nos GDI foi identificado e corrigido separadamente.

A correção de cancelamento retirada não integra o pacote .383. Ela permanece como alteração não commitada no worktree antigo para investigação. Não incorporá-la por cópia ampla. Retomar com reprodução do cancelamento e de uma nova tentativa nos três motores; preservar verificações de alterações reais do modelo.

## Evidências e validação

- Logs do Junior registraram geração de 325 folhas do modelo 1002066. O diagnóstico no painel mostrou envio de sete arquivos ao agente.
- Consulta posterior encontrou trabalho 53 na EPSON L3210 Series, com 160 páginas registradas enquanto o envio continuava. O usuário confirmou as 325 páginas juntas no spool; isso motivou a correção de entrega progressiva.
- Houve aviso de PDF 200 × 245 mm versus papel do driver aproximadamente 297 × 210 mm. Não confundir esse aviso com envio bloqueado ou impressão física concluída.
- 81 testes Python passaram. Harness de navegador passou com três motores, envio do primeiro bloco antes do seguinte, bandejas capa/miolo, PDFs sintéticos reais de três páginas, simplex/duplex longo/curto, reversa e falha sem fallback.
- Usuário aprovou os testes no Junior após a correção de blocos/folha. Não há prova de teste físico da .383 na LASER-01.
- Na investigação anterior, um teste de versões uniformes de cache falhou por versões já misturadas no HTML. A falha foi informada; não houve normalização ampla de assets nesta tarefa.
- Logs também mostraram HTTP 409 na publicação de faixa QR do pedido 23142. Essa ocorrência não foi corrigida nesta tarefa nem estabelecida como causa do problema GDI.

## Entrega .383

- Fonte isolada: `C:\ProjetosLocais\ideal-imposition-laser01-teste-383-20261010`.
- Branch: `test/laser01-383-20261010`; commit funcional **3de995ae**, enviado ao repositório. Não mesclado no canal estável.
- MSI: [NewProdPiloto_Teste_v1.2.383.msi](https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/agent-releases/NewProdPiloto_Teste_v1.2.383.msi).
- ProductVersion: **1.2.383**; agente: **1.2.383-teste.1**.
- Tamanho: **194781184 bytes**.
- SHA-256: `5ed3c5c4389c518033ed8c1b8df89b701499f0f19508b626742a6181e6abfd07`.
- Manifesto: `newprod-piloto-teste.json`, alvos LASER-01 e PC-JR-HOME. `latest.json` e `newprod-piloto-oficial.json` conferidos sem alteração.
- Evidências locais: `dist/teste383-publicacao.json`, `dist/teste383-manifesto-anterior.json`, logs de build/MSI. Frontend empacotado e módulos PYZ conferidos com as fontes.

## Recuperação e cuidado na retomada

- Junior: backup verificado em `%LOCALAPPDATA%\NewProd Recuperacao Experimental\20261010T181107Z-teste382`, com executável/painel anteriores e backup cifrado dos dados. Instalação MSI .382 concluiu com código 0 após sair pelo ícone do tray; configurações e trabalho da EPSON foram preservados.
- Backup antes da correção de blocos: `%LOCALAPPDATA%\NewProd Recuperacao Experimental\20261010-161327-gdi-blocos`.
- O worktree antigo `C:\ProjetosLocais\ideal-imposition-gustavo-teste-380-20261010` contém investigações não commitadas; preservá-las. O worktree .383 exclui a tentativa de cancelamento retirada.
- Não houve cancelamento ou reenvio automático de trabalhos pelo assistente. Spool/heartbeat não comprovam saída física.

## Próxima retomada

1. Consultar novamente a LASER-01: verificar se o agente passou para **1.2.383-teste.1**. Publicação não significa instalação.
2. Para instalar imediatamente, usar **Verificar atualização** na própria estação. Como alternativa, terminar os trabalhos, usar **Sair no ícone do NewProd ao lado do relógio** e executar o MSI na conta habitual. “Sair” dentro da página só encerra o login.
3. A checagem automática segue em seis horas; a atualização manual permanece disponível. O acesso HTTP direto à LASER-01 não respondeu desta conexão; não foi possível forçar a instalação remota.
4. Validar na LASER-01 os dois GDI: primeiro bloco chega antes do fim da geração; folha a folha preserva ordem, bandejas e duplex. Conferir papel físico e tamanho do spool separadamente.
5. Investigar o aviso após cancelar sem reintroduzir a tentativa retirada. Nenhuma outra tarefa fica sendo executada após este encerramento.
