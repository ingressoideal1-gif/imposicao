-- ══════════════════════════════════════════════════════════════════
-- POLÍTICAS DE STORAGE: bucket previews-numeracoes
-- Execute no SQL Editor do Supabase (vwbtitjlpelrcnsytzqw)
--
-- O bucket é público, o que já libera a leitura por URL direta. Estas
-- políticas liberam a ESCRITA com a chave anônima, que é como o navegador
-- sobe o preview em saveNumeracao. O upsert exige insert E update.
-- ══════════════════════════════════════════════════════════════════

drop policy if exists "previews_numeracoes_insert" on storage.objects;
drop policy if exists "previews_numeracoes_update" on storage.objects;

create policy "previews_numeracoes_insert"
    on storage.objects for insert
    with check (bucket_id = 'previews-numeracoes');

create policy "previews_numeracoes_update"
    on storage.objects for update
    using (bucket_id = 'previews-numeracoes')
    with check (bucket_id = 'previews-numeracoes');
