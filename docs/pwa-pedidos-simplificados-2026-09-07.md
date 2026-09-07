# Conferir pedidos no celular e preparar a leitura

No PWA `https://imposition.ai-ideal.com.br/ic/`, **Conferir pedidos · Gráfica**
abre uma consulta por número de pedido ou nome do cliente. O acesso usa a
conta da gráfica, com papel `admin` ou `atendimento` conferido pelo servidor.
Não exige a senha do cliente e não amplia os papéis existentes.

A conferência mostra modelos, quantidade de códigos publicados, evento e
quantidade de aparelhos. É somente leitura: não assume um portão, não altera
o dono do evento e não registra entrada de ingressos. Os resultados não são
armazenados para uso offline e são limpos ao sair da tela ou trocar de conta.
O botão **Testar PWA neste aparelho** verifica o cache da tela inicial;
não comprova que um pedido tenha sido baixado para leitura.

Para o cliente, **Meus Pedidos > Preparar para leitura** reúne a confirmação
do evento e a habilitação do aparelho. Nome/data/local e a opção de juntar um
pedido complementar continuam disponíveis em uma seção expansível. O nome
do aparelho vem preenchido e pode ser editado. A senha só é pedida quando
a autorização recente não estiver disponível, preservando a elevação.

Depois da confirmação, o fluxo existente baixa e grava os dados no IndexedDB.
A tela de leitura informa que o evento foi salvo somente depois dessa etapa,
ou depois de recuperar uma carga já salva. Falha na preparação do aparelho
preserva o evento criado e mostra como retomar por Meus Eventos.

Leituras pendentes de outro evento bloqueiam a troca do aparelho. Falha ao
consultar a fila também bloqueia; não significa fila vazia. Um aparelho já
ligado ao evento é reutilizado. O teste de duplo toque confere que o pedido
não é enviado duas vezes pelo mesmo botão.

## Entrega e limites

- Frontend PWA: versão de cache 834 nas páginas da casa e da portaria.
- API: nova busca GET `/acesso-interno/clientes?busca=...`, depois da guarda
  `quemConfigura`, limitada a 30 resultados, retornando somente ID e nome.
- Listas de pedidos recentes mantêm os limites existentes; busca por número
  permite consultar pedidos que não aparecem nos recentes.
- Nenhuma migração de banco, alteração de RLS ou build do NewProd é necessário.
- A fonte do painel local inclui o novo módulo na lista de atualização; um
  executável já instalado precisa receber uma atualização para mudar sua lista.

Validação usa dados fictícios, banco simulado e Chrome descartável. Inclui
recusa de papéis não autorizados, ausência de escrita na conferência, limpeza
de respostas atrasadas/troca de conta, pedido complementar, fila pendente ou
ilegível e reutilização do aparelho. Layout conferido em 390 px sem overflow.

A validação física no iPhone ainda deve confirmar login da conta da gráfica,
consulta de um pedido e preparação de um evento de teste autorizado. Manter
a instalação antiga até conferir a sincronização de suas leituras pendentes.
