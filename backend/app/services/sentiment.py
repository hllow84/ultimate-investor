import anthropic
from app.config import settings
from app.models.schemas import SentimentResult

client = anthropic.Anthropic(api_key=settings.anthropic_api_key)


def analyze_sentiment(ticker: str, news_items: list[dict]) -> SentimentResult:
    if not news_items:
        return SentimentResult(
            ticker=ticker,
            news_sentiment=0.0,
            headline_count=0,
            summary="No recent news available.",
        )

    headlines = "\n".join(
        f"- {item.get('title', '')}" for item in news_items[:20]
    )

    prompt = f"""Analyze the market sentiment for {ticker} based on these recent headlines:

{headlines}

Respond in JSON:
{{
  "sentiment_score": <float from -1.0 (very negative) to 1.0 (very positive)>,
  "summary": "<1-2 sentence plain-English take on what the news signals for investors>"
}}"""

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=256,
        messages=[{"role": "user", "content": prompt}],
    )

    import json
    data = json.loads(message.content[0].text)

    return SentimentResult(
        ticker=ticker,
        news_sentiment=data["sentiment_score"],
        headline_count=len(news_items),
        summary=data["summary"],
    )
