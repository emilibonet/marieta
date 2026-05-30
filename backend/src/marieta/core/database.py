"""SQLAlchemy 2.0 async engine and session factory."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from marieta.core.config import settings

engine = create_async_engine(
    settings.database_url,
    echo=False,
    pool_size=5,
    max_overflow=10,
)

async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_session() -> AsyncSession:
    """Yield an async database session (used as FastAPI dependency)."""
    async with async_session_factory() as session:
        try:
            yield session
        finally:
            await session.close()
