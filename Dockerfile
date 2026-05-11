FROM python:3.12-slim
WORKDIR /app
COPY backend_py/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend_py/ .
EXPOSE 8080
CMD ["python", "server.py"]
