# QR Ideal de 12 caracteres — análise da troca e do PWA

Data: 05/10/2026. Escopo: análise anterior à implementação. Nenhuma regra, credencial, função remota, instalação ou impressão foi alterada. O checkout operacional e suas alterações preexistentes foram preservados.

Este documento preserva o diagnóstico anterior à autorização de execução. A implementação,
as consultas administrativas posteriores e as provas de publicação estão no
[registro da entrega](entrega-qr-ideal-12-caracteres-2026-10-05.md).

## Parecer

O formato proposto, **quatro últimos dígitos do modelo invertidos + oito caracteres do código**, atende ao limite de 12 caracteres e separa os dois modelos do pedido 23063. Entretanto, **a substituição isolada do prefixo não está pronta para publicação**.

Há quatro condições para a troca: resolver o compartilhamento do sufixo secreto entre modelos; persistir a versão da emissão; corrigir a seleção dos sais e a atualização offline do PWA; fazer impressão local e preparação na nuvem usarem a mesma definição. Manter PBKDF2, sais existentes e identidade das credenciais antigas.

Na proposta, os quatro primeiros caracteres são numéricos; os oito restantes continuam alfanuméricos. Zeros à esquerda fazem parte do conteúdo. O limite de 12 vale para novas emissões; ingressos antigos precisam continuar legíveis e reimprimíveis com o conteúdo original.

## 1. Regra e caminhos atuais

```text
d = (últimos2(pedido) - últimos2(modelo)) módulo 100
coluna = 100 quando d = 0; caso contrário, d
posição = ((coluna - 1) × 30.000 + número_do_ingresso - 1) módulo 3.000.000
código = 8 caracteres da tabela nessa posição
QR v1 = inverter(pedido) + código
QR proposto = inverter(últimos4(modelo), preservando zeros) + código
```

Referências: `qr_ideal.py:45`, `engine.py:1863`, `frontend/qr-ideal-colunas.js:32`.

A posição depende do número efetivamente utilizado pelo elemento, inclusive início e via de TICKET. QTD continua sendo células físicas. O modelo não pode mudar de identidade nem ter sua quantidade dividida para acomodar o novo formato.

O caminho atual tem mais de um gerador:

| Caminho | Fonte | Consequência para a troca |
|---|---|---|
| Prévia real na estação | `app.py::qr_ideal_previa`, `frontend/qr-canvas.js::qrIdealConteudo` | Endpoint e cache da prévia precisam conhecer a versão. |
| PDF e reimpressão | `engine.py::_conteudo_qr_ideal`, `qr_ideal.py::PoolQR.conteudo` | O conteúdo deve permanecer idêntico ao emitido originalmente. |
| Publicação pelo NewProd | `acesso_publicacao.py::itens_do_pedido`, Edge `acesso-estacao` | A faixa publicada deve corresponder ao PDF e ao protocolo persistido. |
| Preparação independente na nuvem | `_compartilhado/preparacao_codigos.ts`, `preparacao_nuvem.ts`, RPC `producao_acesso_preparar_lote` | Também gera códigos e hashes ao preparar o evento; atualizar somente Python é insuficiente. |
| Leitura | `portaria-validacao.js`, `qr-ideal-hash.js`, `portaria.js` | Calcula hashes do texto lido e procura credenciais na carga offline. |

A preparação na nuvem lê uma base privada e confere seu tamanho e SHA-256. Sua existência está no código atual e no registro de entrega v946. Portanto, documentação antiga dizendo que a base jamais existe na nuvem não descreve a arquitetura atual. Esta análise não abriu nem baixou a base real, tampouco usou credencial de serviço.

Os hashes usam o conteúdo inteiro, PBKDF2-HMAC-SHA256, 10.000 iterações, sal persistente de 32 bytes por pedido e saída de 32 bytes. Python, JavaScript do PWA e Deno devem continuar concordando. Não é necessário trocar esse algoritmo para obter 12 caracteres no papel.

## 2. Pedido 23063: o que foi comprovado

Consulta atual em produção, somente leitura e restrita ao pedido: 22 modelos, 10.300 unidades. Os modelos 1001859 e 1001959 têm respectivamente 500 e 800 unidades, ambos iniciando em 1. Nenhum dos dois tinha `status_impressao` preenchido na consulta.

| Modelo | Prefixo v1 | Prefixo proposto | Coluna atual |
|---|---|---|---|
| 1001859 | 36032 | 9581 | 4 |
| 1001959 | 36032 | 9591 | 4 |

Usando metadados do pedido e uma tabela inteiramente sintética, o gerador real da nuvem produziu 500 repetições com a regra atual e zero repetições do texto completo com o prefixo proposto, entre 10.300 conteúdos gerados. Os oito caracteres finais continuaram compartilhados entre os dois modelos nos primeiros 500 números.

As consultas anônimas às tabelas de publicação e credenciais retornaram zero linhas visíveis. **RLS pode ocultar registros: isso não comprova que o pedido nunca foi preparado, publicado ou impresso.** O status de impressão vazio também não comprova ausência de PDFs ou papel. A elegibilidade desse pedido para uma primeira emissão v2 ainda precisa ser comprovada antes da ativação.

## 3. Riscos que a troca isolada não resolve

### Sufixo secreto compartilhado — bloqueador

Na proposta simples, dois ingressos do mesmo número nos modelos em conflito teriam textos diferentes, mas os mesmos oito caracteres secretos. Uma alteração apenas no prefixo de um código conhecido produziria exatamente o conteúdo esperado para o outro modelo. O hash não impede isso: ele é calculado sobre o texto apresentado, usando o sal do pedido.

Esse efeito foi reproduzido com códigos fictícios no validador real. Separar os textos elimina a colisão acidental, mas não cria um vínculo secreto entre código e modelo. Uma conferência de unicidade do texto completo, sozinha, aprovaria os dois e não detectaria esse problema.

**Recomendação:** manter o formato 4 + 8, mas definir uma atribuição de códigos que não reutilize o mesmo sufixo entre os modelos do evento. O caminho de menor ruptura a avaliar é reservar faixas não sobrepostas da base existente, com atribuição persistida e imutável. Reservar coluna apenas não basta quando o número ultrapassa 30.000, começa deslocado ou avança pelas vias de TICKET. É necessário conferir as posições realmente emitidas, crescimento de quantidade e capacidade.

Isso acrescenta uma decisão ao desenho: a escolha dos oito caracteres deixa de poder depender exclusivamente da fórmula atual nos modelos conflitantes. Uma derivação criptográfica ligada à identidade completa é outra alternativa, mas exige desenho e revisão próprios; não foi criada nem aprovada nesta análise.

### Repetição dos quatro dígitos e perda do pedido no texto

1001859 e 1011859 têm o mesmo prefixo proposto. No mesmo pedido, seus códigos voltam a coincidir nas mesmas posições. Também foi reproduzida colisão entre pedidos distintos com finais iguais e modelos com os mesmos quatro dígitos finais.

Sais diferentes não tornam seguro um QR idêntico entre dois eventos: cada evento calcula seu próprio hash daquele mesmo texto e pode reconhecê-lo. O sal protege o armazenamento, não acrescenta identidade ao papel.

A emissão v2 precisa auditar a combinação prefixo + posições atribuídas, dentro do evento e contra as emissões ainda válidas que possam repetir o conteúdo. O plano precisa definir o alcance e a retenção dessas reservas, inclusive casos legados de pedido com quatro dígitos. Não prometer unicidade global sem esse controle. O risco histórico de reutilização da base entre eventos permanece uma característica separada do sistema.

### Reemissão e identidade da credencial

No caminho legado de `acesso-estacao`, a chave de duplicidade inclui pedido, modelo, número e hash. Mudar o hash pode inserir outra credencial para o mesmo ingresso. A marca de entrada acompanha o ID da credencial, inclusive na proteção de entrada única do servidor.

Simulação: a credencial antiga retornou `ja_entrou`; outra credencial para o mesmo número, com outro hash e ID, retornou `permitido`.

Há uma diferença entre os publicadores: a RPC de preparação da nuvem contém uma recusa explícita quando já existe credencial da mesma posição com hash ou vínculo incompatível. Essa recusa não aparece no lote legado da estação. A migração deve unificar o contrato de imutabilidade nos dois caminhos, sem eliminar a proteção legítima de códigos iguais de QR comum em modelos diferentes.

Referências: `sql/schema_acesso_04_credencial_por_modelo.sql:80`, `sql/ideal_control_preparacao_nuvem.sql:105`, `supabase/functions/acesso-estacao/index.ts:109`, `frontend/portaria-validacao.js:181`.

### Preparação parcial e estações em versões diferentes

O plano atual da preparação contém início, passo e posição, mas não contém versão da formação do QR. O fingerprint cobre a fonte comercial; trocar apenas a função que gera o código não altera necessariamente essa fonte. Por inspeção, há risco de uma preparação retomada gerar uma parte com a regra antiga e outra com a nova.

A versão deve ser congelada antes do primeiro código, hash ou PDF, incluída no plano/fingerprint e no trabalho enviado ao agente. Preparações iniciadas continuam sob a versão original. O NewProd não deve escolher a regra pela data do computador ou pela versão do executável.

Rejeitar a publicação no servidor depois de um agente antigo produzir o PDF é tarde demais. A implantação precisa assegurar compatibilidade antes da geração e restringir a emissão v2 às estações atualizadas. Agentes antigos que ainda possam trabalhar offline não passam a obedecer a uma regra nova apenas porque a nuvem foi atualizada.

## 4. Correções necessárias no PWA

### 4.1 Escolha dos sais e compatibilidade

`pedidoDoConteudo()` remove os oito últimos caracteres e inverte o restante. `saisParaTentar()` retorna exclusivamente o sal desse pedido quando encontra a chave na carga.

Com o prefixo novo, `9581` é interpretado como pedido 1859. Se a carga também tiver esse pedido, o PWA escolhe o sal errado e recusa um QR v2 do pedido 23063 como desconhecido. Sem esse pedido homônimo, a tentativa de todos os sais pode fazer o mesmo QR funcionar. Essa variação foi reproduzida no navegador.

Não usar “12 caracteres = v2”: um QR v1 do pedido 1859 também tem 12 caracteres, e QR comum/importado pode ter qualquer comprimento.

Correção proposta para a primeira etapa de compatibilidade: calcular os hashes com todos os sais relevantes da carga autorizada, removendo valores duplicados, e avaliar todas as correspondências. Não parar na primeira correspondência nem estreitar as credenciais antes das regras de setor; isso esconderia ambiguidades e mudaria “outra porta” para “desconhecido”. Manter QR comum, barcode e código importado.

A prova de conceito que mudou apenas a seleção dos sais, dentro do ensaio e sem editar o aplicativo, reconheceu v1 e v2 e manteve o resultado de ambiguidade quando o mesmo texto correspondia a credenciais de setores diferentes. Três sais custaram aproximadamente 10 ms no Chromium deste computador; isso não mede Android/iPhone e não autoriza extrapolar para eventos com muitos pedidos.

Se a quantidade de pedidos tornar esse cálculo caro, fornecer na carga um índice completo de candidatos por prefixo, derivado no servidor dos pedidos/modelos e versões. O índice deve permitir múltiplos candidatos e contemplar o legado. A carga atual traz credenciais compactas `id/h/s/n`, sem pedido/modelo/versão por credencial; portanto essa otimização exige ampliar o contrato da API, não apenas mudar um parser. Nenhum segredo da tabela precisa ir para o celular.

### 4.2 Prontidão, publicação e versão de leitor

Hoje `prontoParaLer()` confere credenciais e a marca de publicação baixada. A marca do servidor deriva de pedido, data de publicação e contagem; não representa a versão do protocolo do QR.

Adicionar versão mínima/capacidades do leitor e esquema da carga. A prontidão deve verificar: leitor compatível, todas as páginas baixadas, mesma revisão durante o download, sais/metadados disponíveis e gravação concluída no IndexedDB. Uma incompatibilidade deve pedir atualização; não rotular ingressos legítimos como falsos.

O backend também deve conferir capacidades nas requisições de preparação/download. Um campo novo sozinho não protege o aplicativo antigo, que não o interpreta. Por isso o rollout começa pelo leitor compatível e só depois habilita a emissão v2 para eventos/aparelhos verificados. Aparelhos sem rede não são atualizados à distância.

A paginação precisa manter revisão coerente para credenciais, sais, índice e metadados. Alterar o protocolo sem aumentar a revisão deixaria uma carga antiga anunciada como pronta. A marca atual de publicação pode ser estendida; não deve ser confundida com versão de HTML ou service worker.

### 4.3 Dados offline e fila pendente

O IndexedDB `ideal-portaria`, versão 2, tem lojas `carga`, `fila`, `entradas` e `totais`. A carga é um objeto JSON; acrescentar metadados a ela não exige, por si só, criar outro banco ou aumentar sua versão.

Preservar IDs de credenciais, token/PIN, fila, entradas e totais. A versão da emissão não deve criar uma segunda identidade para o mesmo ingresso. Manter o registro atômico de fila + entrada e só remover leituras da fila após confirmação do servidor.

`gravarEventoPreparado()` já recusa substituir o evento quando há leituras pendentes. Manter essa proteção e orientar sincronização antes da substituição completa. Recarregar o aplicativo não exige apagar a fila; no ensaio, uma atualização do service worker e reabertura offline preservaram fila, entrada, total e marcador de sessão sintético.

Não usar reinstalação, “limpar dados”, zeramento ou `reiniciar.js` como migração. O marcador `qr-nuvem-947` pertence a uma limpeza histórica; incrementá-lo dispararia a limpeza novamente. Aparelhos anteriores a esse fluxo exigem verificação específica antes de receber a atualização, pois a ausência da marca participa do caminho de reinício já existente.

### 4.4 Service worker e recursos publicados

Consulta pública com cache-buster aos dois domínios: 24 verificações, 22 arquivos correspondentes ao checkout. A diferença é `controle.html` em ambos os domínios; as duas cópias públicas coincidem entre si. `portaria.html` e os scripts de leitura conferidos usam v948; a tela inicial pública referencia também arquivos v1010 e v1022.

O service worker v948 pré-carrega recursos com `?v=948` e procura scripts pela URL exata. Duas referências públicas da tela inicial não estão nesse precache:

- `supabase-config.js?v=1010`;
- `carregar-pedido.js?v=1022`.

A ausência dessas chaves foi comprovada em CacheStorage, e a requisição de `carregar-pedido.js?v=1022` falhou com rede indisponível no ensaio isolado. Isso demonstra uma lacuna de cache; não afirma que todos os aparelhos reais estão quebrados, pois o estado local de cada um não foi inspecionado.

Na entrega futura, alinhar HTML, manifestos de recursos e URLs versionadas em todas as entradas `/ic/`. Conferir que cada dependência referenciada está pré-carregada e que todos os recursos retornam o conteúdo esperado, não um HTML de fallback. Não basta mudar o número de `sw.js`.

O worker usa `skipWaiting()` e `clients.claim()`, mas isso não substitui JavaScript já executado numa aba. O ensaio comprovou worker v949 controlando uma página ainda executando a geração v948; a página passou à nova geração após recarregar. Preservar o aviso de atualização e uma reabertura controlada após concluir a leitura em andamento, sem recarga automática no meio da entrada de uma pessoa.

Manter a origem e o escopo `/ic/`. Mudar de domínio criaria outro armazenamento e outra instalação; não é necessário para esta troca.

### 4.5 Câmera, QR do evento e tamanho físico

A câmera repassa o texto decodificado; não há no caminho inspecionado um tamanho fixo de 13 caracteres para ingresso. `jsQR` decodificou corretamente os exemplos sintéticos de 12 e 13 caracteres. O QR de ativação do evento, PIN e vínculo do aparelho são outro protocolo e devem permanecer fora desta mudança de ingresso.

O limite de 12 caracteres foi respeitado na proposta. Contudo, a geração real de imagem, executada isoladamente, produziu matriz de 21 × 21 módulos tanto para 12 como para 13 caracteres nos exemplos testados; a biblioteca do frontend também produziu 21 × 21. Reduzir um caractere não garante redução física da matriz nem melhoria de leitura.

Manter cor, tamanho em milímetros, margem de leitura do layout e ausência de logo no QR impresso. A prova com imagem digital não substitui papel, iluminação, câmera de Android ou Safari/PWA de iPhone.

## 5. Escopo de implementação a preparar após a decisão

| Área | Alteração necessária |
|---|---|
| Contrato persistido | Esquema da emissão e atribuição dos códigos por pedido/modelo; imutabilidade; regras de crescimento e reservas; metadados antes de gerar. |
| SQL/RPC | Evolução aditiva revisável; plano/fingerprint com versão; recusa de identidade incompatível em ambos os publicadores; inventário antes de qualquer restrição nova. |
| Python/NewProd | Gerador, configuração do motor, jobs salvos, reimpressão, prévia e publicação usando o mesmo contrato. |
| Nuvem | `preparacao_codigos.ts`, `preparacao_nuvem.ts`, `acesso-estacao` e `portaria` compatíveis, inclusive retomada e capacidade do agente/leitor. |
| Painel | Guardas v1/v2 adequadas ao conteúdo/faixa real; `qr-ideal-colunas.js` não pode continuar proibindo todo compartilhamento de coluna nem ser simplesmente desligado; cache da prévia inclui a identidade da emissão. |
| PWA | Seleção de sais, metadados/capacidade, prontidão, paginação e pacote offline consistente; preservar fila e histórico. |

Há uma divergência adjacente que precisa entrar na validação: o publicador Python percorre `1..quantidade`, enquanto a preparação Deno considera início, passo e posição de TICKET. Não foi alterada. A comparação entre PDF, prévia e ambos os publicadores deve cobrir início diferente de 1, TICKET e reimpressão parcial, sem modificar as regras comerciais existentes.

Não é suficiente mudar o prefixo em `PoolQR.conteudo()`. Também não se deve mudar somente a mensagem de aviso, renomear a numeração ou retirar a proteção global de colisões.

## 6. Sequência segura de implantação e recuperação

1. Fechar o desenho dos oito caracteres: preservar 4 + 8 e impedir reaproveitamento entre modelos conflitantes. Definir e testar reservas/limites/compatibilidade antes de codificar a regra definitiva.
2. Inventariar, por leitura autorizada com visibilidade suficiente, emissões, PDFs, credenciais, preparações parciais, entradas e versões das estações/aparelhos do piloto. Registros sem prova de primeira emissão ficam no legado. O pedido 23063 ainda não foi liberado para migração.
3. Preparar em worktree isolado contrato aditivo, vetores congelados e proteção de escrita concorrente. Versionar antes de geração/publicação; metadado ausente de registro legado não vira v2 automaticamente. Sal e IDs históricos permanecem estáveis.
4. Entregar primeiro backend/leitor capazes de conviver com v1 e v2, mantendo v2 desligado para emissão. Conferir assets públicos, pré-cache, reabertura offline, fila pendente e aparelhos físicos.
5. Atualizar as estações autorizadas e comprovar a capacidade do executável, além do painel servido. Validar PDF, prévia e hashes de nuvem/estação com os mesmos vetores.
6. Habilitar um evento novo/controlado, sem ingresso antigo cuja identidade precisaria mudar. Conferir todos os aparelhos do evento, emissão, download, leitura, repetição e sincronização antes de ampliar.

Recuperação: antes da primeira emissão v2, desabilitar a ativação basta. Depois de emitir v2, manter o leitor e os geradores capazes de reconhecer/reimprimir essa versão; interromper novas emissões em caso de defeito. Reverter indiscriminadamente para um gerador v1 produziria outro QR. Não apagar credenciais nem histórico para voltar o frontend.

Se for necessário substituir um ingresso já emitido, isso constitui reemissão com cancelamento/identidade/auditoria explícitos e tratamento dos aparelhos offline. Não é efeito automático desta migração.

## 7. Provas realizadas e aceite ainda necessário

Evidência sanitizada: [evidencia-qr-ideal-12-caracteres-pwa-2026-10-05.json](evidencia-qr-ideal-12-caracteres-pwa-2026-10-05.json).

- Python: oito verificações de fórmula, colisão, preservação de zeros, limites da base e geometria real do gerador; tabela real não lida.
- Deno: sete verificações, incluindo paridade de hash com Python, plano de TICKET e simulação dos 22 modelos/10.300 unidades.
- Chromium 150.0.7871.24: 22 verificações/medições registradas, incluindo três vetores de hash iguais a Python/Deno, falha por pedido homônimo, prova conceitual de leitura compatível, ambiguidades, identidade duplicada, IndexedDB, cache, atualização e reabertura offline.
- Dois testes existentes de preparação Deno passaram, com fetch simulado, valores de ambiente fictícios e rede proibida.
- Arquivos estáticos públicos comparados nos dois domínios, com hashes normalizados guardados na evidência.

Os ensaios do navegador usam página isolada em localhost com os scripts reais de validação/armazenamento/service worker, evento e sessão sintéticos. Não houve login, ativação ou envio de leituras em produção. A primeira tentativa de simular offline apenas no alvo da página deixou o worker alcançar o servidor; o ensaio foi corrigido para interromper também a rede do servidor isolado e então repetido. Isso foi uma limitação do ensaio, não um defeito atribuído ao produto.

Reprodução temporária em `C:\Users\Junior\AppData\Local\Temp\ideal-qr12-analise-20261005-cee21f`: `public-audit.cjs`, `formula-audit.py`, `cloud-audit.ts`, `browser-audit.cjs`, resultados JSON e cópias dos assets públicos. Nenhum pool, segredo ou código de ingresso real foi salvo. Os resultados sanitizados e hashes relevantes foram preservados na evidência do repositório.

Antes de aprovar a implementação para produção, cobrir também: pedidos legados de quatro e cinco dígitos; evento misto; código comum/importado de 12 caracteres; modelo com final repetido; colisão entre eventos; preparação interrompida; publicação concorrente entre nuvem e estação; alteração de quantidade; início diferente de 1; vias de TICKET; reimpressão parcial; dispositivos com JS antigo e SW novo; falha em página intermediária; falta de espaço no IndexedDB; retomada após queda de rede; entrada simultânea em dois portões; preservação de filas; leitura física Android/iPhone.

Limites desta análise: o corpo remoto instalado de SQL/Edge e todos os executáveis das estações não foram inspecionados; as conclusões desses contratos vêm do código e dos registros locais. A leitura anônima não liberou o pedido 23063 para mudança. Não houve prova física. A suíte pytest não foi executada: não há `venv` no caminho documentado nem pytest no Python disponível. Nenhuma dependência foi instalada. Nenhuma correção funcional, SQL remoto, commit ou publicação foi realizada.

**Decisão recomendada:** prosseguir com o desenho versionado de 12 caracteres e com a correção de compatibilidade do PWA. Não ativar a troca simples de prefixo enquanto o sufixo compartilhado, as reservas de códigos e a imutabilidade da emissão não estiverem resolvidos e validados.
