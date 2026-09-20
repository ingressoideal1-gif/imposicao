"""Monta regressao SQL com dados sinteticos, sem conexao ou credenciais.

Execute o SQL gerado somente num PostgreSQL DESCARTAVEL autorizado.
O schema exclusivo e revertido com ROLLBACK, inclusive a migracao sob teste.
Exemplo: python tests/pedido_avulso_regressao.py > rascunhos/teste_avulso.sql
"""
from pathlib import Path
import re

RAIZ = Path(__file__).resolve().parents[1]
SCHEMA = "teste_pedido_avulso_20260909"

FIXTURE = r"""
BEGIN;
SET LOCAL statement_timeout = '30s';
CREATE SCHEMA teste_pedido_avulso_20260909;
SET LOCAL search_path = teste_pedido_avulso_20260909, pg_catalog;
CREATE TABLE propostas (id_int integer PRIMARY KEY, is_avulso boolean);
CREATE TABLE produtos_proposta (
 id bigint PRIMARY KEY, id_int integer REFERENCES propostas ON DELETE CASCADE,
 nome_produto text NOT NULL, qtd integer, valor_base numeric,
 peso_base numeric, peso_total numeric GENERATED ALWAYS AS (qtd*peso_base) STORED,
 updated_at timestamptz DEFAULT now()
);
CREATE TABLE pedidos_modelos (
 id bigint PRIMARY KEY, id_int integer NOT NULL,
 id_produto_proposta_origem bigint,
 nome_modelo text, quantidade integer, numeracao_inicio integer,
 bloco text, csv_selecao jsonb, arte_url text, status_arte text,
 CONSTRAINT fk_pedidos_modelos_produtos_proposta
 FOREIGN KEY(id_produto_proposta_origem) REFERENCES produtos_proposta ON DELETE CASCADE
);
CREATE TABLE produtos_proposta_variacao (
 id bigint PRIMARY KEY, id_produto_proposta bigint
 REFERENCES produtos_proposta ON DELETE CASCADE,
 nome_variacao text, v_extra numeric, updated_at timestamptz DEFAULT now()
);
CREATE TABLE pedidos_bancos (id integer PRIMARY KEY, id_int integer, csv_data jsonb);
CREATE TABLE pedidos_modelos_banco (
 modelo_id text PRIMARY KEY, banco_id integer REFERENCES pedidos_bancos, csv_mapa jsonb
);
CREATE FUNCTION conferir(ok boolean, mensagem text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN
 IF ok IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %', mensagem; END IF;
END $$;
INSERT INTO propostas VALUES (1,false),(2,false),(3,true);
INSERT INTO produtos_proposta(id,id_int,nome_produto,qtd,valor_base,peso_base)
 VALUES (11,1,'Sintetico A',40,1.125,0.25),(12,1,'Sintetico B',20,2.5,0.5),
        (22,2,'Outro pedido',7,3.25,0.5);
INSERT INTO pedidos_modelos VALUES
 (101,1,11,'Modelo A',40,0,'10','[1,3]','https://example.invalid/a.pdf','APROVADA_CLIENTE'),
 (102,1,12,'Modelo B',20,81,'10','[2,4]','https://example.invalid/b.pdf','APROVADA'),
 (202,2,22,'Modelo outro',7,1,'1','[]',NULL,'PENDENTE');
INSERT INTO produtos_proposta_variacao(id,id_produto_proposta,nome_variacao,v_extra)
 VALUES (111,11,'Sintetica',0.875);
INSERT INTO pedidos_bancos VALUES (1,1,'[{"codigo":"0001"},{"codigo":"0002"}]');
INSERT INTO pedidos_modelos_banco VALUES ('101',1,'{"codigo":"codigo"}');
CREATE TEMP TABLE antes_modelos AS SELECT * FROM pedidos_modelos WHERE id_int=1;
CREATE TEMP TABLE antes_produtos AS SELECT * FROM produtos_proposta WHERE id_int=1;
CREATE TEMP TABLE antes_variacoes AS SELECT * FROM produtos_proposta_variacao;
"""

CENARIOS = r"""
-- Marcar, salvar no ERP removendo os produtos, conferir os modelos preservados.
UPDATE propostas SET is_avulso=true WHERE id_int=1;
DELETE FROM produtos_proposta WHERE id_int=1;
SELECT conferir((SELECT count(*)=0 FROM produtos_proposta WHERE id_int=1),'produtos saem da lista comercial avulsa');
SELECT conferir((SELECT count(*)=2 FROM pedidos_modelos WHERE id_int=1),'modelos sobrevivem');
SELECT conferir((SELECT bool_and(id_produto_proposta_origem IS NULL) FROM pedidos_modelos WHERE id_int=1),'origens desvinculadas');
SELECT conferir((SELECT count(*)=2 FROM pedidos_produtos_avulsos_arquivo WHERE id_int=1 AND restaurado_em IS NULL),'produtos arquivados');
SELECT conferir((SELECT count(*)=1 FROM pedidos_modelos_banco WHERE modelo_id='101'),'vinculo CSV preservado');
SELECT conferir((SELECT csv_data='[{"codigo":"0001"},{"codigo":"0002"}]' FROM pedidos_bancos WHERE id=1),'CSV preservado');
SELECT conferir((SELECT count(*)=1 FROM produtos_proposta WHERE id_int=2),'outro pedido intacto');

-- Desmarcar: IDs, valores, variacoes, arte, numeracao e selecao CSV voltam iguais.
UPDATE propostas SET is_avulso=false WHERE id_int=1;
SELECT conferir(NOT EXISTS(SELECT * FROM antes_modelos EXCEPT SELECT * FROM pedidos_modelos),'modelos originais completos');
SELECT conferir(NOT EXISTS(SELECT * FROM antes_produtos EXCEPT SELECT * FROM produtos_proposta),'produtos originais completos e peso gerado');
SELECT conferir(NOT EXISTS(SELECT * FROM antes_variacoes EXCEPT SELECT * FROM produtos_proposta_variacao),'variacoes originais');
SELECT conferir((SELECT count(*)=2 FROM pedidos_produtos_avulsos_arquivo WHERE restaurado_em IS NOT NULL),'arquivo marcado restaurado');
UPDATE propostas SET is_avulso=false WHERE id_int=1;
SELECT conferir((SELECT count(*)=2 FROM produtos_proposta WHERE id_int=1),'repeticao nao duplica');

-- Um segundo ciclo deve arquivar as edicoes mais recentes, sem ressuscitar valor antigo.
UPDATE produtos_proposta SET qtd=55 WHERE id=11;
UPDATE propostas SET is_avulso=true WHERE id_int=1;
DELETE FROM produtos_proposta WHERE id_int=1;
UPDATE propostas SET is_avulso=false WHERE id_int=1;
SELECT conferir((SELECT qtd=55 AND peso_total=13.75 FROM produtos_proposta WHERE id=11),'segundo ciclo conserva dados recentes');
SELECT conferir((SELECT count(*)=2 FROM pedidos_modelos WHERE id_int=1),'segundo ciclo nao duplica modelos');

-- Exclusao normal nao vira arquivo avulso, mas nao apaga o trabalho da grafica.
DELETE FROM produtos_proposta WHERE id=22;
SELECT conferir((SELECT count(*)=0 FROM pedidos_produtos_avulsos_arquivo WHERE id_int=2),'nao arquiva exclusao de pedido comum');
SELECT conferir((SELECT count(*)=1 FROM pedidos_modelos WHERE id=202),'modelo sobrevive a exclusao comum');

-- ID ocupado: a transacao da desmarcacao falha inteira, sem sobrescrever dados.
UPDATE propostas SET is_avulso=true WHERE id_int=1;
DELETE FROM produtos_proposta WHERE id_int=1;
INSERT INTO produtos_proposta(id,id_int,nome_produto,qtd,valor_base,peso_base)
 VALUES (11,2,'Conflito sintetico',9,5,1);
DO $$ BEGIN
 BEGIN
  UPDATE propostas SET is_avulso=false WHERE id_int=1;
  RAISE EXCEPTION 'FALHOU: deveria recusar ID conflitante';
 EXCEPTION WHEN unique_violation THEN NULL;
 END;
END $$;
SELECT conferir((SELECT is_avulso FROM propostas WHERE id_int=1),'conflito mantem flag original');
SELECT conferir((SELECT id_int=2 AND qtd=9 FROM produtos_proposta WHERE id=11),'conflito nao sobrescreve outro pedido');
SELECT conferir((SELECT count(*)=2 FROM pedidos_produtos_avulsos_arquivo WHERE id_int=1 AND restaurado_em IS NULL),'conflito conserva arquivo pendente');
DELETE FROM produtos_proposta WHERE id=11;
UPDATE propostas SET is_avulso=false WHERE id_int=1;
SELECT conferir((SELECT qtd=55 FROM produtos_proposta WHERE id=11),'retentativa apos resolver conflito funciona');

-- Pedido avulso sem arquivo nao recebe itens inventados.
UPDATE propostas SET is_avulso=false WHERE id_int=3;
SELECT conferir((SELECT count(*)=0 FROM produtos_proposta WHERE id_int=3),'avulso novo sem itens continua vazio');
SELECT conferir(NOT has_table_privilege('anon','teste_pedido_avulso_20260909.pedidos_produtos_avulsos_arquivo','SELECT'),'anon sem acesso ao arquivo');
SELECT conferir(NOT has_table_privilege('authenticated','teste_pedido_avulso_20260909.pedidos_produtos_avulsos_arquivo','SELECT'),'authenticated sem acesso ao arquivo');
SELECT 'OK: regressao de pedidos avulsos' AS resultado;
ROLLBACK;
"""


def montar_sql():
    migracao = (RAIZ / "sql/preservar_pedido_avulso.sql").read_text(encoding="utf-8")
    # A migracao entra na transacao do teste, que termina sempre em ROLLBACK.
    migracao = re.sub(r"^(BEGIN|COMMIT);\s*$", "", migracao, flags=re.MULTILINE)
    migracao = migracao.replace("public.", SCHEMA + ".")
    migracao = migracao.replace("search_path = pg_catalog, public", "search_path = pg_catalog, " + SCHEMA)
    if "public." in migracao or re.search(r"^COMMIT;", migracao, re.MULTILINE):
        raise ValueError("O SQL de teste ainda referencia producao ou COMMIT")
    return FIXTURE + migracao + CENARIOS


if __name__ == "__main__":
    print(montar_sql())
