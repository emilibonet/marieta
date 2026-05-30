"""FastAPI application factory."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from marieta.core.config import settings
from marieta.core.database import engine
from marieta.core.logging import configure_logging


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown lifecycle for the FastAPI application."""
    configure_logging()
    yield
    await engine.dispose()


def create_app() -> FastAPI:
    """Build and return the FastAPI application instance."""

    app = FastAPI(
        title="Marieta",
        version=settings.app_version,
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins.split(","),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    return app


app = create_app()
