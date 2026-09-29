import { atenderLinkPagamento } from "./handler.ts";

Deno.serve(req => atenderLinkPagamento(req));
