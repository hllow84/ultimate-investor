from app.models.schemas import SentimentResult

# Mock implementation — swap for real Claude API calls once ANTHROPIC_API_KEY is set.

_POSITIVE_WORDS = {"beat", "record", "growth", "profit", "up", "surge", "gain", "strong", "outperform", "upgrade"}
_NEGATIVE_WORDS = {"miss", "loss", "down", "cut", "weak", "layoff", "decline", "downgrade", "risk", "sell"}


def analyze_sentiment(ticker: str, news_items: list[dict]) -> SentimentResult:
    if not news_items:
        return SentimentResult(
            ticker=ticker,
            news_sentiment=0.0,
            headline_count=0,
            summary="No recent news available.",
        )

    score = 0.0
    for item in news_items[:20]:
        title = (item.get("title") or "").lower()
        words = set(title.split())
        score += len(words & _POSITIVE_WORDS) * 0.1
        score -= len(words & _NEGATIVE_WORDS) * 0.1

    clamped = max(-1.0, min(1.0, score))
    label = "positive" if clamped > 0.2 else "negative" if clamped < -0.2 else "neutral"

    return SentimentResult(
        ticker=ticker,
        news_sentiment=round(clamped, 2),
        headline_count=len(news_items),
        summary=(
            f"Keyword-based sentiment across {len(news_items)} headlines is {label} ({clamped:+.2f}). "
            f"Full AI narrative unlocks when ANTHROPIC_API_KEY is configured."
        ),
    )
