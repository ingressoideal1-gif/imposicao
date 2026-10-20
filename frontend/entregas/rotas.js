/* A sequência e a liberação são administradas pelo Imposition. */
window.RotasEntregas = (() => {
  let fonte, ativa=null, geracao=0;
  function atualizar(){
    const paradas=ativa?.paradas || [];
    document.getElementById('rota-progresso').textContent=ativa
      ? `${ativa.iniciada_em ? 'Em deslocamento' : 'Rota pronta para iniciar'} · ${paradas.filter(p=>p.entregue).length} de ${paradas.length} entregas concluídas`
      : 'Nenhuma rota atribuída. Aguarde a expedição.';
    if(ativa?.previsao_pendente) document.getElementById('rota-progresso').textContent+=' · Previsões aguardando atualização';
    const iniciar=document.getElementById('iniciar-rota');if(iniciar)iniciar.hidden=!ativa || !!ativa.iniciada_em || !paradas.some(p=>!p.entregue);
    fonte?.identidade(paradas.find(p=>p.entregador)?.entregador);
  }
  async function carregar(){const turno=++geracao;const rows=await VibeEntregas.rotasAtivas();if(turno!==geracao)return;ativa=rows.find(r=>r.minha)||null;atualizar();}
  return {iniciar:opcoes=>{fonte=opcoes;},carregar,atualizar,atual:()=>ativa,limpar:()=>{geracao++;ativa=null;atualizar();}};
})();
