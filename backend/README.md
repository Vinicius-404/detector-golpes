# Backend — Sistema de Detecção de Golpes Bancários via E-mail

Backend do **"Sistema Web para Detecção e Alerta de Golpes Bancários via
E-mail utilizando Processamento de Linguagem Natural e Classificação
Supervisionada"**.

Responsável por: receber o texto do e-mail (enviado pela extensão do
navegador), aplicar o modelo de classificação treinado e retornar o nível de
risco com explicação dos padrões detectados.

---

## Arquitetura (visão geral)

```
Usuário → extensão de navegador → [requisição HTTP] → API (este backend)
                                                            │
                                                            ▼
                                                  Modelo de IA
                                     (TF-IDF+LogReg / SVM / DistilBERT)
```

Este repositório cobre apenas a caixa **API (FastAPI)** do fluxograma. A
extração do texto do e-mail é responsabilidade da extensão (frontend); o
treinamento do modelo é responsabilidade de outra pessoa do grupo.

---

## Estrutura de pastas

```
backend/
├── app/
│   ├── main.py                 # Cria a API, registra rotas, configura CORS
│   ├── core/
│   │   └── config.py           # Variáveis de ambiente e caminhos de modelo
│   ├── models/
│   │   └── schemas.py          # Contrato JSON (Pydantic) de request/response
│   └── services/
│       └── classifier.py       # Lógica de classificação (hoje: mock)
├── model_files/                # (a criar) onde entram modelo.pkl e vectorizer.pkl
├── tests/
│   └── test_main.py            # Testes automatizados dos endpoints
├── requirements.txt
└── README.md
```

---

## Como rodar localmente

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt

uvicorn app.main:app --reload
```

A API sobe em `http://localhost:8000`.

- Swagger UI (documentação interativa, testável no navegador):
  `http://localhost:8000/docs`
- Redoc (documentação alternativa, somente leitura):
  `http://localhost:8000/redoc`
- Especificação OpenAPI crua (JSON):
  `http://localhost:8000/openapi.json`

O Swagger é gerado **automaticamente pelo FastAPI** a partir dos schemas
Pydantic e das descrições dos endpoints em `main.py` — não precisa escrever
nada manualmente além disso.

### Rodando os testes

```bash
pip install pytest httpx
python -m pytest tests/ -v
```

---

## Como rodar com Docker

```bash
docker build -t detector-golpes-email .
docker run -d -p 8000:8000 --name detector detector-golpes-email
```

A API sobe em `http://localhost:8000` (mesmos endpoints `/docs`, `/redoc`,
`/health` etc. descritos acima).

Se a porta 8000 já estiver em uso na sua máquina, mapeie para outra porta:

```bash
docker run -d -p 8001:8000 --name detector detector-golpes-email
```

### Comandos úteis

```bash
docker ps                        # containers rodando
docker logs -f detector          # ver logs em tempo real
docker stop detector              # parar
docker rm -f detector             # parar e remover de uma vez
```

Para rebuildar depois de alterar o código:

```bash
docker rm -f detector 2>/dev/null; docker build -t detector-golpes-email . && docker run -d -p 8000:8000 --name detector detector-golpes-email
```

### Rodando os testes com Docker

`pytest` e `httpx` não fazem parte da imagem final (não estão no
`requirements.txt`, só são usados em desenvolvimento). Para rodar os testes
sem instalar nada localmente, suba um container avulso que instala e roda:

```bash
docker run --rm detector-golpes-email sh -c "pip install pytest httpx && python -m pytest tests/ -v"
```

`--rm` remove o container assim que os testes terminam.

---

## Estado atual: modelo mockado

O arquivo `app/services/classifier.py` contém uma lógica **provisória**
baseada em busca de palavras-chave (urgência, solicitação de dados, links).
Isso existe só para o backend funcionar de ponta a ponta (extensão ↔ API)
enquanto o modelo de verdade não está pronto.


## Contrato JSON da API

### `POST /analisar-email`

**Request:**
```json
{
  "email_text": "Prezado cliente, sua conta será bloqueada em 24 horas...",
  "email_subject": "URGENTE: Regularize sua conta",
  "sender": "seguranca@banco-verificacao.com"
}
```

`email_subject` e `sender` são opcionais.

**Response (200):**
```json
{
  "risco": "alto",
  "score": 0.8,
  "classificacao": "golpe",
  "explicacao": [
    {
      "tipo": "urgencia_artificial",
      "descricao": "Uso de expressão de urgência",
      "trecho": "bloqueada"
    }
  ],
  "modelo_usado": "mock_v0",
  "tempo_inferencia_ms": 0.12
}
```

**Response de erro de validação (422):** e-mail vazio ou campo ausente
(gerado automaticamente pelo FastAPI/Pydantic).

### `GET /health`

Retorna o status da API e se o modelo está carregado. Útil para checar se o
deploy está de pé.

```json
{
  "status": "ok",
  "modelo_carregado": true,
  "versao_modelo": "mock_v0"
}
```

---

## Variáveis de ambiente

| Variável           | Padrão                              | Descrição                                   |
|---------------------|--------------------------------------|----------------------------------------------|
| `MODEL_PATH`        | `model_files/modelo.pkl`            | Caminho do modelo treinado                    |
| `VECTORIZER_PATH`   | `model_files/vectorizer.pkl`        | Caminho do vetorizador TF-IDF                 |
| `MODEL_VERSION`     | `mock_v0`                            | Identificador da versão do modelo em uso      |
| `ALLOWED_ORIGINS`   | `*`                                   | Origens permitidas por CORS (ajustar no deploy)|
