"""Inventario Git em metadados; nao le arquivos, diffs ou credenciais."""
import argparse
import json
from pathlib import Path
import subprocess


def consultar(raiz, *args, aceitar=(0,)):
    r = subprocess.run(['git', '-C', str(raiz), *args], capture_output=True)
    if r.returncode not in aceitar:
        raise RuntimeError('Falha ao inventariar Git')
    return r


def inventariar(raiz):
    worktrees=[]
    blocks=consultar(raiz,'worktree','list','--porcelain').stdout.decode('utf-8').strip().split('\n\n')
    for block in blocks:
        fields=dict(line.split(' ',1) for line in block.splitlines() if ' ' in line)
        caminho=Path(fields['worktree']).resolve()
        dirty=bool(consultar(caminho,'diff','--name-only').stdout or consultar(caminho,'diff','--cached','--name-only').stdout)
        untracked=len([x for x in consultar(caminho,'ls-files','--others','--exclude-standard','-z').stdout.split(b'\0') if x])
        merged=consultar(raiz,'merge-base','--is-ancestor',fields['HEAD'],'origin/main',aceitar=(0,1)).returncode==0
        worktrees.append({'path':str(caminho),'branch':fields.get('branch','detached'),'head':fields['HEAD'],
            'tracked_dirty':dirty,'untracked':untracked,'ancestor_of_origin_main':merged,
            'classification':'preservar-trabalho' if dirty or untracked else 'revisar-apos-backup' if merged else 'investigar-nao-integrado'})
    return {'origin_main':consultar(raiz,'rev-parse','origin/main').stdout.decode().strip(),
            'worktrees':worktrees,'summary':{categoria:sum(x['classification']==categoria for x in worktrees) for categoria in ['preservar-trabalho','revisar-apos-backup','investigar-nao-integrado']}}


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--raiz',required=True);p.add_argument('--saida',required=True);a=p.parse_args()
    dados=inventariar(Path(a.raiz).resolve())
    with Path(a.saida).open('x',encoding='utf-8') as f:json.dump(dados,f,indent=2,ensure_ascii=False)
    print(json.dumps({'worktrees':len(dados['worktrees']),'summary':dados['summary']}))
