// Metadados sfnt (TTF/OTF). Nao executa nem instala a fonte no servidor.
export const LIMITE_FONTE = 10 * 1024 * 1024;
export function lerFonteDesktop(bytes: Uint8Array) {
  const fail = () => { throw Error("Fonte TTF/OTF invalida ou nao suportada."); };
  if (bytes.length < 12 || bytes.length > LIMITE_FONTE) return fail();
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const signature = v.getUint32(0);
  if (![0x00010000, 0x4f54544f].includes(signature)) return fail();
  const count = v.getUint16(4);
  if (!count || count > 256 || 12 + count * 16 > bytes.length) return fail();
  const tables = new Map<string, Uint8Array>();
  const ranges: number[][] = [];
  for (let i = 0; i < count; i++) {
    const p = 12 + i * 16;
    const tag = String.fromCharCode(...bytes.subarray(p, p + 4));
    const offset = v.getUint32(p + 8), length = v.getUint32(p + 12);
    if (tables.has(tag) || offset < 12 + count * 16 || offset + length > bytes.length ||
        ranges.some(([a,b]) => length && offset < b && offset + length > a)) return fail();
    tables.set(tag, bytes.subarray(offset, offset + length));
    if (length) ranges.push([offset, offset + length]);
  }
  if (!["head", "maxp", "cmap", "name", "hhea", "hmtx"].every(t => tables.has(t)) ||
      !(tables.has("glyf") && tables.has("loca") || tables.has("CFF ") || tables.has("CFF2"))) return fail();
  const names = tables.get("name")!;
  if (names.length < 6) return fail();
  const n = new DataView(names.buffer, names.byteOffset, names.byteLength);
  const total = n.getUint16(2), start = n.getUint16(4);
  if (n.getUint16(0) > 1 || total > 4096 || 6 + total * 12 > names.length || start < 6 + total * 12) return fail();
  const selected = new Map<number, { text: string; score: number }>();
  for (let i = 0; i < total; i++) {
    const p = 6 + i * 12, platform = n.getUint16(p), encoding = n.getUint16(p+2);
    const lang = n.getUint16(p+4), id = n.getUint16(p+6), length = n.getUint16(p+8), off = start + n.getUint16(p+10);
    if (off + length > names.length) return fail();
    if (![1,2,4,5,6,16,17].includes(id) || !length) continue;
    if (!(platform === 0 || platform === 3 && [0,1,10].includes(encoding))) continue;
    if (length % 2 || length > 2048) return fail();
    const text = new TextDecoder("utf-16be", {fatal:true}).decode(names.subarray(off,off+length)).replace(/[\x00-\x1f\x7f]/g, "").trim();
    const score = (platform === 3 ? 2 : 1) + (lang === 0x409 ? 4 : 0);
    if (text && score > (selected.get(id)?.score ?? -1)) selected.set(id,{text,score});
  }
  const get = (id:number) => selected.get(id)?.text || "";
  const familia = get(16) || get(1), estilo = get(17) || get(2), postscript = get(6);
  if (!familia || !estilo || !postscript) return fail();
  const os = tables.get("OS/2");
  const fs_type = os && os.length >= 10 ? new DataView(os.buffer,os.byteOffset,os.byteLength).getUint16(8) : null;
  return {familia, estilo, nome:get(4) || familia + " " + estilo, versao:get(5), postscript,
    fs_type, extensao:signature === 0x4f54544f ? "otf" : "ttf"};
}
