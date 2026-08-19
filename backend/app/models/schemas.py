"""
Schemas Pydantic - definem o contrato JSON da API.
Qualquer mudança aqui deve ser alinhada com o time (frontend/modelo)
antes de ser aplicada, pois afeta o contrato de comunicação.
"""

from pydantic import BaseModel, Field
from typing import List, Optional
from enum import Enum


class NivelRisco(str, Enum):
    baixo = "baixo"
    medio = "medio"
    alto = "alto"


class EmailAnaliseRequest(BaseModel):
    """Dados enviados pela extensão do navegador."""

    email_text: str = Field(
        ...,
        min_length=1,
        description="Corpo do e-mail extraído pela extensão",
        examples=["Prezado cliente, sua conta será bloqueada em 24 horas..."],
    )
    email_subject: Optional[str] = Field(
        default=None, description="Assunto do e-mail (opcional)"
    )
    sender: Optional[str] = Field(
        default=None, description="Remetente do e-mail (opcional)"
    )


class PadraoDetectado(BaseModel):
    tipo: str = Field(..., examples=["urgencia_artificial"])
    descricao: str
    trecho: Optional[str] = None


class EmailAnaliseResponse(BaseModel):
    """Resposta enviada de volta para a extensão."""

    risco: NivelRisco
    score: float = Field(..., ge=0.0, le=1.0, description="Score de 0 a 1")
    classificacao: str = Field(..., examples=["golpe", "legitimo"])
    explicacao: List[PadraoDetectado] = []
    modelo_usado: str
    tempo_inferencia_ms: float


class ErroResponse(BaseModel):
    erro: bool = True
    codigo: str
    mensagem: str


class HealthResponse(BaseModel):
    status: str = "ok"
    modelo_carregado: bool
    versao_modelo: Optional[str] = None
