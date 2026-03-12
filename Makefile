.PHONY: sync-charsets build-rust test-rust

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
