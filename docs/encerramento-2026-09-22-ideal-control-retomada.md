# Encerramento — Ideal Control — 22/09/2026

Trabalho encerrado por solicitação do usuário. Este é o ponto de retomada das
alterações de hoje; os registros anteriores continuam como evidência histórica.

## 1. Decisões finais do usuário

- Dois QRs: instalação do aplicativo igual para todos; QR específico para carregar
  o evento no PWA, pela câmera ou importação de imagem.
- Senha de edição de seis números por celular, definida no primeiro uso do fluxo.
  Consulta pela gráfica no Imposition com proteção e auditoria existentes.
- Eventos/ingressos não dependem da geração do PDF nem do NewProd ligado.
  A combinação conhecida pelo Imposition utiliza a mesma base QR Ideal da estação,
  agora também disponível em armazenamento privado na nuvem.
- Tela inicial: somente eventos ativos carregados neste aparelho.
- Menu do olho: Ler QR do evento e Meus Pedidos.
- Meus Pedidos: histórico de eventos encerrados/inativados, sem consulta aos
  pedidos da gráfica. Novos eventos são carregados pelo QR.
- Não preservar os dados locais antigos de desenvolvimento; pode perder eventos
  e leituras locais e recadastrar a senha. Nenhum evento estava em uso operacional,
  conforme informado pelo usuário. Essa autorização motivou a limpeza única v947.
- Execução e publicação foram autorizadas até a conclusão. Hoje encerrar e
  documentar; não iniciar novas alterações ou testes de operação física.

## 2. Linha do tempo e registros detalhados

| Etapa | Resultado e referência |
|---|---|
| Dois QRs e PIN | [Contrato do fluxo](ideal-control-dois-qrs-e-senha-2026-09-22.md) e [SQL/PIN aplicado](ideal-control-sql-pin-aplicado-2026-09-22.md). Não trocar a chave para reverter uma tela. |
| v940 | [Publicação inicial](ideal-control-publicacao-2026-09-22.md), incluindo zeramento atômico e evidências dos assets. |
| v941 | [Adaptação do painel](ideal-control-painel-v941-2026-09-22.md). |
| v942 | [Reinício local e atualização](ideal-control-reinicio-v942-2026-09-22.md), após relatos do iPhone preso na v834. |
| v943 | [Diagnóstico do pedido 19521](ideal-control-19521-qr-v943-2026-09-22.md). As restrições de publicação desta etapa foram posteriormente revistas pelo usuário. |
| v944 | [Emissão antecipada do QR](ideal-control-emissao-qr-v944-2026-09-22.md). |
| v945 | [Carregamento antecipado do evento](ideal-control-evento-antecipado-v945-2026-09-22.md), sincronizando ingressos quando disponíveis. |
| v946 | [Preparação privada na nuvem e atualização de dados](registro-2026-09-22-ideal-control-preparacao-nuvem.md). |
| v947, vigente | [Limpeza única e Meus Pedidos como histórico](registro-2026-09-22-pwa-inicio-limpo-v947.md). |

As instruções finais acima prevalecem sobre descrições de fluxos antigos nesses
documentos, especialmente consulta de pedidos impressos e espera pelo NewProd.

## 3. Estado entregue

### Frontend

- v947, commit funcional `86fe734e`, tag `v947`, publicada na main.
- Último commit de evidência antes deste encerramento: `ea9c6d09`.
- Cloudflare Pages confirmou sucesso; 16/16 arquivos conferidos por SHA-256
  normalizado, com cache-buster, iguais nos dois domínios:
  `https://imposition.ai-ideal.com.br` e `https://imposicao.pages.dev`.
- [Evidência v947](evidencias/2026-09-22-pwa-v947-hashes.json).
- v946: commit funcional `3cf2ddcc`, 26/26 comparações aprovadas;
  [evidência](evidencias/2026-09-22-ideal-control-v946-hashes.json).
- Dados descritivos do evento e setores são atualizados ao retornar ao app,
  recuperar rede e no sincronismo periódico. Preservam-se alterações de formulário
  ainda não salvas. Histórico também usa metadados locais quando offline.

### Servidor e banco

Alvo: Supabase e-deal, projeto `vwbtitjlpelrcnsytzqw`.
Consulta de encerramento confirmou:

| Função | Versão | Estado | verify_jwt |
|---|---:|---|---|
| portaria | 257 | ACTIVE | false; autenticação própria das rotas |
| acesso-interno | 258 | ACTIVE | true |
| acesso-conta | 268 | ACTIVE | true |

- SQL de QR/PIN, zeramento e ativação antecipada aplicado conforme seus registros.
- `sql/ideal_control_preparacao_nuvem.sql` aplicado em transação. Não reaplicar nem
  editar esse script aplicado; mudanças futuras precisam de nova migração.
- Bucket `ideal-control-master`, privado. Um objeto `qr_ideal_pool.bin`,
  24.000.000 bytes, SHA-256
  `8e30409786113d484103cb66f88080a99bb67530a4817c245789c8929da35174`.
- Cópia remota comparada com a base da estação; cópia temporária de conferência
  removida. Base original preservada. Nenhum conteúdo da base foi versionado.
- Policy RESTRICTIVE impede acesso de anon/authenticated. RPCs de preparação
  exclusivas de service_role; tabela de preparação com RLS. HEAD público recusado.
- Lotes de 100 hashes, cursor transacional e retomada. Convite validado antes de
  consultar o pedido. Base privada fica no servidor; PWA recebe hashes da faixa.
- Mudança da fonte durante preparação e divergência de código existente abortam
  o lote para conferência, sem substituir silenciosamente credenciais.

### Pedido 19521

- Preparados 1.500 ingressos: 1.000 do modelo 1000159 e 500 do modelo 1000160.
- Todos os hashes conferidos com `PoolQR`/`hash_codigo` da base local original.
- Preparação executada pelo módulo novo com Storage e RPC remotos, credencial de
  serviço somente em memória. Não foi geração de PDF nem impressão física.
- A rota Edge publicada recusou QR desconhecido com HTTP 403. A importação real
  no iPhone após essas publicações ainda precisa de confirmação do usuário.

## 4. Limpeza única: cuidado obrigatório na retomada

`frontend/reiniciar.js` roda antes do arranque das páginas `/ic/`.
Marca: `ideal_control_fluxo_local=qr-nuvem-947`.

Na primeira abertura desta geração, a página isolada de reinício confirma acesso
à versão nova, limpa stores locais do Ideal Control, vínculos, instalação/PIN,
sessão salva e caches próprios; depois grava a marca e volta para o aplicativo.
O cadastro da senha é solicitado no fluxo de carregamento do evento.

- A limpeza acontece no armazenamento da instalação que abrir a versão. Safari,
  Chrome e PWA instalado podem ter armazenamentos distintos no iPhone.
- Não incrementar `qr-nuvem-947` a cada release. Isso apagaria novamente eventos
  novos, contrariando a regra de limpeza única.
- Leituras locais apagadas não são recuperáveis. Registros do servidor não foram
  apagados por essa limpeza; reimportar o QR baixa os ingressos disponíveis.
- Não afirmar que o iPhone já foi limpo: só foi validado automaticamente no
  navegador e publicado. A instalação física ainda não foi observada.

## 5. Validações e limites

- v946: 15 testes Deno e grupos Python/navegador descritos no registro específico;
  há sobreposição entre grupos, portanto não somar como casos distintos.
- v947: 60 casos de lista/atualização/histórico cobertos (57 aprovados juntos e
  três expectativas antigas adaptadas/aprovadas em execução dirigida), além de
  19 testes direcionados de controle/menu e cinco cenários do harness de reinício.
- Harness confirmou que evento novo permanece ao reabrir após a limpeza única.
- Histórico abre sem login e sem buscar pedidos da gráfica; ativos permanecem na
  tela inicial e encerrados/inativados no histórico; navegação não sobrepõe telas.
- Sintaxe JS, diff check e verificação de segredos aprovados para os arquivos
  entregues. Não foi executada toda a suíte do repositório na v947.
- Nenhum teste físico de iPhone, leitura de ingresso impresso, impressão,
  atualização/instalação do agente ou entrada real em evento foi realizado.

## 6. Recuperação

- Reverter frontend não restaura os dados locais já apagados.
- Preservar chave de proteção de PIN, instalações e auditoria ao reverter UI.
- Preservar base privada, sal e hashes preparados. São compatíveis com o NewProd.
- Não apagar credenciais para desfazer uma publicação de interface.
- Não remover RPCs/triggers enquanto as funções publicadas dependerem deles.
- Não colocar a base QR em bucket público, frontend, Git, logs ou anexos.

## 7. Retomada segura

Worktree: `C:\ProjetosLocais\ideal-imposition-ideal-control-qr-pronto`.
Branch: `fix/ideal-control-atualizar-dados-20260922`.
Estado antes deste documento: limpo, HEAD `ea9c6d09d87213610ced45a6600f41d86b96c208`.
O commit deste encerramento sucede esse HEAD e será enviado à mesma branch/main,
somente com documentação, sem nova versão funcional.

Checkout operacional `C:\ProjetosLocais\ideal-imposition`: branch main, três
alterações preexistentes observadas no encerramento e preservadas. Não executar
pull, reset, stash ou alinhamento automático nesse checkout.

Próxima etapa quando o usuário retomar:

1. Confirmar no ícone instalado do iPhone que abriu a v947.
2. Confirmar execução única da limpeza, cadastro de nova senha e leitura do QR
   do pedido 19521, com download completo dos 1.500 ingressos.
3. Fechar/reabrir e conferir preservação do evento recém-carregado.
4. Conferir alterações de nome/data/local e transição ativo → histórico ao
   inativar/encerrar; só fazer mudanças reais de estado quando autorizadas.
5. Se houver falha, registrar versão, endereço, ação e captura, preservando tokens,
   senha e base. Diagnosticar antes de outra limpeza ou mudança de numeração.

Não há implantação conhecida pendente do escopo entregue. O aceite físico do
iPhone é o ponto de continuação. Encerrado por hoje.
