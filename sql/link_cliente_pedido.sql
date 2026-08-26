-- ══════════════════════════════════════════════════════════════════
-- O Portal do Pedido: um JSON só, entregue pelo par número+token.
--            Execute no SQL Editor do Supabase, ou por
--            `.\ferramentas\rodar_sql.ps1 sql\link_cliente_pedido.sql`
-- ══════════════════════════════════════════════════════════════════
--
-- Este arquivo é ADITIVO: ele só cria uma função e dá permissão de execução.
-- Nenhum privilégio de tabela é revogado aqui, e rodá-lo não muda o
-- comportamento de nenhuma tela existente.
--
-- ## O que ela conserta
--
-- Até 20/08/2026, a página do link do cliente montava a tela com SEIS consultas
-- diretas, todas com a chave anônima -- a que está no código-fonte da página e
-- que qualquer um lê com Ctrl+U:
--
--     propostas, clientes, enderecos, pedidos_artes,
--     producao_cores, producao_numeracoes, producao_formatos, produtos
--
-- A de `clientes` era `select('*')`. Ou seja, para mostrar nome, CNPJ, e-mail e
-- telefone, a página baixava também o limite de crédito, o risco de crédito e o
-- total de compras daquele cliente.
--
-- Isso já era demais para uma página pública. Com o Portal do Pedido ela passa a
-- mostrar VALORES -- orçamento, frete, total, link de pagamento --, e a porta
-- precisava mudar antes de o dinheiro entrar na tela.
--
-- ## Por que função, e não política de RLS
--
-- Porque a pergunta do cliente é "este pedido, com este token", e RLS não sabe
-- exigir que alguém FILTRE por uma coluna. Uma política que deixasse o cliente
-- ler a linha dele deixaria também `select=*` sem filtro devolver todas.
--
-- `SECURITY DEFINER` inverte isso: a função roda com o privilégio de quem a
-- criou, e quem decide o que sai é o corpo dela -- que exige o par número+token
-- e o link ativo. É o mesmo desenho da `link_cliente_abrir`, criada em
-- 16/08/2026 pelo mesmo motivo.
--
-- `search_path` fixo em `public` é o cuidado padrão de toda função
-- `SECURITY DEFINER`: sem ele, quem controlasse o `search_path` da sessão faria
-- a função enxergar uma tabela sua com o mesmo nome.
--
-- ## O que ela NÃO faz
--
-- Não fecha as tabelas do parceiro. `propostas`, `clientes`, `enderecos`,
-- `produtos_proposta` e `propostas_os` são do ERP Vibe, e revogar privilégio ali
-- quebraria telas que não são nossas. O que este desenho faz é a página pública
-- PARAR DE USAR aquela porta.
--
-- Não devolve o token de volta ao navegador: a página já o tem na URL, e
-- devolvê-lo entregaria justamente o que se está protegendo.

-- ─── A função ────────────────────────────────────────────────────────────────
--
-- Um JSON só, e não seis consultas, também por causa do celular: quem abre este
-- link é o cliente da gráfica, no 4G, pelo navegador embutido do WhatsApp. Cada
-- consulta é uma ida-e-volta antes de o primeiro pixel aparecer.

CREATE OR REPLACE FUNCTION public.link_cliente_pedido(
    p_numero text,
    p_token  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_link     pedidos_links_cliente%ROWTYPE;
    v_num      bigint;
    v_prop     propostas%ROWTYPE;
    v_cli      clientes%ROWTYPE;
    v_end      enderecos%ROWTYPE;
    v_end_fat  enderecos%ROWTYPE;   -- o endereço do CNPJ da nota (ver abaixo)
    v_os       propostas_os%ROWTYPE;
    v_arte     pedidos_artes%ROWTYPE;
    v_frete    cotacao_frete%ROWTYPE;
    v_itens    jsonb;
    v_pgtos    jsonb;
    v_grafica  empresas%ROWTYPE;
    v_end_do_cadastro boolean := false;
BEGIN
    -- O par inteiro, e `ativo`: um link revogado tem de parar de abrir.
    SELECT l.* INTO v_link
      FROM pedidos_links_cliente l
     WHERE l.numero_pedido = p_numero
       AND l.token = p_token
       AND l.ativo IS TRUE
     LIMIT 1;

    IF v_link.id IS NULL THEN
        RETURN NULL;   -- a tela do cliente já sabe mostrar "link inválido"
    END IF;

    -- O número do pedido é texto na tabela do link e inteiro nas do ERP.
    -- Número não-numérico não existe, mas se existir a função devolve vazio em
    -- vez de estourar na cara do cliente.
    BEGIN
        v_num := p_numero::bigint;
    EXCEPTION WHEN others THEN
        RETURN NULL;
    END;

    SELECT p.* INTO v_prop
      FROM propostas p
     WHERE p.id_int = v_num
     LIMIT 1;

    -- `id_faturado` vence `id_cliente` quando existe: são quase sempre o mesmo,
    -- mas divergem de verdade -- o pedido 20940 é do cliente 43520 e fatura no
    -- 66163. Quem manda na nota fiscal é o faturado.
    IF COALESCE(v_prop.id_faturado, v_prop.id_cliente) IS NOT NULL THEN
        SELECT c.* INTO v_cli
          FROM clientes c
         WHERE c.id_cliente = COALESCE(v_prop.id_faturado, v_prop.id_cliente)
         LIMIT 1;
    END IF;

    -- O endereço de entrega DESTE pedido.
    --
    -- Um cliente pode ter vários endereços, e quem diz qual é o da entrega é
    -- `propostas.id_endereco_ent` — a escolha feita no pedido. `enderecos.id` é
    -- uuid e a coluna é texto, daí o cast protegido.
    IF v_prop.id_endereco_ent IS NOT NULL AND v_prop.id_endereco_ent <> '' THEN
        BEGIN
            SELECT e.* INTO v_end
              FROM enderecos e
             WHERE e.id = v_prop.id_endereco_ent::uuid
             LIMIT 1;
        EXCEPTION WHEN others THEN
            NULL;   -- endereço mal referenciado não derruba o pedido inteiro
        END;
    END IF;

    -- Sem escolha no pedido, vale o endereço PRINCIPAL do cliente.
    --
    -- Regra do usuário, 20/08/2026. Ela é necessária: 2.024 dos 4.001 pedidos
    -- dos últimos 90 dias estão com `id_endereco_ent` vazio, e sem esta regra a
    -- aba não mostrava endereço nenhum na metade dos pedidos.
    --
    -- E ela resolve quase tudo. Medido nos 1.218 clientes desses pedidos:
    -- 1.217 têm EXATAMENTE UM endereço marcado como principal, nenhum tem dois,
    -- e o único sem principal tem um endereço só. Ou seja, não há empate a
    -- desfazer.
    --
    -- `upper(btrim(...))` porque a coluna vem do ERP com as duas grafias,
    -- "principal" e "Principal".
    IF v_end.id IS NULL AND v_prop.id_cliente IS NOT NULL THEN
        SELECT e.* INTO v_end
          FROM enderecos e
         WHERE e.id_cliente = v_prop.id_cliente
           AND upper(btrim(COALESCE(e.tipo_endereco, ''))) = 'PRINCIPAL'
         ORDER BY e.data_criacao NULLS LAST
         LIMIT 1;

        -- Cliente sem nenhum principal: vale o endereço, se ele for o único.
        -- Havendo vários e nenhum principal, escolher seria adivinhar -- e o
        -- pacote sairia para o endereço de outra obra.
        IF v_end.id IS NULL THEN
            SELECT e.* INTO v_end
              FROM enderecos e
             WHERE e.id_cliente = v_prop.id_cliente
               AND (SELECT count(*) FROM enderecos x WHERE x.id_cliente = v_prop.id_cliente) = 1
             LIMIT 1;
        END IF;

        v_end_do_cadastro := (v_end.id IS NOT NULL);
    END IF;

    -- O endereço DO CNPJ que vai na nota — a aba de Faturamento.
    --
    -- Pedido do usuário em 25/08/2026: *"no link onde mostra e pede confirmação
    -- dos dados da nota fiscal, deve mostrar também o endereço relativo ao CNPJ
    -- mostrado"*.
    --
    -- ## Por que não serve o endereço que a aba de Entrega já mostra
    --
    -- Porque eles são de duas pessoas diferentes quando o pedido fatura em outro
    -- cadastro. A aba de Entrega mostra o endereço DA ENTREGA, escolhido no
    -- pedido (`id_endereco_ent`) e, na falta dele, o principal de
    -- `v_prop.id_cliente`. A nota é emitida contra `id_faturado`, que pode ser
    -- outro — o pedido 20940 é do cliente 43520 e fatura no 66163. Repetir ali o
    -- endereço da entrega poria, embaixo de um CNPJ, o endereço de outra empresa.
    -- Por isso a busca é pelo MESMO id de quem preenche `cliente` acima.
    --
    -- ## Por que o PRINCIPAL
    --
    -- Porque não existe endereço de faturamento no banco: medido em 25/08/2026,
    -- `enderecos.tipo_endereco` só tem três valores — `PRINCIPAL`, `ENTREGA` e
    -- nulo. O principal é o endereço de cadastro da pessoa jurídica, que é o que
    -- a nota usa.
    --
    -- Cobertura, nos 62 links ativos daquele dia: TODOS os 62 faturados têm um
    -- principal. Nenhum ficou sem.
    --
    -- Mesmo desempate do bloco acima, e pela mesma razão: sem principal, vale o
    -- endereço só quando ele é o único; havendo vários, escolher seria adivinhar.
    IF COALESCE(v_prop.id_faturado, v_prop.id_cliente) IS NOT NULL THEN
        SELECT e.* INTO v_end_fat
          FROM enderecos e
         WHERE e.id_cliente = COALESCE(v_prop.id_faturado, v_prop.id_cliente)
           AND upper(btrim(COALESCE(e.tipo_endereco, ''))) = 'PRINCIPAL'
         ORDER BY e.data_criacao NULLS LAST
         LIMIT 1;

        IF v_end_fat.id IS NULL THEN
            SELECT e.* INTO v_end_fat
              FROM enderecos e
             WHERE e.id_cliente = COALESCE(v_prop.id_faturado, v_prop.id_cliente)
               AND (SELECT count(*) FROM enderecos x
                     WHERE x.id_cliente = COALESCE(v_prop.id_faturado, v_prop.id_cliente)) = 1
             LIMIT 1;
        END IF;
    END IF;

    -- O endereço da própria gráfica, para os pedidos de RETIRADA.
    --
    -- Lido de `empresas`, e não escrito aqui: se a gráfica mudar de endereço,
    -- quem atualiza é o cadastro do ERP, e esta página acompanha. A empresa 1 é
    -- a IDEAL GRÁFICA, dona deste sistema; as outras duas do mesmo grupo dividem
    -- o mesmo endereço.
    SELECT * INTO v_grafica FROM empresas WHERE id = 1 LIMIT 1;

    -- `propostas_os` é tabela nova do parceiro e ainda não cobre todo pedido:
    -- 23 linhas em 20/08/2026. Pedido sem linha fica sem prazo, sem rastreio e
    -- sem link de pagamento -- e a tela sabe dizer isso.
    SELECT o.* INTO v_os
      FROM propostas_os o
     WHERE o.id_int = v_num
     LIMIT 1;

    SELECT a.* INTO v_arte
      FROM pedidos_artes a
     WHERE a.id_int = v_num
     LIMIT 1;

    -- A cotação de frete que o cliente ESCOLHEU. É dela que sai o prazo de
    -- envio: `propostas` guarda o nome e o valor do frete, mas não o prazo.
    --
    -- `created_at DESC` porque um pedido pode ter mais de uma linha marcada
    -- como escolhida ao longo do tempo -- a expedição recota quando o peso ou o
    -- endereço mudam (ver `expedicao_recotacoes`). Vale a última.
    SELECT c.* INTO v_frete
      FROM cotacao_frete c
     WHERE c.id_int = v_num
       AND c.escolhido IS TRUE
     ORDER BY c.created_at DESC
     LIMIT 1;

    -- O prazo por produto ("1 dia útil") mora no catálogo, e não no item do
    -- pedido -- por isso o LEFT JOIN. LEFT, e não INNER: item cujo produto saiu
    -- do catálogo continua aparecendo no orçamento, só que sem prazo.
    SELECT jsonb_agg(item ORDER BY (item->>'id')::bigint)
      INTO v_itens
      FROM (
        SELECT jsonb_build_object(
                   'id',              pp.id,
                   'nome_produto',    pp.nome_produto,
                   'modelo_descri',   pp.modelo_descri,
                   'qtd',             pp.qtd,
                   'valor_unt',       pp.valor_unt,
                   'fixo',            pp.fixo,
                   'valor_sub_total', pp.valor_sub_total,
                   'prazo',           pr.prazo
               ) AS item
          FROM produtos_proposta pp
          LEFT JOIN produtos pr ON pr.id_produto = pp.id_produto
         WHERE pp.id_int = v_num
      ) AS itens;

    -- As cobranças do pedido, que são o link de pagamento e a forma.
    --
    -- Um pedido pode ter MAIS DE UMA: medido em 20/08/2026, 3.367 pedidos dos
    -- últimos 90 dias têm uma cobrança, mas 190 têm duas ou mais -- entrada mais
    -- parcelas, com o `id_pagamento` indo `20927-A`, `20927-B`. Mandar só a
    -- primeira esconderia do cliente metade do que ele tem a pagar.
    --
    -- Cobrança CANCELADA fica de fora: o link dela ainda abre, e mandar o
    -- cliente pagar uma cobrança cancelada é pior do que não mostrar nada.
    --
    -- `pix_copia_cola`, `linha_digitavel` e os dados de cartão NÃO saem daqui.
    -- Esta função é a porta de uma página pública; o que ela precisa entregar é
    -- o endereço da cobrança, e o resto o próprio gateway mostra depois.
    SELECT jsonb_agg(pg ORDER BY (pg->>'criado_em'))
      INTO v_pgtos
      FROM (
        SELECT jsonb_build_object(
                   'referencia', p2.id_pagamento,
                   'forma',      p2.tipo_cobranca,
                   'status',     p2.status,
                   'valor',      p2.valor,
                   'vencimento', p2.vencimento,
                   'link',       p2.url_cobranca,
                   'criado_em',  p2.created_at
               ) AS pg
          FROM pagamentos_v2 p2
         WHERE p2.id_int = v_num
           AND COALESCE(upper(p2.status), '') <> 'CANCELADO'
      ) AS pagamentos;

    RETURN jsonb_build_object(
        'pedido', jsonb_build_object(
            'numero',           v_link.numero_pedido,
            'os_id',            v_link.os_id,
            'status_arte',      v_link.status_arte,
            'cliente',          v_prop.cliente,
            'valor_total',      v_prop.valor_total,
            'valor_frete',      v_prop.valor_frete,
            'frete_escolhido',  v_prop.frete_escolhido,
            'modalidade_frete', v_prop.modalidade_frete,
            'texto_whatsapp',   v_prop.texto_whatsapp,
            'volume',           v_prop.volume,
            -- O NOME DO ATENDENTE, para o botão de ajuda saber com quem o
            -- cliente fala. Pedido do usuário em 25/08/2026: cada atendente tem
            -- o seu link de WhatsApp, e o recado já vai escrito com o nome dele.
            --
            -- É o nome, e não um id: o botão casa por nome porque é assim que o
            -- ERP grava (`propostas.vendedor` é texto). Quem não estiver na
            -- lista do `botaoDeAjuda` cai no recado genérico -- e é o que
            -- acontece hoje com 5 dos 10 nomes que aparecem no banco.
            'vendedor',         NULLIF(btrim(COALESCE(v_prop.vendedor, '')), ''),
            'id_cliente',       COALESCE(v_prop.id_faturado, v_prop.id_cliente)
        ),
        -- Cinco campos, escolhidos um a um: são os cinco que a aba de
        -- faturamento mostra. O `select('*')` que isto substitui trazia
        -- quarenta e três.
        'cliente', CASE WHEN v_cli.id IS NULL THEN NULL ELSE jsonb_build_object(
            'nome',         COALESCE(NULLIF(v_cli.nome, ''), v_cli.fantasia),
            'documento',    v_cli.documento,
            'ins_estadual', v_cli.ins_estadual,
            'email',        COALESCE(NULLIF(v_cli.email_financeiro, ''),
                                     NULLIF(v_cli.email_contato, ''),
                                     v_cli.email),
            'telefone',     COALESCE(NULLIF(v_cli.whatsapp_1, ''), v_cli.telefone_fixo)
        ) END,
        'endereco', CASE WHEN v_end.id IS NULL THEN NULL ELSE jsonb_build_object(
            'recebedor',     v_end.recebedor,
            'cpf_recebedor', v_end.cpf_recebedor,
            'endereco',      v_end.endereco,
            'numero',        v_end.numero,
            'complemento',   v_end.complemento,
            'bairro',        v_end.bairro,
            'cidade',        v_end.cidade,
            'uf',            v_end.uf,
            'cep',           v_end.cep,
            -- `true` quando o pedido nao escolheu endereco e este veio do
            -- cadastro do cliente. A tela diz isso ao cliente, em vez de
            -- apresentar como escolha dele.
            'do_cadastro',   v_end_do_cadastro
        ) END,
        -- O endereço do CNPJ que vai na nota. SEM `recebedor` e sem
        -- `cpf_recebedor`: aqueles dois são de quem recebe o PACOTE, e não têm o
        -- que fazer numa nota fiscal — repeti-los aqui só confundiria as duas
        -- abas. E esta página é pública: campo que a tela não mostra não sai.
        'endereco_faturamento', CASE WHEN v_end_fat.id IS NULL THEN NULL ELSE jsonb_build_object(
            'endereco',    v_end_fat.endereco,
            'numero',      v_end_fat.numero,
            'complemento', v_end_fat.complemento,
            'bairro',      v_end_fat.bairro,
            'cidade',      v_end_fat.cidade,
            'uf',          v_end_fat.uf,
            'cep',         v_end_fat.cep
        ) END,
        'grafica', CASE WHEN v_grafica.id IS NULL THEN NULL ELSE jsonb_build_object(
            'nome',        COALESCE(NULLIF(v_grafica.nome_fantasia, ''), v_grafica.empresa),
            'endereco',    v_grafica.logradouro,
            'numero',      v_grafica.numero,
            'complemento', v_grafica.complemento,
            'bairro',      v_grafica.bairro,
            'cidade',      v_grafica.municipio,
            'uf',          v_grafica.uf,
            'cep',         v_grafica.cep,
            -- O telefone da gráfica.
            --
            -- ATENÇÃO: NINGUÉM MAIS LÊ ESTE CAMPO. Ele nasceu em 25/08/2026 para
            -- o botão "falar com o meu atendimento", e no mesmo dia o botão
            -- mudou de fonte: passou a usar um link de WhatsApp POR ATENDENTE
            -- (`linkDoAtendimento`, em `cliente-entrega.js`), porque o cadastro
            -- da empresa só tem um fixo -- e mandar discar um fixo de dentro do
            -- navegador embutido do WhatsApp é o pior destino possível.
            --
            -- Fica aqui porque tirá-lo custa uma nova DDL em produção para
            -- economizar um campo de texto no JSON, e porque um telefone da
            -- gráfica é o tipo de dado que a próxima tela vai querer. Se ele
            -- continuar sem leitor na próxima passagem por este arquivo, remova.
            --
            -- O comentário original, que explica de onde ele sai:
            --
            -- Meia dúzia de avisos daquela página terminam em "fale com seu
            -- atendimento" e não ofereciam caminho nenhum: o cliente tinha de
            -- sair do link e procurar a conversa. Toda trava desta casa mostra
            -- a saída na própria tela, e esta era a exceção.
            --
            -- O número sai do CADASTRO, e não do código do site: gráfica que
            -- troca de telefone não pode depender de uma publicação para o
            -- botão voltar a funcionar. `telefone_nfse` primeiro porque é o
            -- campo preenchido hoje; `telefone_nfe` é a reserva.
            --
            -- `btrim` porque o cadastro guarda o número com uma quebra de linha
            -- na frente ("\r\n5132403363"), e a página monta um `href` com ele.
            -- Vazio vira NULL, e sem número o botão simplesmente não nasce --
            -- um botão de contato que não contata é pior do que aviso nenhum.
            'telefone',    NULLIF(btrim(COALESCE(NULLIF(btrim(COALESCE(v_grafica.telefone_nfse, '')), ''),
                                                 v_grafica.telefone_nfe, '')), '')
        ) END,
        'itens', COALESCE(v_itens, '[]'::jsonb),
        'os', CASE WHEN v_os.id IS NULL THEN NULL ELSE jsonb_build_object(
            'data_termino',        v_os.data_termino,
            'codigo_rastreamento', v_os.codigo_rastreamento,
            'link_pagamento',      v_os.link_pagamento,
            'forma_pagamento',     v_os.forma_pagamento,
            'status_pagamento',    v_os.status_pagamento
        ) END,
        'pagamentos', COALESCE(v_pgtos, '[]'::jsonb),
        'frete', CASE WHEN v_frete.id IS NULL THEN NULL ELSE jsonb_build_object(
            'servico', v_frete.servico,
            'prazo',   v_frete.prazo,
            'valor',   v_frete.valor
        ) END,
        'entrega', jsonb_build_object(
            'entrega_dados', v_arte.entrega_dados,
            'observacoes',   v_arte.observacoes
        )
    );
END;
$$;

COMMENT ON FUNCTION public.link_cliente_pedido(text, text) IS
'Devolve, num jsonb so, tudo o que as cinco abas do Portal do Pedido mostram ao cliente -- exigindo o par numero+token do link ativo. Criada em 20/08/2026 para que a chave anonima deixe de ler propostas, clientes e enderecos direto: a de clientes era select(*), e trazia limite de credito junto do nome.';

-- ─── Quem pode chamar ────────────────────────────────────────────────────────
--
-- `anon` é o cliente sem login, que é o ponto. `authenticated` entra junto
-- porque a mesma página pode ser aberta por alguém que por acaso tenha sessão do
-- ERP parceiro, e a função não deve tratá-lo pior.

GRANT EXECUTE ON FUNCTION public.link_cliente_pedido(text, text) TO anon, authenticated;

-- ─── A conferência, sem sair daqui ───────────────────────────────────────────
--
-- O esperado: `t` para o par certo de um link ativo, e nada para um token
-- errado. A consulta não imprime o JSON inteiro de propósito -- ele traz nome,
-- documento e endereço de um cliente real.

SELECT l.numero_pedido,
       public.link_cliente_pedido(l.numero_pedido, l.token) IS NOT NULL AS abriu_com_o_par_certo,
       public.link_cliente_pedido(l.numero_pedido, 'token-que-nao-existe') IS NULL AS recusou_o_token_errado
  FROM public.pedidos_links_cliente l
 WHERE l.ativo IS TRUE
 ORDER BY l.created_at DESC
 LIMIT 3;

-- E o endereço da nota, que entrou em 25/08/2026: quantos links ativos passam a
-- ter um. O esperado é TODOS -- medido naquele dia, os 62 faturados tinham um
-- endereço principal. A consulta conta em vez de imprimir: o endereço é de um
-- cliente real.

SELECT count(*)                                          AS links_ativos,
       count(*) FILTER (WHERE j->'endereco_faturamento' <> 'null'::jsonb) AS com_endereco_na_nota,
       count(*) FILTER (WHERE j->'endereco_faturamento' =  'null'::jsonb) AS sem_endereco_na_nota
  FROM public.pedidos_links_cliente l
 CROSS JOIN LATERAL (SELECT public.link_cliente_pedido(l.numero_pedido, l.token) AS j) t
 WHERE l.ativo IS TRUE
   AND t.j IS NOT NULL;
