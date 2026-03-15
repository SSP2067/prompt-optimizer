# Contributing

Thanks for taking the time to improve Prompt Optimizer.

## Before You Start

- Read the [README](./README.md)
- Read the [LICENSE](./LICENSE)
- Use your own API keys in `backend/.env`
- Do not commit secrets, local databases, or build folders

## Good Contribution Areas

- UI and UX improvements
- Performance improvements
- Better setup and error messages
- Cleaner fallback behavior across AI providers
- Testing and documentation

## Local Setup

### Backend

```bash
cd backend
pip install -r requirements.txt
copy .env.example .env
```

Then fill in your own API keys inside `backend/.env`.

Run the backend:

```bash
python -m uvicorn main:app --port 8000 --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev -- -p 3001
```

## Contribution Rules

- Keep changes focused
- Prefer clear, simple UX
- Avoid committing generated files
- Do not remove license notices
- Do not use the project commercially without written permission from the repository owner

## Pull Request Tips

- Explain what changed
- Mention any user-facing impact
- Mention any setup changes
- Include screenshots for UI changes when possible

## What Not to Commit

- `backend/.env`
- `backend/prompts.db`
- `backend/.kb_embeddings.pkl`
- `frontend/node_modules`
- `frontend/.next`
- personal notes or local exports
