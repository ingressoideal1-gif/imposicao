-- Nova entrega. Aplicar somente após a prévia e revisão do ambiente.
-- Projeto esperado: vwbtitjlpelrcnsytzqw. Não altera mapas/modelos existentes.
-- Efeitos: uma tabela nova, um bucket privado, um RPC e políticas dedicadas.
-- Zero registros de mapas alterados; zero PDFs importados automaticamente.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$
BEGIN
  IF to_regclass('public.producao_mapas_teatro_pdf_exportacoes') IS NOT NULL
     OR EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'mapas-teatro-pdfs')
     OR to_regprocedure('public.mapas_teatro_publicar_pdf_exportacao(text,text,text,jsonb,jsonb,uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'Objetos da entrega já existem: conferir a implantação, não sobrescrever.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
      AND table_name='producao_mapas_teatro' AND column_name='id' AND data_type='uuid') THEN
    RAISE EXCEPTION 'Conferir o tipo real de producao_mapas_teatro.id antes desta migração.';
  END IF;
END $$;

CREATE TABLE public.producao_mapas_teatro_pdf_exportacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mapa_id uuid NOT NULL REFERENCES public.producao_mapas_teatro(id) ON DELETE RESTRICT,
  revisao_exportacao text NOT NULL CHECK (revisao_exportacao ~ '^[a-f0-9]{64}$'),
  gerador_versao text NOT NULL CHECK (gerador_versao = 'a3-v1-20261003'),
  nome_mapa text NOT NULL,
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  arquivos jsonb NOT NULL CHECK (jsonb_typeof(arquivos) = 'array' AND jsonb_array_length(arquivos) BETWEEN 1 AND 100),
  criado_em timestamptz NOT NULL DEFAULT now(),
  criado_por uuid NOT NULL,
  UNIQUE (mapa_id, revisao_exportacao, gerador_versao)
);
ALTER TABLE public.producao_mapas_teatro_pdf_exportacoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.producao_mapas_teatro_pdf_exportacoes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.producao_mapas_teatro_pdf_exportacoes TO authenticated;
GRANT SELECT, INSERT ON public.producao_mapas_teatro_pdf_exportacoes TO service_role;
CREATE POLICY mapas_pdf_leitura ON public.producao_mapas_teatro_pdf_exportacoes
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.producao_mapas_teatro m WHERE m.id = mapa_id
  ));

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('mapas-teatro-pdfs', 'mapas-teatro-pdfs', false, 10485760, ARRAY['application/pdf']);
-- Trava dedicada sobre políticas permissivas preexistentes. Service role bypassa RLS.
CREATE POLICY mapas_pdf_apenas_backend ON storage.objects AS RESTRICTIVE
  FOR ALL TO PUBLIC USING (bucket_id <> 'mapas-teatro-pdfs')
  WITH CHECK (bucket_id <> 'mapas-teatro-pdfs');

CREATE FUNCTION public.mapas_teatro_publicar_pdf_exportacao(
  p_mapa_id text, p_revisao text, p_gerador text, p_snapshot jsonb, p_arquivos jsonb, p_autor uuid
) RETURNS public.producao_mapas_teatro_pdf_exportacoes
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public
AS $$
DECLARE
  mapa public.producao_mapas_teatro%ROWTYPE;
  resultado public.producao_mapas_teatro_pdf_exportacoes%ROWTYPE;
  esperado jsonb;
  a jsonb;
  s jsonb;
  qtd bigint;
  total bigint := 0;
  numero integer := 0;
  prefixo text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'A publicação exige o backend autorizado.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.imposition_user_permissions
      WHERE user_id = p_autor AND lower(btrim(role)) IN ('admin','atendimento')) THEN
    RAISE EXCEPTION 'Autor sem permissão para publicar.';
  END IF;
  SELECT * INTO mapa FROM public.producao_mapas_teatro WHERE id = p_mapa_id::uuid FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Mapa não encontrado.'; END IF;
  esperado := jsonb_build_object('id', mapa.id, 'name', mapa.name, 'config', mapa.config);
  IF p_snapshot IS DISTINCT FROM esperado THEN RAISE EXCEPTION 'O mapa mudou durante o envio. Gere novamente os PDFs.'; END IF;
  IF p_revisao IS NULL OR p_revisao !~ '^[a-f0-9]{64}$' OR p_gerador IS DISTINCT FROM 'a3-v1-20261003'
     OR jsonb_typeof(p_arquivos) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Exportação inválida.'; END IF;
  IF jsonb_typeof(mapa.config->'setores') IS DISTINCT FROM 'array'
     OR jsonb_array_length(mapa.config->'setores') > 99
     OR (coalesce(mapa.config->'cadeiras', '{}'::jsonb) <> '{}'::jsonb) THEN RAISE EXCEPTION 'Cadastro de setores inválido.'; END IF;
  IF jsonb_array_length(p_arquivos) <> jsonb_array_length(mapa.config->'setores') + 1 THEN RAISE EXCEPTION 'Exportação incompleta.'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(mapa.config->'setores') t(s)
     GROUP BY s->>'id' HAVING nullif(btrim(s->>'id'), '') IS NULL OR count(*) > 1) THEN RAISE EXCEPTION 'IDs de setores inválidos.'; END IF;
  prefixo := encode(convert_to(p_mapa_id, 'UTF8'), 'hex') || '/' || p_revisao || '/' || p_gerador || '/';
  FOR a IN SELECT value FROM jsonb_array_elements(p_arquivos) LOOP
    IF jsonb_typeof(a) IS DISTINCT FROM 'object'
       OR a->>'sha256_arquivo' IS NULL OR a->>'sha256_arquivo' !~ '^[a-f0-9]{64}$'
       OR NOT coalesce((a->>'tamanho_bytes')::bigint BETWEEN 1 AND 10485760, false)
       OR NOT coalesce((a->>'paginas')::integer BETWEEN 1 AND 1000, false)
       OR a->>'storage_path' IS NULL THEN RAISE EXCEPTION 'Arquivo inválido.'; END IF;
    IF numero = 0 THEN
      IF a->>'tipo' IS DISTINCT FROM 'mapa' OR a->>'setor_id' IS NOT NULL
        OR a->>'storage_path' IS DISTINCT FROM prefixo || 'mapa/' || (a->>'sha256_arquivo') || '.pdf' THEN RAISE EXCEPTION 'PDF do mapa inválido.'; END IF;
    ELSE
      s := mapa.config->'setores'->(numero - 1);
      IF jsonb_typeof(s->'cadeiras') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Assentos inválidos.'; END IF;
      SELECT count(*) INTO qtd FROM jsonb_each(s->'cadeiras') c(pos, assento)
      WHERE jsonb_typeof(assento) = 'object' AND coalesce(assento->>'tipo','') <> 'Apagado'
        AND coalesce(assento->>'isErased','false') <> 'true';
      total := total + qtd;
      IF a->>'tipo' IS DISTINCT FROM 'setor' OR a->>'setor_id' IS DISTINCT FROM s->>'id'
        OR (a->>'quantidade_assentos')::bigint IS DISTINCT FROM qtd
        OR a->>'storage_path' IS DISTINCT FROM prefixo || 'setores/' || encode(convert_to(s->>'id', 'UTF8'),'hex') || '/' || (a->>'sha256_arquivo') || '.pdf'
        THEN RAISE EXCEPTION 'PDF de setor inválido.'; END IF;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'mapas-teatro-pdfs'
        AND o.name = a->>'storage_path' AND (o.metadata->>'size')::bigint = (a->>'tamanho_bytes')::bigint) THEN RAISE EXCEPTION 'Upload não confirmado.'; END IF;
    numero := numero + 1;
  END LOOP;
  IF (p_arquivos->0->>'quantidade_assentos')::bigint IS DISTINCT FROM total THEN RAISE EXCEPTION 'Total do mapa divergente.'; END IF;
  INSERT INTO public.producao_mapas_teatro_pdf_exportacoes(mapa_id,revisao_exportacao,gerador_versao,nome_mapa,snapshot,arquivos,criado_por)
  VALUES(p_mapa_id::uuid,p_revisao,p_gerador,mapa.name,p_snapshot,p_arquivos,p_autor)
  ON CONFLICT (mapa_id,revisao_exportacao,gerador_versao) DO NOTHING;
  SELECT * INTO resultado FROM public.producao_mapas_teatro_pdf_exportacoes
  WHERE mapa_id=p_mapa_id::uuid AND revisao_exportacao=p_revisao AND gerador_versao=p_gerador;
  RETURN resultado;
END $$;
REVOKE ALL ON FUNCTION public.mapas_teatro_publicar_pdf_exportacao(text,text,text,jsonb,jsonb,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mapas_teatro_publicar_pdf_exportacao(text,text,text,jsonb,jsonb,uuid) TO service_role;
COMMIT;
