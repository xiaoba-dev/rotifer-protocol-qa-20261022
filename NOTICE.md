# Fixture provenance

The two Gene sources are synthetic arithmetic controls: add one and multiply by two. Metadata uses a fixed numeric creation timestamp and a test domain. The compiled WASM files contain the public Javy/QuickJS runtime; they are portable execution fixtures, not platform addons or product releases.

Javy: https://github.com/bytecodealliance/javy (Apache-2.0 with LLVM exception).
QuickJS: https://bellard.org/quickjs/ (MIT).

The package under test is fetched unchanged from npm under its own Apache-2.0 license. No private source, account data or production configuration is included.
