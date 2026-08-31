# Overwatch — ML inference service (FastAPI). OPTIONAL: the API falls back to deterministic scoring
# if this service is absent, so you can ship without it and add it later. Trains models at build
# (a few minutes) so the service has artifacts to serve.
FROM python:3.12-slim
WORKDIR /app
# libgomp1 is required by XGBoost / CatBoost at runtime.
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 && rm -rf /var/lib/apt/lists/*
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY src ./src
# Generate a synthetic world and train the models the server loads.
RUN python src/worldmodel.py --out data/train.csv && python src/train.py --data data/train.csv --out artifacts
ENV OVERWATCH_MODELS=/app/artifacts
EXPOSE 8899
CMD ["python","-m","uvicorn","serve:app","--app-dir","src","--host","0.0.0.0","--port","8899"]
