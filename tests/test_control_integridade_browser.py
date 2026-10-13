"""Regressões no Chrome com os harnesses existentes; nenhuma rede real."""
import hashlib
import json
from pathlib import Path
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]
SALT = "aa" * 32


def carga():
    return dict(evento=dict(id="e1", nome="Sintético", sal=SALT),
                aparelho=dict(id="a1", nome="Sintético", setores=["s1"]), sais={},
                setores=[dict(id="s1", nome="Setor", quantidade=10, tipo_uso="unico")], bloqueios=[],
                credenciais=[dict(id="c1", s="s1", n=1, h=hashlib.pbkdf2_hmac(
                    "sha256", b"000001", bytes.fromhex(SALT), 10000).hex())])


class IntegridadeBrowser(unittest.TestCase):
    def call(self, case, harness="portaria_tela_harness.js"):
        p = subprocess.run(["node", str(ROOT / "tests" / harness)], cwd=ROOT,
                           input=json.dumps(case), encoding="utf-8", capture_output=True, timeout=40)
        self.assertEqual(p.returncode, 0, p.stderr)
        return json.loads(p.stdout)

    def test_setor_ausente_recusa_e_registra_sem_verde(self):
        c = carga(); c["setores"] = []
        r = self.call(dict(carga=c, texto="000001"))
        self.assertEqual(r["filaResultados"], ["negado"])
        self.assertTrue(r["faixaVazia"])
        self.assertTrue(r["telaResposta"])

    def test_recusa_do_servidor_prevalece(self):
        r = self.call(dict(carga=carga(), texto="000001", online=True,
                           mock=dict(pathname="/functions/v1/portaria/entrada", method="POST", status=200,
                                     body=dict(primeira=False, resultado="negado", motivo="setor_bloqueado"))))
        self.assertEqual(r["filaResultados"], ["negado"])
        self.assertEqual(r["titulo"], "SETOR BLOQUEADO")

    def test_recusa_http_nao_vira_permissao_offline(self):
        r = self.call(dict(carga=carga(), texto="000001", online=True,
                           mock=dict(pathname="/functions/v1/portaria/entrada", method="POST", status=403)))
        self.assertEqual(r["filaResultados"], ["negado"])
        self.assertTrue(r["faixaVazia"])

    def test_perda_de_rede_preserva_politica_offline(self):
        r = self.call(dict(carga=carga(), texto="000001", online=True,
                           mock=dict(pathname="/functions/v1/portaria/entrada", method="POST", abort=True)))
        self.assertEqual(r["filaResultados"], ["permitido"])
        self.assertFalse(r["faixaVazia"])

    def test_fila_so_sai_apos_confirmacao_completa(self):
        for ack, expected in [({}, 2), ({"confirmadas": ["leitura-de-teste"]}, 2),
                              ({"confirmadas": ["leitura-de-teste", "entrada-de-teste"]}, 0)]:
            with self.subTest(ack=ack):
                r = self.call(dict(modo="sincronizar", carga=carga(),
                                   mock=dict(pathname="/functions/v1/portaria/leituras", method="POST", status=200, body=ack)))
                self.assertEqual(r["filaDepois"], expected)
                self.assertEqual(r["entradasAntes"], r["entradasDepois"])

    def test_cursor_reinicia_apos_concluir_e_nao_avanca_se_gravacao_falha(self):
        r = self.call(dict(relogio=dict(tiques=3, respostas=[dict(novidade=dict(momento="id:cursor")),
                         dict(novidade=dict(momento=None)), dict(novidade={})])), "sincronismo_harness.js")
        self.assertEqual(r["pedidos"], [None, "id:cursor", None])
        r = self.call(dict(relogio=dict(tiques=2, aplicarLanca=True,
                         respostas=[dict(novidade=dict(momento="id:cursor"))])), "sincronismo_harness.js")
        self.assertEqual(r["pedidos"], [None, None])

    def test_metricas_distinguem_reentrada_de_ingresso_utilizado(self):
        event = dict(evento=dict(id="e1", nome_evento="Sintético", status="ativo"),
                     publico=dict(entraram=20001, sairam=2, presentes=None, publicado=10,
                                  ingressos_utilizados=1, publicados_utilizados=1, comparecimento_pct=10),
                     por_setor=[dict(nome="Setor", entraram=20001, ingressos_utilizados=1, contratado=10, ocupacao_pct=10)],
                     recusas=[], por_hora=[], aparelhos=[])
        r = self.call(dict(chamada="desenhar", argumentos=[event]), "ao_vivo_harness.js")
        self.assertTrue(any("passagens na entrada" in p for p in r["resumo"]))
        self.assertTrue(any(p.startswith("1") and "ingressos utilizados" in p for p in r["resumo"]))
        self.assertFalse(any("dentro agora" in p for p in r["resumo"]))
        self.assertIn("1 utilizados de 10", r["setores"][0])


if __name__ == "__main__":
    unittest.main(verbosity=2)
