#!/usr/bin/env python3
"""Profile the Python helper lane and enforce baseline budget."""

from __future__ import annotations

import cProfile
import io
import pstats
import time

from enrichment_helper import EnrichmentInput, batch_enrich


def workload() -> None:
    items = [
        EnrichmentInput(session_key=f"telegram:peer:user-{index}", status="running", queue_depth=index % 13)
        for index in range(5000)
    ]
    for _ in range(80):
        batch_enrich(items)


def main() -> None:
    profiler = cProfile.Profile()
    start = time.perf_counter()
    profiler.enable()
    workload()
    profiler.disable()
    elapsed = time.perf_counter() - start

    stats_buffer = io.StringIO()
    stats = pstats.Stats(profiler, stream=stats_buffer)
    stats.sort_stats("cumtime")
    stats.print_stats(10)

    print(f"python helper profile elapsed: {elapsed:.4f}s")
    if elapsed > 1.2:
        print(stats_buffer.getvalue())
        raise SystemExit("Python helper exceeded 1.2s budget")

    print("python performance lane passed")


if __name__ == "__main__":
    main()
