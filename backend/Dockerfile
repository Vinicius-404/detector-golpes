FROM python:3.11-slim

WORKDIR /app

# 3. Copia o arquivo de dependências para o contêiner
COPY requirements.txt .

# 4. Instala as dependências listadas
RUN pip install --no-cache-dir -r requirements.txt

# 5. Copia todo o resto do seu código para dentro do contêiner
COPY . .

# 6. Expõe a porta usada pelo uvicorn
EXPOSE 8000

# 7. Sobe a API com uvicorn (app/main.py define o objeto `app`)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]