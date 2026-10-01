# AI Error Explanation System

A Django web app that explains programming errors using locally hosted Ollama models and a local RAG knowledge base.

## Setup

Use Python 3.10 or newer. In PowerShell, from this directory:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
```

Make sure the Ollama service is running, then download a model if you do not already have one. For example:

```powershell
ollama pull llama3.2
```

The defaults in `.env.example` connect to `http://localhost:11434` and use `llama3.2`. Change `OLLAMA_BASE_URL` or `OLLAMA_MODEL` in `.env` to match your local setup. The model selector lists models installed in Ollama. Ollama does not automatically download a model when selected.

Then initialize the database and start Django:

```powershell
python manage.py migrate
python manage.py runserver
```

Open http://127.0.0.1:8000. Existing explanation history remains in `database/errors.db`.

Error text is sent only to the configured Ollama service. With the default URL, inference runs locally on your computer. If Ollama is unavailable, the app uses its local RAG knowledge base as a limited fallback.

## Configuration

`.env.example` contains the supported environment variables. For deployment, set `DJANGO_DEBUG=false`, provide a strong `DJANGO_SECRET_KEY`, and set `DJANGO_ALLOWED_HOSTS` to your hostnames.

## API routes

- `POST /api/explain/` - explain an error
- `GET /api/history/?limit=20&user_email=...` - list recent history
- `GET|DELETE /api/history/<id>/` - retrieve or delete one history entry
- `DELETE /api/history/` - clear history
- `GET /api/models/` - list locally installed Ollama models
- `GET /api/health/` - check application and Ollama service status
- `POST /api/feedback/` - submit a 1-5 rating
- `POST /api/rebuild-index/` - rebuild the local FAISS index

Add `.txt` files to `rag/documents/`, then use Rebuild Index in the app to index them.
