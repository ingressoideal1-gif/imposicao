# Ideal Control — dois QRs e senha por celular

**Atualização em 22/09/2026:** o usuário autorizou validar/aplicar o SQL e configurar a chave. A migração de QR/PIN foi validada em PostgreSQL isoladamente e aplicada no projeto `vwbtitjlpelrcnsytzqw`. A chave foi criada em `imposition_segredos`, pelo mecanismo protegido existente, sem exposição do valor. Funções e frontend continuam sem publicação. Ver [registro da aplicação](ideal-control-sql-pin-aplicado-2026-09-22.md). As seções de pendências abaixo registram a entrega local anterior; o registro de aplicação informa o estado atual.

Implementação local em `C:\ProjetosLocais\ideal-imposition-ideal-control-zeramento`, branch `fix/ideal-control-zeramento-20260922`, base `54a85d630ca14f529f996b3a7e48a143d7cf1b9e`.

Decisões do usuário em 22/09/2026: um QR de instalação igual para todos; um QR por evento; câmera ou imagem da galeria para carregar o evento; senha de edição de seis números, definida no primeiro uso e **por celular**, consultável pela gráfica. Essas decisões substituem o login obrigatório na primeira abertura. A conta existente continua disponível para os fluxos de conta e relatórios.

## Fluxo entregue no código

1. Na gráfica, abrir o pedido e preparar seu evento. Em **Enviar ao cliente · Instalação e evento**, o QR fixo instala o aplicativo. Há cópia do link e download da imagem.
2. **Gerar QR do evento** gera uma imagem identificada com o nome do evento. É possível baixar ou compartilhar pelo mecanismo do navegador; quando o compartilhamento de arquivos não está disponível, a imagem é baixada para anexar manualmente à conversa. Nenhuma mensagem foi enviada durante o desenvolvimento.
3. No primeiro uso instalado, o cliente cria e confirma a senha de seis números daquele celular. Zeros iniciais são preservados. Se a criação foi cancelada, o carregamento pede novamente.
4. **Ler QR do evento** permite câmera ou **Importar da galeria**, inclusive para a imagem recebida pelo WhatsApp no mesmo celular. O cliente confirma o evento e o nome do celular.
5. Cada instalação recebe seu próprio aparelho no evento. São baixadas todas as páginas de credenciais e as entradas, os totais e as configurações atuais. O aplicativo libera a leitura após gravar a carga completa. Falha de download mantém a leitura bloqueada e permite tentar novamente. Leituras pendentes impedem substituir a carga.
6. A engrenagem do evento usa a senha daquele celular para edição. A senha não é necessária para ler ingressos. A edição continua dependente de internet; a leitura usa a carga local.
7. Na gráfica, **Aparelhos → Consultar senha de edição** mostra a senha por até 30 segundos. Somente os papéis já autorizados (`admin` e `atendimento`) passam pela rota. A consulta registra o usuário na auditoria e retorna `Cache-Control: no-store`.

O QR é um convite para vincular celulares ao evento, incluindo a edição protegida pelo PIN da instalação. Não contém a senha. Emitir outro QR não invalida imagens já enviadas; **Revogar QRs deste evento** impede novas ativações pelos convites existentes. Aparelhos já ativados continuam sujeitos aos controles próprios de pausa/exclusão. A imagem emitida pode ser guardada pela gráfica para reenviar o mesmo QR.

## Implementação

- `frontend/qr-evento-envio.js`: emissão, imagem, download, compartilhamento e revogação na gráfica.
- `frontend/qr-evento.js`: leitura/importação, conferência do evento e ativação idempotente por instalação.
- `frontend/pin-instalacao.js`: cadastro e confirmação do PIN, autorização temporária da edição. Não grava a senha em localStorage, sessionStorage ou IndexedDB; guarda somente a identificação opaca da instalação e os tokens de aparelho.
- Integração em `ideal-control.js`, `index.html`, `controle.html`, `conta.js`, `controle.js`, `parede-pwa.js`, `sw.js` e `security_config.py`.
- `portaria.js` e `portaria-deposito.js`: primeira carga por QR só fica disponível depois do download e da gravação conjunta de carga, entradas e totais. Preservadas as correções de zeramento anteriores neste mesmo worktree.
- `_compartilhado/qr_evento.ts`, `pin_instalacao.ts`, `edicao_pin.ts`: convites aleatórios de 256 bits; banco armazena somente seus hashes; senha cifrada com AES-GCM, vinculada à instalação; verificação por HMAC; edição com autorização temporária vinculada a evento, instalação e aparelho. Os recursos de edição são conferidos contra o evento do token no servidor.
- `_compartilhado/painel_evento.ts`: consulta do painel extraída sem mudar seu contrato, compartilhada com `acesso-conta` e a edição por PIN.
- `sql/schema_acesso_qr_evento.sql`: instalações, convites, ativações, auditoria e duas RPCs. RLS ativo, sem acesso de `anon`/`authenticated`; execução das RPCs restrita a `service_role`. O limite de cinco tentativas incorretas por janela de 15 minutos e a ativação são transações no banco. A instalação e o evento têm no máximo um aparelho associado.

## Evidências locais

- 7 testes novos de navegador/IndexedDB em `tests/test_qr_evento_tela.py`, incluindo geração e decodificação do QR real em canvas, importação de PNG, PIN, proteção da fila, consulta da senha na gráfica e download paginado. O último usa `qr_evento_download_harness.cjs`: sucesso e falha, com a tela de leitura bloqueada enquanto o sincronismo está pendente.
- 10 testes novos Deno em `tests/qr_evento_pin_test.ts`: cifra autenticada, zero inicial, reenvio, formato, autorização por evento/aparelho, revogação e rotas HTTP reais com banco simulado. Junto aos testes de configuração e portaria: **66 aprovados**.
- Verificação de tipos de `portaria`, `acesso-interno` e `acesso-conta`: aprovada.
- Rodada de regressão de contas, painel da gráfica e configuração: 237 aprovações inicialmente; cinco falhas ligadas à nova abertura por QR ou ao desvio do teste foram corrigidas e reexecutadas com sucesso. Restam duas verificações preexistentes de versões uniformes: `index.html` e `controle.html` já têm vários números `?v=` no próprio HEAD. Não houve publicação para normalizá-los.
- Rodada direcionada das cinco regressões acima, nove testes de zeramento, instalação PWA e compilação do frontend: **95 aprovados**.
- `git diff --check`: aprovado. Nenhuma dependência instalada. Nenhuma chamada de teste acessou banco real ou enviou mensagem.

## Limites e ativação pendente

**Não publicado. Nenhum SQL remoto foi executado.** O PL/pgSQL e seus bloqueios ainda precisam ser executados e validados em PostgreSQL controlado; o banco sintético comprova o contrato com as Edge Functions, não a execução do SQL. A câmera física, a instalação nativa Android/iPhone e a entrega da imagem pelo WhatsApp ainda exigem teste em dispositivos reais.

Ordem necessária para ativar, após autorização do ambiente:

1. Validar a migração nova em PostgreSQL controlado, incluindo duas ativações concorrentes, revogação concorrente e o limite de tentativas. Pré-requisitos: schemas de acesso atuais, `codigo_hash` anulável e coluna `navegador_id`; manter a migração anterior de zeramento como entrega separada já documentada.
2. Configurar `IDEAL_CONTROL_PIN_CHAVE` com 32 bytes aleatórios codificados em 64 caracteres hexadecimais no mecanismo de segredos existente; manter também `ACESSO_ELEVACAO_SEGREDO`. A chave de cifra deve ser preservada: substituí-la sem recifrar os registros impediria consultar/verificar as senhas antigas. Nenhum valor real foi criado, lido ou registrado neste trabalho.
3. Aplicar o SQL revisado no alvo autorizado; publicar as Edge Functions antes do frontend. Preservar `verify_jwt=true` em `acesso-interno`/`acesso-conta` e a autenticação própria por token em `portaria`.
4. Publicar frontend com normalização de versões pelo processo de entrega e comprovar os arquivos públicos após propagação. Validar os dois QRs, dois celulares com senhas distintas, leitura sem internet e edição/consulta da senha.

Antes de publicação, a recuperação é manter os artefatos atuais e não aplicar esta migração. Depois de haver instalações cadastradas, não apagar tabelas ou trocar a chave para desfazer uma interface: preservar instalações, auditoria e leituras e preparar uma reversão específica.

Continuar neste worktree. O checkout operacional e as mudanças anteriores de zeramento foram preservados. Sem commit, push, deploy ou atualização do agente Windows.
