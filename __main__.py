"""Ops Control Plane helper entrypoint."""

from __future__ import annotations


def main() -> None:
    print(
        "Ops Control Plane\n"
        "\n"
        "Install dependencies:\n"
        "  pnpm install\n"
        "\n"
        "Validate configuration:\n"
        "  pnpm doctor:config\n"
        "\n"
        "Run gateway:\n"
        "  pnpm --filter @ops/gateway dev\n"
        "\n"
        "Run dashboard:\n"
        "  pnpm --filter dashboard dev\n"
    )


if __name__ == "__main__":
    main()
