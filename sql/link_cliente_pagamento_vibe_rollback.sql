-- Recuperação não destrutiva, somente se a implantação precisar ser desativada.
-- Publicar primeiro as versões anteriores do frontend e de painel; desativar
-- a Edge Function link-pagamento. Preserva os links já obtidos no cache.
BEGIN;
REVOKE EXECUTE ON FUNCTION public.reservar_link_pagamento_vibe(text,text) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.concluir_link_pagamento_vibe(text,uuid,text,text) FROM service_role;
REVOKE SELECT ON public.pedidos_links_pagamento_vibe FROM service_role;
COMMIT;
