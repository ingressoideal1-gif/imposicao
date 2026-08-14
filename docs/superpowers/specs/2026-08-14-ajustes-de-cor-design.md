# Ajustes de Cor por impressora — Design

Data: 2026-08-14
Status: aprovado pelo usuário ("Aprovado")
Complementa: `2026-08-14-gerenciamento-de-cores-icm-design.md`

## O que é

Ajustes de cor por impressora — saturação, brilho, contraste e curvas — na box
"Gerenciamento de Cores" da janela de impressão. Não é edição do perfil ICC em
si (isso é software de calibração): é o ajuste que RIPs oferecem por cima do
perfil, aplicado no momento da impressão.

## Modelo de dados

A entrada da impressora no `printer_icc_map.json` ganha a chave `ajustes`:

```json
{
  "perfil": "x.icm", "intento": "relativo", "ativo": true,
  "ajustes": {
    "saturacao": 100,
    "brilho": 0,
    "contraste": 0,
    "curvas": {
      "master": [[0,0],[255,255]],
      "r": [[0,0],[255,255]],
      "g": [[0,0],[255,255]],
      "b": [[0,0],[255,255]]
    }
  }
}
```

Neutros: saturação 100, brilho 0, contraste 0, curvas lineares. Ajustes neutros
custam zero e não mudam um byte da impressão.

## A matemática (idêntica no Python e no JS da prévia)

Ordem fixa: **saturação → brilho → contraste → curvas (master, depois canal)**.
Tudo em sRGB, ANTES da conversão pelo perfil .icm.

- Saturação (0–200, 100 neutro): mistura com o cinza de luminância Rec.601
  (`luma = 0.299R + 0.587G + 0.114B`); `novo = luma + (v - luma) * s/100`.
  Acima de 100 extrapola (satura mais).
- Brilho (−100..+100, 0 neutro): deslocamento `v + brilho * 1.28` (±128 níveis).
- Contraste (−100..+100, 0 neutro): inclinação em torno de 128:
  `(v - 128) * (contraste + 100)/100 + 128`.
- Curvas: pontos de controle `[x, y]` em 0..255, interpolação LINEAR por
  segmentos (não spline — linear é previsível e as duas implementações ficam
  idênticas). O LUT final por canal é `curva_canal(curva_master(v))`.
- Brilho, contraste e curvas compõem um único LUT de 256 entradas por canal,
  aplicado com `Image.point`; a saturação usa `Image.blend` com o cinza.

## Onde aplica

- **GDI (padrão da gráfica):** `aplicar_ajustes(img)` no raster sRGB, antes da
  transformação LittleCMS do perfil. É o único modo raster — os ajustes valem
  aqui.
- **Ghostscript / PDF RAW:** conversão vetorial, sem raster — ajustes não se
  aplicam; a box avisa isso em texto.
- **Ajustes funcionam sem perfil .icm**: quem ainda não tem o perfil já pode
  corrigir uma impressora que satura demais. `resolver_config` passa a devolver
  config com `path=None` quando há só ajustes; perfil sumido gera aviso mas os
  ajustes continuam valendo.

## Interface

Dentro da box "Gerenciamento de Cores", seção "Ajustes de cor":

- Sliders de Saturação / Brilho / Contraste com valor numérico e botão
  "Voltar ao neutro".
- Editor de curvas em canvas compacto: canais Master/R/G/B em abas, pontos
  arrastáveis, clique adiciona, duplo clique remove (extremos não se removem).
- **Prévia ao vivo**: faixa de teste (gradiente de cinza, cores saturadas, tons
  de pele) desenhada em canvas com a MESMA matemática do Python — antes e
  depois lado a lado. O que a faixa mostra é o que a impressão recebe.
- Salvamento automático no mapa (com debounce), como o resto da box.

## Testes

- Neutros → imagem byte a byte idêntica.
- Saturação 0 → R=G=B (cinza); brilho +100 → mais claro; contraste −100 → tudo
  vira 128.
- Curva master invertida `[[0,255],[255,0]]` → inverte; curva de canal zera só
  aquele canal.
- `resolver_config`: só ajustes (sem perfil) + ativo → config com ajustes;
  perfil sumido + ajustes → aviso E ajustes preservados.
- Modos GS/RAW com config só de ajustes → não tentam usar perfil inexistente.

## Publicação

print_service, color_profiles e frontend são embutidos no executável: site e
agente publicam juntos, com versão nova do agente.
