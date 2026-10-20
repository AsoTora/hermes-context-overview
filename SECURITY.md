# Security policy

Only the current source release receives fixes; upgrade to the latest reviewed release. This is not a security certification or native-host qualification.

## Reporting

GitHub private vulnerability reporting is **not enabled** as of 2026-10-20. Do not post credentials, transcripts, personal paths, exploit details or other sensitive material in public issues. Open a minimal issue requesting a private reporting channel, without disclosing the vulnerability, and wait for a maintainer-provided channel. No response-time SLA is promised. Enabling GitHub private reporting is a maintainer recommendation, not an existing repository guarantee.

## Boundary

The runtime entry requests only `session.context_breakdown({session_id})` through the host SDK. It does not read raw prompts, files, credentials or config, add telemetry, or contact third-party services. Gateway-returned metadata can still contain sensitive labels and paths. Do not attach real payloads to issues or screenshots; use sanitized demo fixtures.

The plugin executes inside a trusted Hermes Desktop host and relies on host ownership/routing and RPC authorization. Browser harnesses emulate those seams; tests do not establish host isolation. Release checksums detect corruption relative to a trusted checksum file, not malicious replacement of both artifacts and checksums. Verify the repository, tag and release provenance before installation.

Development dependencies and CI actions are separate supply-chain surfaces; frozen lockfiles, pinned actions and an explicit artifact allowlist reduce, but do not eliminate, that risk.
