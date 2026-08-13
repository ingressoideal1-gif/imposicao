# Controle de acesso, parte 2 — o modelo de dados e o QR do Pedido

Data: 13/08/2026

## O problema

A parte 1 pôs o código no papel: o ingresso sai da impressora com um QR Ideal que ninguém
adivinha ([docs/qr_ideal.md](../../qr_ideal.md)). Mas esse código não existe em lugar
nenhum fora da estação que o imprimiu. O cliente não tem como cadastrar o evento dele, a
nuvem não sabe que aqueles 5.000 ingressos existem, e o celular da portaria não tem o que
conferir.

Esta spec constrói a ponte: **o modelo de dados inteiro do controle de acesso**, o **QR do
Pedido** que o atendente manda ao cliente, e a **publicação automática da faixa** de
códigos quando o trabalho termina de imprimir.

Ela termina quando o cliente lê o QR com o celular e vê o evento dele carregado, com os
setores e as quantidades certas.

## O que já existe

**A parte 1, publicada.** Site v558, agente 1.2.57. O elemento `QR_IDEAL` no editor, o
pool de 3.000.000 de códigos ao lado do executável, `qr_ideal.py` com a regra, o endpoint
`/api/qr-ideal` e as travas de coluna no motor.

**O Ideal Control.** PWA em produção em `ideal-IdealControl/`: leitor `html5-qrcode`,
dashboard ao vivo, CRUD de eventos, setores e credenciais, importação de CSV por pipe e
realtime. Vive num Supabase próprio (`sodeliyjjoxpyvnssyzw`) **sem nada ativo**, confirmado
pelo usuário em 13/08/2026.

Três defeitos dele que esta spec e a próxima corrigem:

1. **O offline é falso.** O `sw.js` guarda só os arquivos da tela — e ainda lista SDKs do
   Firebase que saíram do projeto em junho. A validação vai ao Supabase a cada leitura: se
   a rede cai no portão, a portaria para.
2. **RLS desligado com a anon key pública.** Quem abrir a URL lê e escreve evento,
   credencial e log de qualquer cliente.
3. **Nada liga ao QR Ideal.** As credenciais de hoje são QRs que o próprio app inventa ou
   que vêm de CSV.

**As chaves do pedido**, confirmadas contra o banco de produção na parte 1:

| No vocabulário do usuário | Campo real |
|---|---|
| Pedido 20272 | `pedidos_modelos.id_int` |
| Modelo 1000022 | `pedidos_modelos.id` |
| Ingresso 7 | posição do item na tiragem |

O setor do evento sai de `nome_modelo`. O campo `setor` **já está ocupado** com o setor de
produção (FLEXO, TÊXTIL, PVC, LASER).

## Decisões do usuário

Da parte 1, ainda válidas:

- O pool é fixo, fica só no agente, e a coluna vem da fórmula.
- O QR do ingresso é `pedido de trás para frente + código`, sem separador.
- O app baixa **só a faixa do evento dele**, para não revelar a lista mestra.
- O Ideal Control é **evoluído**, não reescrito, e passa a usar o banco único.
- A faixa é publicada **automaticamente ao fechar a impressão**.

De 13/08/2026, nesta rodada:

- **O Ideal Control passa a morar dentro do repositório do Imposition.** Ganha os freios do
  `publicar.ps1`, a tag de restauração, o `voltar.ps1` e o `conferir.ps1` sem duplicação.
- **Cada aparelho da portaria tem conta do cliente mais um código curto por porteiro**,
  revogável um a um.
- **Duas leituras offline do mesmo ingresso deixam os dois entrarem**, e a duplicidade é
  apontada na sincronização. Ninguém fica parado no portão por causa de rede.
- **O cliente pode carregar códigos próprios** — staff, cortesia, lista VIP — fornecidos
  por ele.
- **Cada aparelho valida apenas uma lista de setores.** Um lê só Pista, outro só Camarote,
  outro todos.
- **Configurar o evento exige a senha do dono.** Sem ela é somente leitura — não muda
  setor, lotação, aparelho nem permissão. Ler ingresso e registrar entrada continuam
  livres, sem senha nenhuma.
- **Um evento pode ter mais de um pedido.** Isto **reverte** a decisão anterior de que um
  pedido é um evento.

## O que a reversão muda

`producao_acesso_eventos` deixa de ser "um por pedido". O pedido vira um anexo do evento, e
o setor carrega de qual pedido e modelo veio.

Duas consequências que valem registrar:

**Não surge colisão nova.** O conteúdo do QR começa com o número do pedido, então dois
pedidos diferentes no mesmo evento produzem conteúdos diferentes mesmo caindo na mesma
coluna do pool. A trava `_conferir_colunas_qr_ideal` do motor, que só olha modelos do mesmo
pedido, continua sendo suficiente — e continua necessária, porque dentro de um pedido o
prefixo é igual.

**O sal do hash é por pedido, não por evento.** O agente publica a faixa quando o trabalho
imprime, e nessa hora o evento pode nem existir. Um sal por evento obrigaria a segurar a
publicação até o cliente cadastrar — quer dizer, guardar código em claro em algum lugar
enquanto isso. Por pedido, o agente publica na hora e some com o código.

## A arquitetura

```
Agente (pool, offline)  ──hash──►  Render (service_role)  ──►  Supabase
                                          ▲
                                          │ JWT do cliente / token do aparelho
                                 Ideal Control (PWA, IndexedDB)
```

**Nenhuma chave de banco chega ao celular.** O app usa a anon key só para o login do
Supabase Auth; toda leitura e escrita de tabela passa pelo backend no Render, que valida o
JWT e usa `service_role` do lado servidor. Isso atende à proibição explícita de
`service_role` no frontend, em [REGRAS_BANCO.md](../../REGRAS_BANCO.md).

**A nuvem nunca vê o código do QR Ideal.** Guarda `codigo_hash`, resultado de um KDF lento
com sal por pedido. O celular confere calculando o mesmo hash do que leu. Um vazamento do
banco não entrega código nenhum: o espaço de busca é 36⁸ ≈ 2,8 × 10¹² por pedido, e cada
tentativa custa o KDF inteiro.

**O código que o cliente fornece é dele, e fica legível.** `codigo_visivel` só é preenchido
quando `origem = 'cliente'`. O nosso nunca. Assim o cliente administra a lista de staff
dele no painel, e o nosso segredo continua sendo nosso.

## O modelo de dados

Sete tabelas novas, prefixo `producao_acesso_`. Todas com UUID como PK, `created_at`,
`updated_at` com trigger, `empresa_id`, e `status` textual para soft delete — as convenções
de [REGRAS_BANCO.md](../../REGRAS_BANCO.md).

O DDL abaixo é o que precisa de aprovação formal antes de qualquer implementação.

```sql
-- ══════════════════════════════════════════════════════════════════════════════
-- IDEAL CONTROL — Controle de acesso (Supabase Vibecode)
-- Prefixo: producao_acesso_
-- ══════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- producao_update_updated_at() ja existe, criada no schema_catalogo.sql

-- ATENCAO AO empresa_id. Conferido no banco em 13/08/2026: ele e NULO em
-- 100% das linhas de TODAS as tabelas producao_* que existem hoje (12 formatos,
-- 59 numeracoes, 24 cores, 12 saidas, 4 modelos). A coluna existe por convencao
-- e o sistema opera com um inquilino so.
--
-- Consequencia que morde: em Postgres, NULO e DISTINTO de NULO dentro de um
-- indice unico. Escrever UNIQUE (empresa_id, pedido_id_int) com empresa_id nulo
-- nao garante nada -- o mesmo pedido entraria duas vezes sem uma reclamacao
-- sequer. Por isso toda chave unica abaixo e um indice sobre COALESCE, que vale
-- hoje com nulo e continua valendo no dia em que a coluna receber valor.
CREATE OR REPLACE FUNCTION producao_acesso_empresa(e UUID)
RETURNS UUID AS $$
    SELECT COALESCE(e, '00000000-0000-0000-0000-000000000000'::uuid);
$$ LANGUAGE sql IMMUTABLE;

-- ── 1. producao_acesso_eventos ───────────────────────────────────────────────
-- O evento do cliente. Pode reunir varios pedidos.
CREATE TABLE IF NOT EXISTS producao_acesso_eventos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID,
    id_cliente INTEGER,                     -- clientes.id_cliente do ERP (int, conferido)
    dono_auth_id UUID NOT NULL,             -- conta que reivindicou o evento
    nome_evento TEXT NOT NULL,
    data_evento TIMESTAMPTZ,
    local_evento TEXT,                      -- `local` sozinho e palavra-chave do SQL
    sal TEXT NOT NULL,                      -- sal dos codigos fornecidos pelo cliente
    status TEXT NOT NULL DEFAULT 'ativo',   -- ativo | encerrado | excluido
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER trg_producao_acesso_eventos_updated
    BEFORE UPDATE ON producao_acesso_eventos
    FOR EACH ROW EXECUTE FUNCTION producao_update_updated_at();

-- ── 2. producao_acesso_pedidos ───────────────────────────────────────────────
-- Um pedido publicado pelo agente. Nasce ANTES do evento existir: o agente
-- publica a faixa ao fechar a impressao, e so depois o cliente reivindica.
CREATE TABLE IF NOT EXISTS producao_acesso_pedidos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID,
    pedido_id_int INTEGER NOT NULL,
    evento_id UUID REFERENCES producao_acesso_eventos(id),  -- null ate reivindicar
    sal TEXT NOT NULL,                      -- 32 bytes em hex, unico por pedido
    qr_token_hash TEXT,                     -- sha256 do token do QR do Pedido
    qr_gerado_em TIMESTAMPTZ,
    qr_revogado_em TIMESTAMPTZ,
    publicado_em TIMESTAMPTZ,               -- quando o agente enviou a faixa
    total_credenciais INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'ativo',   -- ativo | arquivado
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER trg_producao_acesso_pedidos_updated
    BEFORE UPDATE ON producao_acesso_pedidos
    FOR EACH ROW EXECUTE FUNCTION producao_update_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS uq_acesso_pedido
    ON producao_acesso_pedidos (producao_acesso_empresa(empresa_id), pedido_id_int);

-- ── 3. producao_acesso_setores ───────────────────────────────────────────────
-- Um modelo = um setor. Nasce quando o cliente reivindica o pedido.
CREATE TABLE IF NOT EXISTS producao_acesso_setores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID,
    evento_id UUID NOT NULL REFERENCES producao_acesso_eventos(id),
    pedido_id_int INTEGER,                  -- null quando o setor e so de staff
    modelo_id INTEGER,                      -- pedidos_modelos.id (int, conferido)
    nome TEXT NOT NULL,                     -- nasce de nome_modelo; editavel
    quantidade INTEGER NOT NULL DEFAULT 0,
    lotacao INTEGER,                        -- null = sem limite
    tipo_uso TEXT NOT NULL DEFAULT 'unico', -- unico | reentrada
    status TEXT NOT NULL DEFAULT 'ativo',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER trg_producao_acesso_setores_updated
    BEFORE UPDATE ON producao_acesso_setores
    FOR EACH ROW EXECUTE FUNCTION producao_update_updated_at();

-- Parcial: setor de staff nao tem modelo, e varios nulos conviveriam.
CREATE UNIQUE INDEX IF NOT EXISTS uq_acesso_setor_por_modelo
    ON producao_acesso_setores (producao_acesso_empresa(empresa_id), modelo_id)
    WHERE modelo_id IS NOT NULL;

-- ── 4. producao_acesso_credenciais ───────────────────────────────────────────
-- Um ingresso. codigo_visivel SO existe quando origem='cliente'.
CREATE TABLE IF NOT EXISTS producao_acesso_credenciais (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID,
    pedido_id_int INTEGER,                  -- null quando origem='cliente'
    modelo_id INTEGER,                      -- null quando origem='cliente'
    evento_id UUID REFERENCES producao_acesso_eventos(id),   -- null ate reivindicar
    setor_id UUID REFERENCES producao_acesso_setores(id),    -- null ate reivindicar
    numero INTEGER,                         -- posicao na tiragem
    codigo_hash TEXT NOT NULL,
    codigo_visivel TEXT,                    -- SO quando origem='cliente'
    origem TEXT NOT NULL DEFAULT 'qr_ideal',-- qr_ideal | cliente
    status TEXT NOT NULL DEFAULT 'ativo',   -- ativo | cancelado
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER trg_producao_acesso_credenciais_updated
    BEFORE UPDATE ON producao_acesso_credenciais
    FOR EACH ROW EXECUTE FUNCTION producao_update_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS idx_acesso_credencial_hash
    ON producao_acesso_credenciais (producao_acesso_empresa(empresa_id), codigo_hash);
CREATE INDEX IF NOT EXISTS idx_acesso_credencial_evento
    ON producao_acesso_credenciais (evento_id, setor_id);
CREATE INDEX IF NOT EXISTS idx_acesso_credencial_pedido
    ON producao_acesso_credenciais (pedido_id_int, modelo_id, numero);

-- ── 5. producao_acesso_dispositivos ──────────────────────────────────────────
-- O aparelho da portaria. Nao tem conta: entra com o codigo curto do porteiro.
CREATE TABLE IF NOT EXISTS producao_acesso_dispositivos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID,
    evento_id UUID NOT NULL REFERENCES producao_acesso_eventos(id),
    nome TEXT NOT NULL,                     -- "Portao A", "Maria"
    codigo_hash TEXT NOT NULL,              -- hash do codigo curto que o porteiro digita
    token_hash TEXT,                        -- hash do token guardado no aparelho
    ultimo_visto TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'ativo',   -- ativo | revogado
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER trg_producao_acesso_dispositivos_updated
    BEFORE UPDATE ON producao_acesso_dispositivos
    FOR EACH ROW EXECUTE FUNCTION producao_update_updated_at();

-- ── 6. producao_acesso_dispositivo_setores ───────────────────────────────────
-- Em quais setores este aparelho valida entrada. Mexer aqui exige a senha do dono.
CREATE TABLE IF NOT EXISTS producao_acesso_dispositivo_setores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID,
    dispositivo_id UUID NOT NULL REFERENCES producao_acesso_dispositivos(id),
    setor_id UUID NOT NULL REFERENCES producao_acesso_setores(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT unique_dispositivo_setor UNIQUE (dispositivo_id, setor_id)
);

CREATE TRIGGER trg_producao_acesso_dispositivo_setores_updated
    BEFORE UPDATE ON producao_acesso_dispositivo_setores
    FOR EACH ROW EXECUTE FUNCTION producao_update_updated_at();

-- ── 7. producao_acesso_leituras ──────────────────────────────────────────────
-- Toda leitura, inclusive as negadas. E a base de todo relatorio.
CREATE TABLE IF NOT EXISTS producao_acesso_leituras (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID,
    evento_id UUID NOT NULL REFERENCES producao_acesso_eventos(id),
    -- NOT NULL de proposito: toda leitura vem de um aparelho, e este campo faz
    -- parte da chave de idempotencia abaixo. Nulo aqui desligaria a chave e
    -- deixaria a fila reenviada duplicar a lotacao -- exatamente o que ela existe
    -- para impedir.
    dispositivo_id UUID NOT NULL REFERENCES producao_acesso_dispositivos(id),
    credencial_id UUID REFERENCES producao_acesso_credenciais(id),  -- null se nao bateu
    setor_id UUID REFERENCES producao_acesso_setores(id),
    id_local TEXT NOT NULL,                 -- id gerado pelo aparelho; idempotencia
    momento TIMESTAMPTZ NOT NULL,           -- hora DO APARELHO
    recebido_em TIMESTAMPTZ DEFAULT now(),  -- hora do servidor
    tipo TEXT NOT NULL DEFAULT 'entrada',   -- entrada | saida
    resultado TEXT NOT NULL,                -- permitido | negado
    motivo TEXT,                            -- ja_entrou | setor_nao_autorizado |
                                            -- desconhecido | cancelado | fora_do_evento
    status TEXT NOT NULL DEFAULT 'ativo',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT unique_leitura_do_aparelho UNIQUE (dispositivo_id, id_local)
);

CREATE TRIGGER trg_producao_acesso_leituras_updated
    BEFORE UPDATE ON producao_acesso_leituras
    FOR EACH ROW EXECUTE FUNCTION producao_update_updated_at();

CREATE INDEX IF NOT EXISTS idx_acesso_leitura_evento
    ON producao_acesso_leituras (evento_id, momento DESC);
CREATE INDEX IF NOT EXISTS idx_acesso_leitura_credencial
    ON producao_acesso_leituras (credencial_id, tipo);
```

### Por que cada decisão do modelo

**`unique_leitura_do_aparelho (dispositivo_id, id_local)`.** Sem isso, o celular que ficou
três horas offline reenvia a fila, o servidor grava tudo de novo, e a lotação do relatório
sai errada — justamente o número que o cliente pagou para ter. O aparelho gera o `id_local`
no momento da leitura e nunca o muda.

**`momento` separado de `recebido_em`.** A hora que interessa ao relatório é a da leitura,
não a da sincronização. Num evento com portaria offline as duas podem diferir em horas.

**`credencial_id` pode ser nulo.** Um QR desconhecido também vira registro: é assim que se
descobre tentativa de falsificação, e o relatório precisa mostrar quantas houve.

**Setores nunca se fundem.** Dois pedidos podem trazer dois modelos chamados "PISTA". Eles
continuam sendo dois setores, cada um com o seu `modelo_id`, porque a quantidade e a
reimpressão são por modelo. O cliente renomeia à vontade, e o relatório agrupa por nome.

**`unique_setor_por_modelo`.** Um modelo não pode virar setor em dois eventos: seria a mesma
tiragem valendo em duas portas.

## O QR do Pedido

**O QR não carrega os dados do evento.** Ele é uma URL curta com um token assinado, e o app
troca o token no backend pelo esqueleto do evento.

```
https://ideal-imposition.vercel.app/e/<token>
token = base64url( pedido_id_int . expira_em . HMAC-SHA256(segredo_servidor) )
```

A razão de não embutir os dados é a regra do projeto de que **o que o parceiro escreve no
banco é a origem da verdade**: um QR com a lista de setores dentro continuaria afirmando a
quantidade velha depois que o ERP mudasse o pedido. Como URL, ele também abre pela câmera
nativa do celular — o cliente não precisa instalar nada antes de conseguir usar.

**Onde nasce.** Botão "Gerar QR do evento" no painel do pedido, no Imposition. Gera o
token, grava `qr_token_hash` e `qr_gerado_em`, e mostra o QR para o atendente salvar ou
mandar pelo WhatsApp.

**O primeiro cadastro trava o evento na conta que cadastrou.** O QR viaja por WhatsApp,
então quem receber a imagem consegue reivindicar o pedido — uma vez. Depois disso,
`producao_acesso_pedidos.evento_id` está preenchido e uma segunda leitura por outra conta é
recusada. Aparelho novo entra por código de dispositivo, nunca relendo o QR. Se o pedido
cair na conta errada, o atendente gera outro QR, o que grava `qr_revogado_em` no anterior e
desfaz o vínculo.

**Ler o segundo QR do mesmo evento.** Quando a conta já tem evento, o app pergunta: criar
evento novo ou anexar a um existente. Anexar cria os setores daquele pedido dentro do
evento que já existe.

## A publicação da faixa

Ao fechar a impressão de um trabalho que use QR Ideal, o agente:

1. Pede ao backend a abertura da publicação daquele pedido. O backend gera o `sal` (32
   bytes aleatórios), grava a linha em `producao_acesso_pedidos` e devolve o sal.
2. Para cada modelo e cada item, calcula `conteudo = prefixo(pedido) + codigo` e
   `hash = KDF(conteudo, sal)`.
3. Envia em lotes `{modelo_id, numero, hash}` e, ao terminar, marca `publicado_em` e
   `total_credenciais`.

**Isso roda em linha de fundo, depois que o PDF já foi para a impressora.** O agente existe
por causa de tempo: segurar o operador para calcular hash trairia o motivo dele existir. Se
a rede estiver fora, a publicação fica pendente e é retentada — o papel já saiu, e o evento
é dias depois.

**O KDF.** PBKDF2-HMAC-SHA256, 10.000 iterações, saída de 32 bytes em hex. Escolhido por
existir pronto nos dois lados que precisam dele: `hashlib.pbkdf2_hmac` no Python do agente e
`crypto.subtle.deriveBits` no navegador, sem dependência nova em lugar nenhum. A 10.000
iterações, forjar por força bruta custa 2,8 × 10¹⁶ operações por pedido; publicar 5.000
credenciais custa cerca de 15 segundos de linha de fundo, e uma leitura no celular custa
milissegundos.

## Cada aparelho valida só os setores dele

Cada aparelho valida **apenas os setores da lista dele**. Um lê só Pista, outro só Camarote,
outro todos. A lista mora em `producao_acesso_dispositivo_setores`.

**Um ingresso lido no aparelho errado é recusado com cara própria.** O motivo
`setor_nao_autorizado` precisa ser visualmente diferente de `desconhecido`: são situações
opostas, e confundi-las faz o porteiro devolver um ingresso bom achando que é falso. A tela
diz qual setor o ingresso é e quais setores aquele aparelho atende.

Isso não conflita com a regra de colisão escolhida: dois aparelhos podem atender o mesmo
setor, e nesse caso a duplicidade offline continua passando e sendo apontada depois.

## A senha do dono tranca a configuração do evento inteira

Confirmado pelo usuário em 13/08/2026: *"sem a senha é somente leitura = não altera as
configurações do evento"*. A trava **não** é só da lista de setores do aparelho.

**Sem a senha, o aparelho opera e não configura.** Ler ingresso, registrar entrada e saída,
ver a lotação e consultar quais setores aquele aparelho atende continuam livres — é o
trabalho do porteiro, e pedir senha para isso pararia a fila. O que fica somente leitura é
tudo que muda o evento:

| Sempre livre | Só com a senha do dono |
|---|---|
| Ler ingresso e registrar entrada/saída | Nome, data e local do evento |
| Ver lotação e contagem | Nome, lotação e tipo de uso de cada setor |
| Ver quais setores o aparelho atende | Quais setores cada aparelho valida |
| Ver a lista de aparelhos | Criar, renomear e revogar aparelho |
| | Anexar ou desvincular pedido |
| | Cancelar credencial e importar códigos do cliente |

**A senha é conferida na hora, e nunca é guardada.** O app manda a senha ao backend, que
confere contra o Supabase Auth e devolve uma **elevação de 15 minutos** válida só naquele
aparelho. Elevação, e não sessão permanente, porque o aparelho está na mão do porteiro: uma
autorização que não expira vira, na prática, um aparelho configurável para sempre.

A elevação acaba antes dos 15 minutos ao sair da tela de configuração, e enquanto estiver
ativa a tela **anuncia** que está — faixa "Modo configuração" com o tempo restante e um
botão de sair. Uma trava que se desarma em silêncio é pior que nenhuma: o dono guarda o
celular achando que trancou.

## Escopo desta spec

Entra:

| Entrega | Onde |
|---|---|
| DDL das sete tabelas | `sql/schema_acesso.sql` |
| Botão "Gerar QR do evento" | painel do pedido, `frontend/` |
| Emissão e troca do token | `app.py` |
| Reivindicar pedido: criar ou anexar a evento | `app.py` + tela nova |
| Publicação da faixa pelo agente | `agent_worker.py` + `qr_ideal.py` |
| O KDF compartilhado, com valor de conferência | `qr_ideal.py` + `frontend/` |

Fica de fora, para a **parte 3**: o app da portaria com IndexedDB e validação local, o
login do cliente, os dispositivos e a senha do dono na prática, reentrada, lotação ao vivo,
relatórios, a mudança do Ideal Control para `frontend/controle.html`, e a limpeza do `sw.js`.

Esta spec **não altera nenhuma tabela existente** e não toca em nada do parceiro.

## Testes

- `qr_ideal.py`: o KDF bate com um valor de conferência fixo, e o mesmo código com sais
  diferentes dá hashes diferentes.
- O harness de navegador confere que `crypto.subtle` produz **o mesmo hash** que o Python
  para a mesma entrada. Se os dois divergirem, todo ingresso é recusado na portaria — é a
  falha mais cara possível e a mais fácil de não perceber.
- O token do QR: expira, é recusado depois de revogado, e é recusado com assinatura
  adulterada.
- Reivindicar duas vezes o mesmo pedido por contas diferentes: a segunda é recusada.
- Anexar um segundo pedido a um evento existente cria os setores certos e não mexe nos
  anteriores.
- A publicação é idempotente: reenviar o mesmo lote não duplica credencial.

## Riscos aceitos

**O QR do Pedido circula por WhatsApp.** Quem tiver a imagem antes do cliente reivindica o
evento. Mitigação: uma reivindicação só, revogação pelo atendente, e o vínculo aparece no
painel do pedido para o atendente conferir.

**A hora do aparelho pode estar errada.** Um celular com relógio adiantado grava `momento`
errado. Guardamos `recebido_em` junto, e o relatório mostra quando as duas divergem muito.

**Sal por pedido, não por credencial.** Sais por credencial impediriam o celular de montar
um índice de busca — ele teria de testar 5.000 hashes por leitura. Sal por pedido mantém
uma conta por leitura e já elimina precomputação e correlação entre eventos.

## O que a consulta ao banco resolveu

Consulta somente leitura em 13/08/2026, contra `vwbtitjlpelrcnsytzqw`.

**`clientes.id_cliente` é `int`**, não texto — e existe um `clientes.id` separado, esse
sim texto. O campo do evento virou `INTEGER`.

**`pedidos_modelos.id` é `int`**, com valores na casa de 1.000.000 — longe do teto de
`INTEGER`. Os campos `modelo_id` passaram de `BIGINT` para `INTEGER`, casando com a origem.

**O caminho do pedido até o cliente existe e é direto:** `pedidos_modelos.id_int` é o mesmo
número de `propostas.id_int` (conferido nos pedidos 20508 e 20596), e `propostas.id_cliente`
dá o cliente. Não existe tabela `pedidos` neste banco — quem responde por pedido é
`propostas`. O backend preenche `id_cliente` do evento por esse caminho, em leitura.

**`empresa_id` é nulo em 100% das linhas `producao_*`** — todas as 111 linhas das cinco
tabelas povoadas. A coluna existe por convenção e o sistema opera com um inquilino só.

Esse último achado consertou um defeito que este DDL teria entregue: as chaves únicas
estavam escritas como `UNIQUE (empresa_id, coluna)`, e em Postgres **nulo é distinto de
nulo dentro de um índice único**. Com `empresa_id` sempre nulo, essas restrições não
garantiriam nada — o mesmo pedido poderia ser publicado duas vezes, e a mesma credencial
gravada duas vezes, sem uma reclamação sequer. Agora são índices sobre
`producao_acesso_empresa(empresa_id)`, que valem hoje com nulo e continuam valendo se a
coluna receber valor.

> A mesma falha existe hoje em `producao_produtos_formatos`, que declara
> `UNIQUE (empresa_id, id_produto)`. A tabela está vazia, então não há dado errado — mas a
> restrição não faz o que o nome dela promete. Vale corrigir quando essa tabela for usada.
