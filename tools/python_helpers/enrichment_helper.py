"""Small Python helper used by skill/tooling lanes for enrichment formatting."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(slots=True)
class EnrichmentInput:
    session_key: str
    status: str
    queue_depth: int


def enrich_label(payload: EnrichmentInput) -> str:
    prefix = payload.session_key.split(":")[-1]
    urgency = "high" if payload.queue_depth > 10 else "normal"
    return f"{prefix}:{payload.status}:{urgency}"


def batch_enrich(items: list[EnrichmentInput]) -> list[str]:
    return [enrich_label(item) for item in items]
