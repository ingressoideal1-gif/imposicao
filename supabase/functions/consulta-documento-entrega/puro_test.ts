import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { cnpjValido, consultarCnpj, consultarNomeCpf, cpfValido } from "./puro.ts";

Deno.test("valida CPF antes de consultar", () => {
  assertEquals(cpfValido("529.982.247-25"), true);
  assertEquals(cpfValido("111.111.111-11"), false);
});

Deno.test("valida e reduz o cadastro de CNPJ", async () => {
  assertEquals(cnpjValido("11.222.333/0001-81"), true);
  const buscar = (() => Promise.resolve(new Response(JSON.stringify({
    cnpj: "11222333000181", razao_social: "Empresa Teste", cep: "01001000",
    logradouro: "Rua A", numero: "10", complemento: "Sala", bairro: "Centro",
    municipio: "Sao Paulo", uf: "SP", campo_que_nao_deve_sair: "segredo",
  }), { status: 200 }))) as typeof fetch;
  assertEquals(await consultarCnpj("11222333000181", buscar), {
    cnpj: "11222333000181", nome: "Empresa Teste", cep: "01001000",
    endereco: "Rua A", numero: "10", complemento: "Sala", bairro: "Centro",
    cidade: "Sao Paulo", uf: "SP",
  });
});

Deno.test("devolve somente CPF e nome confirmado", async () => {
  const buscar = (() => Promise.resolve(new Response(JSON.stringify({
    success: true, data: { cpf: "52998224725", name: "Pessoa Teste", gender: "F", birthDate: "01/01/1990" },
  }), { status: 200 }))) as typeof fetch;
  assertEquals(await consultarNomeCpf("52998224725", "segredo", buscar), {
    cpf: "52998224725", nome: "Pessoa Teste",
  });
});

Deno.test("recusa CPF divergente e chave ausente", async () => {
  await assertRejects(() => consultarNomeCpf("52998224725", "", fetch), Error, "indisponivel");
  const buscar = (() => Promise.resolve(new Response(JSON.stringify({
    success: true, data: { cpf: "11144477735", name: "Outra Pessoa" },
  }), { status: 200 }))) as typeof fetch;
  await assertRejects(() => consultarNomeCpf("52998224725", "segredo", buscar), Error, "invalidos");
});
