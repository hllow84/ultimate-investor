# Ultimate Investor

AI-powered stock research platform inspired by Stock Oracle. Built with FastAPI + React.

## Features

- **AI Health Score** — multi-pillar financial scoring (profitability, debt, growth, efficiency, valuation, momentum)
- **Valuation Models** — DCF, P/E, EV/EBITDA, PEG, Price/Book with fair value estimate
- **Moat Analysis** — Claude AI-generated competitive advantages, risks, and growth drivers
- **News Sentiment** — real-time headline sentiment analysis via Claude AI
- **Watchlist** — track and manage your stocks
- **Price Alerts** — set price threshold alerts

## Stack

- **Backend**: Python, FastAPI, SQLAlchemy, PostgreSQL
- **Frontend**: React, TypeScript, Vite, Tailwind CSS, TanStack Query
- **AI**: Anthropic Claude API
- **Data**: yfinance (free tier to start)

## Getting Started

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate       # Windows
pip install -r requirements.txt
cp .env.example .env         # fill in your keys
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

App runs at http://localhost:5173 — API at http://localhost:8000

## API Docs

FastAPI auto-docs available at http://localhost:8000/docs
