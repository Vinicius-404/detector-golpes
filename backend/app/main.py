"""
Ponto de entrada da API.

Rodar localmente:
    uvicorn app.main:app --reload

Swagger UI disponível automaticamente em:
    http://localhost:8000/docs

Redoc (documentação alternativa) em:
    http://localhost:8000/redoc
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.models.schemas import (
    EmailAnaliseRequest,
    EmailAnaliseResponse,
    ErroResponse,
    HealthResponse,
)
from app.services.classifier import classificar_email, _modelo_esta_carregado
from app.core.config import ALLOWED_ORIGINS, MODEL_VERSION

app = FastAPI(
    title="API de Detecção de Golpes Bancários em E-mail",
    description=(
        "API para análise de e-mails utilizando Processamento de Linguagem "
        "Natural e Classificação Supervisionada, com objetivo de identificar "
        "padrões associados a golpes bancários e retornar alertas explicáveis."
    ),
    version="0.1.0",
    contact={"name": "TCC Ciência da Computação"},
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get(
    "/",
    tags=["Status"],
    summary="Endpoint raiz",
)
def raiz():
    return {"mensagem": "API de Detecção de Golpes Bancários - ver /docs para o Swagger"}


@app.get(
    "/health",
    response_model=HealthResponse,
    tags=["Status"],
    summary="Verifica se a API e o modelo estão operacionais",
)
def health_check():
    return HealthResponse(
        status="ok",
        modelo_carregado=_modelo_esta_carregado(),
        versao_modelo=MODEL_VERSION,
    )


@app.post(
    "/analisar-email",
    response_model=EmailAnaliseResponse,
    responses={400: {"model": ErroResponse}},
    tags=["Classificação"],
    summary="Analisa um e-mail e retorna o nível de risco de golpe",
)
def analisar_email(payload: EmailAnaliseRequest):
    if not payload.email_text or not payload.email_text.strip():
        raise HTTPException(
            status_code=400,
            detail={
                "erro": True,
                "codigo": "TEXTO_VAZIO",
                "mensagem": "O campo email_text não pode estar vazio",
            },
        )

    resultado = classificar_email(payload.email_text)
    return resultado
