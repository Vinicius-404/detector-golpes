from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_analisar_email_golpe():
    response = client.post(
        "/analisar-email",
        json={
            "email_text": "URGENTE: sua conta será bloqueada em 24 horas. "
            "Clique aqui para atualizar seus dados: http://link-suspeito.com"
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["risco"] == "alto"
    assert data["classificacao"] == "golpe"


def test_analisar_email_legitimo():
    response = client.post(
        "/analisar-email",
        json={"email_text": "Oi, tudo bem? Vamos marcar aquele café amanhã?"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["risco"] == "baixo"


def test_email_vazio_retorna_erro():
    # O Pydantic (min_length=1 no schema) barra a string vazia antes de
    # chegar no endpoint, retornando 422 (erro de validação padrão do FastAPI).
    response = client.post("/analisar-email", json={"email_text": ""})
    assert response.status_code == 422
