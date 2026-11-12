import { atenderNotaFiscal } from "./handler.ts";

Deno.serve(req => atenderNotaFiscal(req));
