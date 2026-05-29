from pydantic import BaseModel
from typing import Optional


class StockSummary(BaseModel):
    ticker: str
    name: str
    price: float
    change_pct: float
    market_cap: Optional[float] = None
    sector: Optional[str] = None
    industry: Optional[str] = None
    country: Optional[str] = None
    employees: Optional[int] = None
    website: Optional[str] = None
    description: Optional[str] = None


class HealthScore(BaseModel):
    ticker: str
    overall: float  # 0-100
    profitability: float
    debt: float
    growth: float
    efficiency: float
    valuation: float
    momentum: float
    predictability: float
    summary: str


class ValuationResult(BaseModel):
    ticker: str
    current_price: float = 0.0
    # ── Core methods (used in weighted average) ──────────────────────────────
    dcf_value: Optional[float] = None           # 10-yr 2-stage DCF (operating CF)
    ev_ebitda_value: Optional[float] = None
    sticker_price: Optional[float] = None       # Phil Town Rule #1
    graham_number_value: Optional[float] = None # Ben Graham √(22.5 × EPS × BVPS)
    lynch_fair_value: Optional[float] = None    # Peter Lynch EPS × growth%
    analyst_target: Optional[float] = None
    forward_pe_value: Optional[float] = None    # Forward EPS × sector P/E
    trailing_pe_value: Optional[float] = None   # Trailing EPS × sector P/E
    pb_value: Optional[float] = None            # Book value × sector P/B
    # ── Extended DCF methods ─────────────────────────────────────────────────
    dcf_20_value: Optional[float] = None        # 20-yr DCF using operating CF
    dfcf_20_value: Optional[float] = None       # 20-yr DCF using free CF
    dni_20_value: Optional[float] = None        # 20-yr DCF using net income
    dfcf_terminal_value: Optional[float] = None # Gordon Growth Model on FCF
    # ── Ratio-based methods ──────────────────────────────────────────────────
    ps_ratio_value: Optional[float] = None      # Revenue/share × sector P/S
    pe_nri_value: Optional[float] = None        # Trailing EPS × mean sector P/E
    psg_value: Optional[float] = None           # Rev/share × rev-growth% (PSG=1)
    peg_nri_value: Optional[float] = None       # Trailing EPS × earn-growth% (PEG=1)
    # ── Raw market multiples ─────────────────────────────────────────────────
    pe_ratio: Optional[float] = None
    forward_pe: Optional[float] = None
    ev_ebitda: Optional[float] = None
    peg_ratio: Optional[float] = None
    price_to_book: Optional[float] = None
    # ── Composite output ─────────────────────────────────────────────────────
    fair_value_estimate: float
    margin_of_safety_price: Optional[float] = None  # FV × 0.75 — Adam Khoo buy zone
    strong_buy_price: Optional[float] = None         # FV × 0.50 — Buffett/Phil Town
    upside_pct: float
    verdict: str  # "undervalued" | "fairly valued" | "overvalued"


class MoatAnalysis(BaseModel):
    ticker: str
    moat_score: float  # 0-10
    bull_thesis: list[str]
    bear_thesis: list[str]
    ai_summary: str


class SentimentResult(BaseModel):
    ticker: str
    news_sentiment: float  # -1 to 1
    earnings_sentiment: Optional[float] = None
    headline_count: int
    summary: str


class FinancialPeriod(BaseModel):
    labels: list[str]
    revenue: list[Optional[float]]
    revenue_growth: list[Optional[float]]    # % YoY (quarterly = same quarter prior year)
    net_income: list[Optional[float]]
    net_income_growth: list[Optional[float]] # % YoY
    eps: list[Optional[float]]
    gross_margin: list[Optional[float]]      # %
    operating_margin: list[Optional[float]]  # %
    net_margin: list[Optional[float]]        # %
    free_cash_flow: list[Optional[float]]
    fcf_growth: list[Optional[float]]        # % YoY


class YoYFinancials(BaseModel):
    ticker: str
    annual: FinancialPeriod
    quarterly: FinancialPeriod


class ValuationRange(BaseModel):
    ticker: str
    current_price: float
    bear: float
    base: float
    bull: float
    bear_reasoning: str
    base_reasoning: str
    bull_reasoning: str
    ai_summary: str
    inputs: dict


class PricePoint(BaseModel):
    date: str
    close: float
    sma50: Optional[float] = None
    sma200: Optional[float] = None


class TechnicalMomentum(BaseModel):
    ticker: str
    rsi: float
    sma50: Optional[float] = None
    sma200: Optional[float] = None
    current_price: float
    pct_above_sma50: Optional[float] = None
    pct_above_sma200: Optional[float] = None
    w52_high: float
    w52_low: float
    pct_from_52w_high: float
    signal: str  # "bullish" | "neutral" | "bearish"
    price_history: list[PricePoint]


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
    triggered_at: Optional[str] = None


class InsiderTrade(BaseModel):
    date: str
    filing_date: str
    name: str
    title: str
    transaction_type: str   # "Buy" | "Sell" | "Award/Exercise" | "Disposition" | "Other"
    transaction_code: str
    shares: int
    price: Optional[float] = None
    value: Optional[float] = None
    shares_owned: Optional[int] = None
    is_derivative: bool = False


class UserCreate(BaseModel):
    email: str
    password: str


class UserResponse(BaseModel):
    id: int
    email: str


class Token(BaseModel):
    access_token: str
    user: UserResponse
