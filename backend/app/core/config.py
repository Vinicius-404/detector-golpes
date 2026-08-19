"""
Configurações centrais do projeto.
Usa variáveis de ambiente para não deixar valores fixos no código
(útil na hora do deploy no Render/Railway/Fly.io).
"""

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent

# Caminho do modelo treinado. Quando o modelo real chegar, basta
# colocar o arquivo em backend/model_files/ e ajustar o nome aqui,
# ou sobrescrever via variável de ambiente MODEL_PATH.
MODEL_PATH = os.getenv("MODEL_PATH", str(BASE_DIR / "model_files" / "modelo.pkl"))
VECTORIZER_PATH = os.getenv(
    "VECTORIZER_PATH", str(BASE_DIR / "model_files" / "vectorizer.pkl")
)

MODEL_VERSION = os.getenv("MODEL_VERSION", "mock_v0")

# Origens permitidas (CORS). Em produção, trocar "*" pela URL/ID da extensão.
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*").split(",")
