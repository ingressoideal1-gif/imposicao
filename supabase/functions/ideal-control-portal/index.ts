import { atender } from "./handler.ts";
Deno.serve(req => atender(req));
