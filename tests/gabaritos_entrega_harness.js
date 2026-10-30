const {execFileSync}=require('node:child_process');
const {join}=require('node:path');
for(const file of ['tracedraw_integracao_harness.cjs','tracedraw_documento_harness.cjs','tracedraw_runtime_session_harness.cjs','gabaritos_biblioteca_harness.cjs']) {
  execFileSync(process.execPath,[join(__dirname,file)],{stdio:'inherit',env:process.env});
}
