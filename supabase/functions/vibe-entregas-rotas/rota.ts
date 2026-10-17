export const GRAFICA = 'Rua Felizardo de Farias, 81, Medianeira, Porto Alegre, RS, 90660-130, Brasil';
export type Parada = { chave: string; pedido: number; endereco: string };
export function preparar(entrada: any, paradas: Parada[]) {
  if (!entrada || !Array.isArray(entrada.pedidos) || entrada.pedidos.length < 1 || entrada.pedidos.length > 20 || new Set(entrada.pedidos).size !== entrada.pedidos.length || paradas.length !== entrada.pedidos.length) throw new Error('Selecione de 1 a 20 pedidos.');
  if (!['grafica','atual'].includes(entrada.origem) || typeof entrada.retorno !== 'boolean' || !['DRIVE','TWO_WHEELER'].includes(entrada.modo)) throw new Error('Opções de rota inválidas.');
  let origin: any = { address: GRAFICA };
  if (entrada.origem === 'atual') {
    const { latitude, longitude } = entrada.localizacao || {};
    if (typeof latitude !== 'number' || typeof longitude !== 'number' || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude)>90 || Math.abs(longitude)>180) throw new Error('Localização inválida.');
    origin = { location: { latLng: { latitude, longitude } } };
  }
  const ultima = entrada.retorno ? null : paradas.find(p=>p.chave===entrada.ultima);
  if (!entrada.retorno && !ultima) throw new Error('Escolha a última entrega.');
  const intermediarias = paradas.filter(p=>p!==ultima);
  return { intermediarias, ultima, corpo: { origin, destination: { address: ultima?.endereco || GRAFICA }, intermediates: intermediarias.map(p=>({address:p.endereco})), travelMode: entrada.modo, routingPreference:'TRAFFIC_AWARE', optimizeWaypointOrder:intermediarias.length>1, languageCode:'pt-BR', regionCode:'BR', units:'METRIC' } };
}
export function interpretar(resposta: any, plano: ReturnType<typeof preparar>) {
  const rota=resposta?.routes?.[0]; if(!rota) throw new Error('Não foi encontrada uma rota.');
  const n=plano.intermediarias.length;
  const indices=n>1?rota.optimizedIntermediateWaypointIndex:Array.from({length:n},(_,i)=>i);
  if(!Array.isArray(indices)||indices.length!==n||new Set(indices).size!==n||indices.some(i=>!Number.isInteger(i)||i<0||i>=n)) throw new Error('Sequência de rota inválida.');
  const metros=rota.distanceMeters,segundos=Number(String(rota.duration).replace(/s$/,''));
  if(!Number.isFinite(metros)||metros<0||!Number.isFinite(segundos)||segundos<0)throw new Error('Estimativas indisponíveis.');
  return { paradas:[...indices.map(i=>plano.intermediarias[i]),...(plano.ultima?[plano.ultima]:[])],metros,segundos,avisos:Array.isArray(rota.warnings)?rota.warnings.filter((x:unknown)=>typeof x==='string'):[] };
}
