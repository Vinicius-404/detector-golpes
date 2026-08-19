"""
Serviço responsável por classificar o e-mail.

MOCK ATUAL:
Este módulo usa uma lógica baseada em palavras-chave apenas para
o backend funcionar de ponta a ponta enquanto o modelo real não
está pronto. Quando o modelo (TF-IDF+LogReg, SVM ou DistilBERT)
for entregue, substituir o conteúdo da função `classificar_email`
mantendo a mesma assinatura (mesmo input/output), para não quebrar
o contrato com o restante do time.
"""

import time
from app.models.schemas import EmailAnaliseResponse, PadraoDetectado, NivelRisco
from app.core.config import MODEL_VERSION

# Palavras-chave de exemplo para o mock (substituir pelo modelo real depois)
PALAVRAS_URGENCIA = ["urgente", "24 horas", "imediatamente", "bloqueada", "bloqueado"]
PALAVRAS_DADOS = ["atualizar seus dados", "confirme seus dados", "regularize"]
PALAVRAS_LINK = ["clique aqui", "http://", "https://"]


def _modelo_esta_carregado() -> bool:
    """
    Placeholder. Quando o modelo real for integrado, esta função deve
    checar se os arquivos de modelo/vetorizador foram carregados com sucesso.
    """
    return True


def classificar_email(email_text: str) -> EmailAnaliseResponse:
    """
    Recebe o texto do e-mail e retorna a análise de risco.

    Contrato mantido para facilitar a troca do mock pelo modelo real:
    - input: string (texto do e-mail)
    - output: EmailAnaliseResponse
    """
    inicio = time.perf_counter()

    texto_lower = email_text.lower()
    padroes: list[PadraoDetectado] = []
    pontuacao = 0.0

    for palavra in PALAVRAS_URGENCIA:
        if palavra in texto_lower:
            padroes.append(
                PadraoDetectado(
                    tipo="urgencia_artificial",
                    descricao="Uso de expressão de urgência",
                    trecho=palavra,
                )
            )
            pontuacao += 0.3
            break

    for palavra in PALAVRAS_DADOS:
        if palavra in texto_lower:
            padroes.append(
                PadraoDetectado(
                    tipo="solicitacao_dados",
                    descricao="Solicitação de atualização de dados sensíveis",
                    trecho=palavra,
                )
            )
            pontuacao += 0.3
            break

    for palavra in PALAVRAS_LINK:
        if palavra in texto_lower:
            padroes.append(
                PadraoDetectado(
                    tipo="link_suspeito",
                    descricao="Presença de link na mensagem",
                    trecho=palavra,
                )
            )
            pontuacao += 0.2
            break

    score = min(pontuacao, 1.0)

    if score >= 0.6:
        risco = NivelRisco.alto
        classificacao = "golpe"
    elif score >= 0.3:
        risco = NivelRisco.medio
        classificacao = "suspeito"
    else:
        risco = NivelRisco.baixo
        classificacao = "legitimo"

    tempo_ms = (time.perf_counter() - inicio) * 1000

    return EmailAnaliseResponse(
        risco=risco,
        score=score,
        classificacao=classificacao,
        explicacao=padroes,
        modelo_usado=MODEL_VERSION,
        tempo_inferencia_ms=round(tempo_ms, 2),
    )
