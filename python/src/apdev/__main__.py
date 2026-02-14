"""Allow running apdev as `python -m apdev`."""

import sys

from apdev.cli import main

sys.exit(main())
