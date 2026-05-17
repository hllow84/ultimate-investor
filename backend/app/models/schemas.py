from pydantic import BaseModel
from typing import Optional


class StockSummary(BaseModel):
    ticker: str
    name: str
    price: float
    change_pct: float
    market_cap: Optional[float] = None
    sector: Optional[str] = None


class HealthScore(BaseModel):
    ticker: str
    overall: float  # 0-100
    profitability: float
    debt: float
    growth: float
    efficiency: float
    valuation: float
    momentum: float
    summary: str


class ValuationResult(BaseModel):
    ticker: str
    dcf_value: Optional[float] = None
    pe_ratio: Optional[float] = None
    ev_ebitda: Optional[float] = None
    peg_ratio: Optional[float] = None
    price_to_book: Optional[float] = None
    fair_value_estimate: float
    upside_pct: float
    verdict: str  # "undervalued" | "fairly valued" | "overvalued"


class MoatAnalysis(BaseModel):
    ticker: str
    moat_score: float  # 0-10
    competitive_advantages: list[str]
    risks: list[str]
    growth_drivers: list[str]
    ai_summary: str


class SentimentResult(BaseModel):
    ticker: str
    news_sentiment: float  # -1 to 1
    earnings_sentiment: Optional[float] = None
    headline_count: int
    summary: str


class WatchlistItem(BaseModel):
    ticker: str
    added_at: Optional[str] = None
    notes: Optional[str] = None


class Alert(BaseModel):
    id: Optional[int] = None
    ticker: str
    alert_type: str  # "price_above" | "price_below" | "metric_change"
    threshold: float
    metric: Optional[str] = None
    active: bool = True
