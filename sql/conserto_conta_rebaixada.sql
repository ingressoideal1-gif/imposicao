-- Devolve o `criada_aqui` das contas que a gráfica criou e que um segundo
-- "Liberar acesso" rebaixou.
--
-- ## O que aconteceu (04/09/2026)
--
-- `liberarAcesso` gravava sempre `criada_aqui: false` no ramo "este e-mail já
-- tem conta", com `merge-duplicates`. Tocar no botão uma segunda vez -- o que o
-- atendente faz quando não viu a senha da primeira -- reescrevia a ligação que
-- a própria gráfica tinha acabado de criar.
--
-- O estrago só aparecia depois: o botão "Nova senha provisória" some da tela
-- (ele só existe para `criada_aqui`), e o servidor passa a recusar com 403.
-- Resultado: conta criada por nós, senha que ninguém chegou a ver, e ninguém
-- mais capaz de redefini-la.
--
-- O código foi corrigido; este arquivo conserta as linhas que já estavam
-- rebaixadas.
--
-- ## Por que é seguro
--
-- Só toca em conta cujo `auth.users.raw_user_meta_data->>'origem'` é
-- `ideal-control` -- a marca que `criarUsuario` grava e que nenhuma conta do
-- Vibe tem. Conta do cliente que já existia antes (como a de 2025 do cliente
-- 8469) não é tocada: `criada_aqui = false` ali é a verdade, e trocar a senha
-- dela derrubaria o acesso da pessoa ao Vibe.
--
-- `senha_provisoria_em` NÃO é reposta: a senha antiga se perdeu de vez. Com
-- `criada_aqui` de volta, o atendente gera outra pela tela, e é a geração que
-- carimba a data.

update producao_acesso_contas c
   set criada_aqui = true
  from auth.users u
 where u.id = c.auth_user_id
   and c.criada_aqui = false
   and u.raw_user_meta_data->>'origem' = 'ideal-control';

select c.id_cliente, c.email, c.criada_aqui, c.senha_provisoria_em,
       u.raw_user_meta_data->>'origem' as origem
  from producao_acesso_contas c
  join auth.users u on u.id = c.auth_user_id
 order by c.criado_em desc;
