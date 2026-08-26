"""Instagram collector sidecar for SOLD.

Deliberately thin: this package does Instagram access and normalisation and
nothing else. No database, no business logic, no orchestration — all of that
stays in TypeScript. It speaks NDJSON on stdout so the Node side can stream
progress into the run UI as posts arrive rather than waiting for a final lump.
"""
