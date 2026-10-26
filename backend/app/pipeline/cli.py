import json

from app.pipeline.registry import describe_pipeline


def main():
    """Inspect the specified pipeline. This command does not run a worker or an ML model."""
    print(json.dumps(describe_pipeline(), indent=2))


if __name__ == "__main__":
    main()
