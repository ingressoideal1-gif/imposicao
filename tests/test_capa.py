import os
import sys

# Simula uma requisição com capa ligada
from engine import ImpositionEngine, ImpositionConfig

cfg = ImpositionConfig()
cfg.layout_schema = "cut_stack"
cfg.cut_stack_mode = "independent"
cfg.cut_stack_sheets = 5
cfg.has_cover = True

try:
    engine = ImpositionEngine()
    engine.process(cfg)
    print("Sucesso!")
except Exception as e:
    import traceback
    traceback.print_exc()
