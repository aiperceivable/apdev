.PHONY: sync-charsets

sync-charsets:
	@mkdir -p python/src/apdev/charsets typescript/src/charsets
	cp shared/charsets/*.json python/src/apdev/charsets/
	cp shared/charsets/*.json typescript/src/charsets/
	@echo "Charsets synced to python/ and typescript/"
