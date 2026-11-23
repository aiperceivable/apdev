.PHONY: sync-charsets build-rust test-rust \
        lint-python format-python test-python build-python check-python

sync-charsets:
	@mkdir -p python/src/apdev/charsets typescript/src/charsets rust/src/charsets
	cp shared/charsets/*.json python/src/apdev/charsets/
	cp shared/charsets/*.json typescript/src/charsets/
	cp shared/charsets/*.json rust/src/charsets/
	@echo "Charsets synced to python/, typescript/, and rust/"

build-rust:
	cd rust && cargo build --release

test-rust:
	cd rust && cargo test

# Python package (python/). uv run keeps the lockfile in sync automatically.
lint-python:
	cd python && uvx ruff@0.8.4 check src tests
	cd python && uvx ruff@0.8.4 format --check src tests

format-python:
	cd python && uvx ruff@0.8.4 format src tests

test-python:
	cd python && uv run --all-extras pytest -q --cov=apdev --cov-report=term-missing

build-python:
	cd python && uv run --all-extras python -m build
	cd python && uvx twine check dist/*

# What CI runs for the Python package, minus the version matrix.
check-python: lint-python test-python build-python
