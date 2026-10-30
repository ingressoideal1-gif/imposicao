import { operarGabaritos } from "./gabaritos.ts";
const who = {
  id: "11111111-1111-4111-8111-111111111111",
  permissoes: { role: "designer", perm_lista_arte_view: true },
};
const assert = (value: unknown) => {
  if (!value) throw Error("assertion failed");
};
async function pdf(count = 1) {
  const p = await (globalThis as any).PDFLib.PDFDocument.create();
  for (let i = 0; i < count; i++) p.addPage([100, 50]);
  return btoa(String.fromCharCode(...await p.save()));
}
async function rejects(work: () => Promise<unknown>) {
  let failed = false;
  try {
    await work();
  } catch {
    failed = true;
  }
  assert(failed);
}
Deno.test("gabaritos: acesso somente equipe interna antes de consultar banco", async () => {
  let readsDenied = 0;
  for (const role of ["cliente", "impressor", ""]) {
    await rejects(() =>
      operarGabaritos(
        "listar",
        {},
        { ...who, permissoes: { role } },
        async () => {
          readsDenied++;
          return [];
        },
      )
    );
  }
  assert(readsDenied === 0);
  for (const role of ["designer", "atendimento", "admin"]) {
    let reads = 0;
    await operarGabaritos(
      "listar",
      {},
      { ...who, permissoes: { role } },
      async () => {
        reads++;
        return [];
      },
    );
    assert(reads === 2);
  }
});
Deno.test("gabaritos: rejeita PDF de tres paginas e arquivo invalido sem upload", async () => {
  let uploads = 0;
  const store = async () => {
    uploads++;
  };
  const db = async () => [];
  await rejects(() =>
    operarGabaritos("salvar", { produto: 1, pdf: "!" }, who, db, store)
  );
  for (const content of [await pdf(3), btoa("%PDF-invalido")]) {
    await rejects(() =>
      operarGabaritos("salvar", { produto: 1, pdf: content }, who, db, store)
    );
  }
  assert(uploads === 0);
});
Deno.test("gabaritos: publica uma revisao e exige exatamente a linha persistida", async () => {
  let uploaded = 0;
  let confirm = true;
  const db = async (_m: string, path: string, body?: any) => {
    if (path.startsWith("imposition_gabaritos?")) return [];
    if (path.startsWith("produtos?")) return [{ id_produto: 1 }];
    assert(path === "rpc/imposition_publicar_gabarito");
    return confirm
      ? [{ id: "revision", produto: 1, sha256: body.p_sha256 }]
      : [];
  };
  const input = { produto: 1, nome: "base.pdf", pdf: await pdf(2) };
  const r = await operarGabaritos("salvar", input, who, db, async () => {
    uploaded++;
  });
  assert(r.revisao === "revision" && uploaded === 1);
  confirm = false;
  await rejects(() =>
    operarGabaritos("salvar", input, who, db, async () => {})
  );
});
Deno.test("gabaritos: substituicao exige revisao atual e download nao concede escrita", async () => {
  let uploads = 0;
  const db = async (_m: string, path: string) =>
    path.startsWith("imposition_gabaritos?") ? [{ revisao: "r1" }] : [{
      id: "r1",
      produto: 1,
      arquivo: "1/a.pdf",
      sha256: "a",
      tamanho: 20,
      nome: "a.pdf",
    }];
  await rejects(() =>
    operarGabaritos(
      "salvar",
      { produto: 1, anterior: "velha" },
      who,
      db,
      async () => {
        uploads++;
      },
    )
  );
  assert(!uploads);
  await rejects(() =>
    operarGabaritos(
      "baixar",
      { produto: 1 },
      who,
      db,
      async () => ({ signedURL: "https://outro.site/" }),
    )
  );
});
