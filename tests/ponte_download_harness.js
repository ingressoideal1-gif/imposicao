const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
async function scenario(release,ok=true) {
  let refresh,fetches=0;
  class Element {
    constructor(){this.children=[];this.dataset={};this.style={};}
    append(...nodes){this.children.push(...nodes);}
    insertBefore(node){this.children.unshift(node);}
    querySelector(){return this.children.find(n=>n.dataset.ponteDownload);}
    setAttribute(){}
  }
  const container=new Element();
  vm.runInNewContext(fs.readFileSync('frontend/ponte-download.js','utf8'),{
    window:{_currentPerms:{perm_lista_arte_edit:true}},
    MutationObserver:class {constructor(fn){refresh=fn;}observe(){}},
    document:{body:{},getElementById:()=>container,createElement:()=>new Element()},
    fetch:async(url,options)=>{
      assert.equal(url,'ponte-download.json');assert.equal(options.cache,'no-store');
      assert.equal(options.credentials,'omit');fetches++;return {ok,json:async()=>release};
    }
  });
  container.children.push(new Element());refresh();refresh();
  await new Promise(r=>setImmediate(r));
  assert.equal(fetches,1);assert.equal(container.children.length,2);
  return container.children[0].children;
}
(async()=>{
  const [link,status]=await scenario({version:'1.6.0',file_id:'safeFileId1234',sha256:'a'.repeat(64)});
  assert.equal(link.href,'https://drive.google.com/file/d/safeFileId1234/view');
  assert.equal(link.rel,'noopener noreferrer');assert.match(status.textContent,/1.6.0/);
  for(const release of [null,{}, {version:'1.6.0',file_id:'https://evil.test',sha256:'a'.repeat(64)}]) {
    const [link,status]=await scenario(release);assert.equal(link.hidden,true);assert.equal(link.href,undefined);
    assert.match(status.textContent,/indisponível/);
  }
  const [failed]=await scenario({},false);assert.equal(failed.hidden,true);
  console.log('Download: link Google validado, sem duplicacao/credenciais, falha segura OK');
})().catch(e=>{console.error(e);process.exitCode=1;});
