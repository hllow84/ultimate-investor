from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    database_url: str = "sqlite:///./ultimate_investor.db"

    # Claude AI
    anthropic_api_key: str = ""

    # Stock data
    alpha_vantage_api_key: str = ""
    polygon_api_key: str = ""

    # App
    environment: str = "development"
    secret_key: str = "change-me-in-production"

    class Config:
        env_file = ".env"


settings = Settings()
