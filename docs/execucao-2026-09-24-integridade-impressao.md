# Execução local — integridade da impressão

Data: 24/09/2026. Autorização: “EXECUTAR”, após aprovação do plano.
Base: `4b3e391c`, área isolada `C:\ProjetosLocais\ideal-imposition-analise-22599`.
Estado desta etapa: implementação e testes locais. A publicação posterior de v958 / NewProd 1.2.339 foi concluída e está registrada em [entrega segura](entrega-segura-2026-09-24-integridade-impressao.md); instalação na LASER-01 e impressão física permanecem pendentes.

## Comportamento implementado

- Aberturas de Pedido e Imposição aguardam as tarefas de preenchimento e carregamento. Erros ficam como bloqueio; respostas de uma seleção anterior são descartadas. Ação de geração no Pedido tem trava desde a primeira espera, cobrindo cliques concorrentes.
- Pedido, Imposição e Montagem passam pela mesma preparação antes de chamar `/api/impose`. A estação precisa anunciar `integridade_impressao_v1`.
- Preparação confere modelos, referências de numeração, formato/saída e bancos. Consulta incompleta não confirma ausência. Relê os dados após baixar os arquivos e recusa divergências. Payload de numeração e fatias de CSV são conferidos; o CSV global/residual da tela não substitui mais o banco do modelo.
- Os originais são baixados antes da geração. Frente, verso e cada arte combinada são enviados por campos indexados, com tamanho e SHA-256. Diferença entre arquivo já carregado e original confirmado bloqueia e pede reabertura.
- O agente exige o manifesto, confere arquivos recebidos, hashes, referências e obrigatoriedade por face antes do motor. Não completa uma frente explicitamente ausente buscando um template alternativo.
- Frente intencionalmente sem arte continua válida: arte somente no verso funciona individualmente e em combinação. Numeração cadastrada sem elementos continua permitida. Layout de conferência permanece fora da impressão.
- Motor valida todos os bancos e recursos obrigatórios antes da primeira saída: fotos, elementos PDF/SVG, fontes e artes dos demais modelos. Falhas anteriormente toleradas agora interrompem. Fotos/recursos ficam em área temporária própria do trabalho, com conferência de hash, reduzindo retenção de bytes na memória. Existe verificação prévia de espaço com estimativa de saída e reserva; não é reserva exclusiva de disco contra outros processos.
- Cada PDF é fechado e reaberto antes de ser anunciado. Erro no callback interrompe o produtor. Envio por bloco foi preservado.
- Stream exige identidade do trabalho, índice contínuo, hash e evento final com contagem de arquivos. EOF, corrupção, repetição ou falha de entrega não concluem com sucesso; a conexão é cancelada.
- Entrega direta para no primeiro erro. O modal preserva a marca dos arquivos já aceitos, para não reenviá-los na mesma fila. Interrupção é registrada localmente somente com contagem/data; a próxima impressão exige confirmação explícita de conferência da fila e do papel, usando Refazer quando necessário.
- No envio remoto, o próximo arquivo aguarda o agente confirmar o anterior. Registro na fila, consulta sem linha, erro e resposta desconhecida não são tratados como entrega. PDF recebido pela estação tem o hash conferido novamente antes de spool/hotfolder.
- Nunca há repetição automática de impressão após timeout. “Aceito” refere-se ao encaminhamento pelo agente/spool/pasta; impressão física continua exigindo conferência do operador.

## Arquivos principais

- `frontend/arte-de-impressao.js`: preparação comum, manifesto, validação do stream e confirmação de retomada.
- `frontend/pedido.js`, `frontend/script.js`, `frontend/montagem.js`: integração, tarefas aguardadas, CSV por modelo e entrega interrompível.
- `integridade_impressao.py`: contrato, hashes, recursos em disco, espaço e validação antes do dispositivo; sem serviços remotos ao importar.
- `app.py`, `engine.py`, `agent_worker.py`: aplicação das barreiras no agente, composição por face e entrega.

## Validação realizada

Somente dados sintéticos e serviços simulados. Nenhum banco real, impressora, hotfolder operacional ou credencial foi usado nesta implementação.

- Suíte direcionada: **200 testes e 23 subtestes passaram**, incluindo sintaxe de todo o frontend, combinação/paginação, verso, fotos, bancos, TICKET, modelos sem elementos, streaming e limpeza de temporários.
- Após ajustes finais de validação: **32 testes e 23 subtestes** de integridade e combinação passaram novamente. Compilação Python e `git diff --check` também passaram.
- Preparação comum: **24 verificações** em Node/navegador, incluindo dependência pendente, HTTP inválido, catálogo ausente, dados alterados, arte diferente da prévia, numeração incompleta, stream truncado/duplicado e resposta do agente.
- Navegador real com a abertura de Pedido: geração durante download bloqueada; preenchimento de numeração aguardado; falha de arte bloqueia; resposta tardia não troca o modelo atual. Transporte/parser da prévia e periféricos simulados neste harness; validação real do PDF é coberta pelo motor.
- Entrega imediata: **49 verificações**, incluindo interrupção no primeiro arquivo e recusa de continuar o mesmo objeto de entrega.
- Fluxo combinado: PDF, impressão, Refazer, faces, alvo capturado e mudança de seleção passaram.
- Restauração de navegação: **5 regressões** passaram.
- Teste antigo de blocos dependia de `base_ticket.pdf` externo ao Git. Foi convertido para criar uma arte sintética própria. Nenhuma instalação de dependências foi feita.

## Limites e liberação operacional

A reprodução do motor e os testes de concorrência demonstram as falhas tratadas, mas não identificam de forma definitiva qual delas ocorreu na tentativa do pedido 22599. O arquivo defeituoso e os registros daquela tentativa continuam indisponíveis.

A preparação faz leituras antes/depois e gera a partir dos bytes preparados. Não cria uma transação remota entre tabelas; mudanças concorrentes detectadas bloqueiam, e uma exigência de snapshot transacional no banco precisaria de contrato remoto específico.

Fontes desconhecidas, painéis/agentes sem o protocolo, conteúdo incompleto e consultas não confirmadas passam a bloquear. Esse bloqueio é intencional: não oferecer bypass que recoloque a omissão silenciosa.

A distribuição exige **painel e agente compatíveis**. Antes de publicar: integrar a mudança à base atual em área limpa, definir a versão de release e atualizar os identificadores de cache dos arquivos alterados. O agente novo recusa pedidos do painel antigo; o painel novo recusa agentes sem a capacidade. Preparar uma janela de atualização conjunta e conferir a capacidade realmente em execução nas estações.

Depois: validar os assets públicos e MSI por hash, confirmar a atualização da LASER-01, abrir uma aba atualizada e executar piloto com conferência de PDFs e papel. Medir latência, memória e espaço com a carga operacional de fotos/bancos. A instalação e o piloto físico não foram executados nesta etapa.

Retomada explícita em outro trabalho exige que o operador confira o que saiu e selecione a faixa correta. O sistema não afirma impressão física exatamente uma vez nem desfaz páginas já encaminhadas. Rollback que volte ao comportamento permissivo deve manter a geração afetada bloqueada.
