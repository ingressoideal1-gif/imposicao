# Vibe Entregas — implementação e preparação da integração

17/10/2026. Branch `feat/vibe-entregas-20261017`, baseada na web v1072.
Registro da etapa local original. A entrega web conjunta está descrita em
[entrega-vibe-montagem-2026-10-17.md](entrega-vibe-montagem-2026-10-17.md).
Os scripts SQL, Edge Function e teste PGlite citados abaixo permanecem apenas
na worktree de origem; não integram a publicação web. Não houve migração,
criação de bucket ou gravação de pedidos reais.

## Escopo e estado

Novo PWA independente em `frontend/entregas/`, com identidade, manifesto,
ícones e service worker próprios. A interface permite buscar número do pedido,
assumir pacotes, abrir rota no Google Maps, conferir volumes, informar recebedor,
tirar/escolher foto, revisar e confirmar entrega ou registrar tentativa frustrada.
Foto é reduzida para JPEG de até 1600 pixels, com prévia. Estados de erro não
descartam o formulário. A primeira versão exige conexão para confirmar no ERP;
sem rede, mantém o formulário aberto. Não existe fila durável de fotos offline.

A demonstração funciona sem login, com três pedidos explicitamente fictícios,
sem rede externa, sem persistir fotos e sem escrever no ERP. Recarregar ou sair
reinicia os exemplos. A abertura offline do aplicativo foi testada após a primeira
carga online. Dados autenticados e chamadas de API não entram no cache do PWA.

`api.js` contém o adaptador real, mas `ativo = false` impede seu uso antes da
homologação. Quando ativado, oferece login Supabase com sessão própria, sem
armazenar senha; RPCs validam a autorização no servidor. Paginação de 50 itens
por filtro; busca real pelo número exato. A identidade do entregador vem do
cadastro de acessos no servidor, nunca de um nome enviado pelo navegador.

## Decisões informadas pelo usuário

- Manter a estrutura atual durante este trabalho, permitindo que a aplicação
  registre entregas quando a integração estiver pronta.
- Recebedor, entregador e foto serão campos novos. Foram preparados em um
  cadastro próprio proposto, sem reutilizar `obs_entrega` como armazenamento.
- A proposta SQL está em arquivo revisável, **não aplicada**. A operação real
  depende da autorização e execução dessa etapa futura.

## Inspeção somente leitura

Confirmadas as tabelas `propostas`, `expedicoes`, `enderecos` e os metadados
dos buckets. A consulta de estados encontrou `EXPEDICAO`, `EM TRANSITO` e
`ENTREGUE`; o cadastro contém variações de caixa/espaços em Motoboy.
Não foi localizado contrato existente de foto/recebedor/entregador.
`propostas.id_endereco_ent` é texto; `expedicoes.id_endereco_entrega` é UUID.

O usuário confirmou o pedido 23604 como exemplo correto: Motoboy e
`EXPEDICAO`, mesmo sem linha em `expedicoes`. O filtro foi ajustado para
aceitar zero ou uma expedição vinculada, recusando duplicidade. A proposta não transforma automaticamente pedidos `EM TRANSITO` em
elegíveis. Os cálculos, preços e APIs existentes do ERP não foram alterados.

## Proposta de persistência, não executada

`sql/vibe_entregas_proposta.sql` propõe:

- Acessos explícitos por usuário e empresa, sem conceder acesso por mero login.
- Registros vinculados ao pedido/expedição, com entregador, nome, recebedor,
  horário do servidor, comprovante privado, observação e identificador de operação.
- Histórico separado de tentativas, sem concluir o pedido nesses casos.
- Funções para listar, assumir e registrar; bloqueio por linha e confirmação
  idempotente. A entrega atualiza o comprovante e
  `propostas.status_interno = ENTREGUE` na mesma transação. Atualiza também
  `expedicoes.data_entrega` quando essa linha já existe. Não cria expedição
  automaticamente; o vínculo no cadastro novo é opcional. Se a expedição
  aparecer entre a retirada e a entrega, vincula e atualiza a linha existente.
- Bucket novo privado, sem sobrescrita de fotos, limitado a JPEG/10 MB e com
  políticas próprias. Nenhuma política de tabela ou bucket anterior é modificada.
- Somente operações nos pedidos de empresas autorizadas ao usuário. Pedidos
  com mais de uma expedição são recusados até revisão da ambiguidade.

O arquivo continua **não aplicado em produção**. O SQL completo foi executado
com fixtures sintéticas em PostgreSQL em memória (PGlite já disponível no
cache local, sem instalar dependências). Os testes cobrem pedido sem expedição,
expedição posterior à retirada, foto privada, duplicidade, acesso por empresa,
reenvio e rollback atômico quando a atualização do pedido falha.
Ainda exige homologação dos triggers reais e concorrência com o ERP antes
de implantação. Não executar automaticamente contra produção.

Ainda dependem de implantação: cadastro dos entregadores/empresas autorizados,
ativação do adaptador e publicação web. Reassociação de motorista, entrega parcial, limpeza de uploads abandonados e
otimização de múltiplas paradas ficam fora desta primeira versão.

## Validação local

- `node --check` em app.js, api.js e sw.js: aprovado.
- `tests/vibe_entregas_browser_harness.cjs`: aprovado. Busca, filtros, retirada,
  foto obrigatória, prévia, revisão, confirmação, tentativa frustrada, saída,
  abertura offline e larguras 320/390/768. Zero chamadas ao ERP.
- `tests/vibe_entregas_api_harness.cjs`: aprovado com transporte simulado.
  Integração bloqueada por padrão, login recusado, confirmação vazia recusada,
  falha de upload e comparação de hash ao reenviar comprovante.
- Captura local: `dist/vibe-entregas/mobile.png`.
- `tests/vibe_entregas_pglite.cjs`: aprovado com SQL real e dados sintéticos
  em memória, sem conexão ao banco atual.
- Ainda não verificados: SQL em produção, câmera física, instalação Android/iOS,
  geração de comprovante real e alteração de status no ERP.

Para visualizar, servir `frontend/` por HTTP local e abrir `/entregas/`.
A origem localhost permite testar o service worker; acesso pelo IP de outro
aparelho exige HTTPS para testar os recursos seguros do PWA.

## Recuperação

Esta etapa adiciona arquivos isolados e uma regra de cache de `/entregas/*`.
Para interromper a futura oferta, manter o adaptador desativado e retirar a
entrada do novo PWA da publicação. Preservar os comprovantes e registros já
criados; não apagar estruturas ou evidências como procedimento de rollback.


## Página Entregas no Imposition

Implementada em `frontend/index.html`, `script.js` e `style.css`; sem novo
arquivo de runtime para o painel do NewProd. Menu Administração > Entregas,
restrito a ADM com permissão de visualizar administração na interface.

Consulta por número exato, situação e período, com páginas de 50 registros.
Disponíveis e com entregador não são limitados pelo período; conclusões e
ocorrências usam o intervalo escolhido, no fuso America/Sao_Paulo. Inicia em
Hoje. Exibe cliente, entregador, retirada, conclusão, recebedor, observações e
até 50 tentativas recentes por pedido. Atualização pelo botão Consultar.
Há demonstração explícita sem chamadas ao ERP para revisão visual.

A RPC `ve_acompanhar` valida autorização de gestor em
`vibe_entregas_acessos.gestor` por empresa. O valor inicial é falso e não há
cadastro automático de usuários. Ser ADM no navegador não concede acesso aos
dados no servidor. Fotos são privadas e abertas por URL assinada de 60 segundos;
a imagem é removida do DOM ao fechar o detalhe ou perder a sessão/permissão.
Uma URL já emitida permanece válida até expirar, mesmo após revogação.

A proposta SQL foi estendida apenas nos objetos novos. Testes com PostgreSQL
em memória verificam recusa de motorista comum na gestão, isolamento entre
empresas, foto inacessível de outra empresa, revogação e validação do período.
O navegador foi testado com dados simulados: autorização, conteúdo malicioso
renderizado como texto, consulta, foto temporária, demonstração, erro de
integração ausente e resposta tardia após perda de permissão.

A integração continua sem implantação. Para ativar, será necessário revisar e
aplicar a proposta SQL no projeto correto, cadastrar entregadores/gestores por
empresa, habilitar o adaptador do PWA e publicar os arquivos web. Não houve
criação de estruturas, escrita de entrega real, commit, push ou deploy.


## Organização de rotas — implementação local

Gráfica: Rua Felizardo de Farias, 81, Medianeira, Porto Alegre/RS,
CEP 90660-130. CEP e número fornecidos pelo usuário; logradouro conferido
por consulta pública ao ViaCEP. A localização atual exige consentimento no
navegador e não é persistida no cadastro de rotas.

O PWA permite selecionar até 20 pedidos já assumidos, escolher saída da gráfica
ou localização atual, moto/carro e retorno à gráfica. Sem retorno, o entregador
escolhe a última parada: ela permanece fixa e o Google ordena as intermediárias.
Antes de confirmar, exibe sequência, distância e duração estimadas de
DESLOCAMENTO (não inclui tempo de atendimento), além dos avisos do provedor.
A demonstração não usa Google nem inventa estimativas: a sequência é ilustrativa.

Depois da confirmação, navega para a próxima entrega pendente, acompanha as
conclusões e oferece retorno à gráfica quando previsto. Atualizar rota ativa
recupera a sequência persistida. O Imposition possui uma seção Rotas dos
entregadores, com ordem e progresso (até 50 rotas ativas). Não há divisão
automática de entregas entre motoristas nem otimização de janelas de horário.

A Edge Function `vibe-entregas-rotas` valida a sessão via Auth e usa endereços
obtidos no banco, nunca os textos enviados pelo navegador. O Google recebe
somente as localizações necessárias, sem nome do cliente ou recebedor. A chave
fica exclusivamente no servidor. Requer `VIBE_ROUTES_ENABLED=true` e
`GOOGLE_ROUTES_API_KEY`; por padrão recusa cálculos. Não configurado nem publicado.
Configurar chave restrita à Routes API e limites no projeto Google antes da
ativação. A flag desativada permite interromper novos cálculos.

`sql/vibe_entregas_rotas_proposta.sql` é aditivo e deve ser revisado/aplicado
APÓS a proposta base. Cria registro de solicitações, sequência e confirmação.
Bloqueio transacional limita a 20 solicitações por usuário/dia e 200 globais/dia
no fuso de São Paulo. Falhas depois da reserva também consomem essa cota;
repetir o mesmo identificador não dispara outro cálculo. Não há repetição
automática da API paga. Cotas Google devem complementar esses limites.

Somente o servidor pode gravar a ordem calculada; o usuário confirma uma
sequência de até 30 minutos, após nova validação dos pedidos. O cadastro
persiste os identificadores e a decisão operacional, não a resposta bruta,
polilinha, duração ou distância do Google. Uma nova rota confirmada substitui
a rota ativa anterior do mesmo entregador, preservando o histórico. Validar
políticas comerciais de armazenamento e atribuição do provedor na implantação.

Validações executadas sem serviços externos:
- Cinco testes Deno: retorno/última parada, índices inválidos, localização,
  desativação, autorização, reserva anterior à cobrança e resposta sem segredo.
- PostgreSQL em memória: propostas base e rotas completas, acesso, persistência
  da sequência, confirmação e recuperação, isolamento, cota e duplicidade.
- Navegador: selecionar pedidos, revisão, última parada fixa, navegação,
  geolocalização recusada e limpeza ao sair; nenhuma chamada ao Google/ERP.
- Mantidos os testes do painel de acompanhamento, comprovantes e API simulada.

Pendências: implantação SQL/Edge/web, acesso dos usuários, chave e habilitação
Google, orçamento/cotas, homologação com endereços reais e validação em moto e
carro. Não houve escrita em produção nem ativação de serviços pagos.

Referências técnicas consultadas:
- https://developers.google.com/maps/documentation/routes/opt-way
- https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes
