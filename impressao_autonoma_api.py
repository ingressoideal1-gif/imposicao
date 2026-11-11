"""Rotas protegidas pelas mesmas permissoes de impressao da API local."""
from fastapi import APIRouter, HTTPException
from impressao_autonoma import trabalhos

router = APIRouter(prefix='/api/print/trabalhos')


@router.get('')
def listar():
    return {'trabalhos': trabalhos().listar()}


@router.get('/{ident}')
def obter(ident: str):
    dado = trabalhos().obter(ident)
    if dado is None:
        raise HTTPException(404, 'Trabalho nao encontrado.')
    return dado


@router.post('/{ident}/cancelar')
def cancelar(ident: str):
    try:
        return trabalhos().cancelar(ident)
    except ValueError as erro:
        raise HTTPException(409, str(erro)) from erro


@router.post('/{ident}/conferir')
def conferir(ident: str, payload: dict):
    if payload.get('conferido') is not True:
        raise HTTPException(422, 'Confirme a conferencia da fila e das folhas.')
    try:
        return trabalhos().conferir(ident)
    except ValueError as erro:
        raise HTTPException(409, str(erro)) from erro
