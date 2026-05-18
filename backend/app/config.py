from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    database_url: str = "sqlite:///./ultimate_investor.db"

    # Claude AI
    anthropic_api_key: str = ""

    # Stock data
    fmp_api_key: str = ""
    alpha_vantage_api_key: str = ""
    polygon_api_key: str = ""

    # Email alerts (optional — Gmail SMTP)
    smtp_from: str = ""       # your Gmail address
    smtp_password: str = ""   # Gmail app password (16-char, spaces ok)
    alert_email_to: str = ""  # recipient (defaults to smtp_from if blank)

    # App
    environment: str = "development"
    secret_key: str = "change-me-in-production"

    class Config:
        env_file = ".env"


settings = Settings()
