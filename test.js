const localStorageMock = {
    vibe_mapas_teatro: JSON.stringify([{ id: 'uuid-123', name: 'Map1' }]),
    getItem: function(k) { return this[k]; },
    setItem: function(k, v) { this[k] = v; }
};

let success = true;
window = { state: { mapas: [] } }; // API returned []
const localData = JSON.parse(localStorageMock.getItem('vibe_mapas_teatro') || '[]');

if (success) {
    const merged = [...window.state.mapas];
    localData.forEach(localMap => {
        if (!merged.find(x => x.id === localMap.id)) {
            merged.push(localMap);
        }
    });
    window.state.mapas = merged;
    localStorageMock.setItem('vibe_mapas_teatro', JSON.stringify(window.state.mapas));
}

console.log(window.state.mapas);
