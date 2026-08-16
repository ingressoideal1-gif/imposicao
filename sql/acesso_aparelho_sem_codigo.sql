-- ═════════════════════════════════════════════════════════════════════════════
-- O aparelho da portaria pode nascer SEM código
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Cole este arquivo INTEIRO no editor SQL do Supabase e execute. Roda em
-- segundos, é repetível, e não apaga nada.
--
--
-- ── Por que isto existe ──────────────────────────────────────────────────────
--
-- Até aqui, pôr um portão no ar era assim: o dono criava o aparelho na tela
-- dele, o servidor sorteava um código de seis caracteres, e alguém digitava
-- esse código no celular do portão.
--
-- O código não existia por comodidade. Ele existia para que a SENHA do dono
-- nunca chegasse ao celular que fica com o porteiro.
--
-- A partir de agora o dono configura o aparelho NO PRÓPRIO APARELHO: chega no
-- portão com o celular na mão, digita a senha uma vez, dá um nome ao portão,
-- toca nos setores que ele valida, e salva. O servidor cunha o token direto, e
-- a sessão da conta é encerrada ali mesmo — o celular fica só com o token, que
-- só serve para ler ingresso daquele evento, naqueles setores.
--
-- Nesse caminho não há código nenhum, e não DEVE haver: um código guardado no
-- banco é um código que alguém pode usar para parear um SEGUNDO celular naquele
-- portão. Daí o `DROP NOT NULL` abaixo — a coluna passa a poder ser nula, que é
-- o jeito de dizer "este aparelho nunca teve código".
--
--
-- ── O que isto NÃO faz ───────────────────────────────────────────────────────
--
-- Não apaga aparelho nenhum, não mexe em código nenhum já sorteado, e não
-- desliga o caminho antigo. Os aparelhos que já existem continuam com o código
-- deles, e a tela do dono continua podendo criar aparelho com código enquanto o
-- caminho novo não tiver rodado num evento de verdade.
--
-- Esta migração permite a ausência do código. Ela não a impõe.

ALTER TABLE producao_acesso_dispositivos
    ALTER COLUMN codigo_hash DROP NOT NULL;

COMMENT ON COLUMN producao_acesso_dispositivos.codigo_hash IS
    'Hash do codigo de seis caracteres que o porteiro digita. NULO no aparelho '
    'configurado no proprio aparelho, que nunca teve codigo -- e e assim de '
    'proposito: codigo guardado no banco e codigo que pearia um SEGUNDO celular '
    'naquele portao.';


-- ── Conferência ──────────────────────────────────────────────────────────────
--
-- Fica DESCOMENTADA de propósito, e é a última coisa do arquivo: sem ela o
-- editor termina com "Success. No rows returned" e não há como saber se a
-- alteração pegou. Já aconteceu neste projeto.
--
-- O que tem de aparecer:
--
--     codigo_hash   YES
--     token_hash    YES
--
-- `token_hash` entra na consulta como testemunha: ele já era nulo antes desta
-- migração, então ver os dois com YES mostra que a coluna certa mudou e que a
-- leitura está sendo feita da tabela certa.

SELECT column_name, is_nullable, data_type
  FROM information_schema.columns
 WHERE table_name = 'producao_acesso_dispositivos'
   AND column_name IN ('codigo_hash', 'token_hash')
 ORDER BY column_name;
