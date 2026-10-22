# Independent Rotifer Protocol QA

User-authorized external developer tests against published `@rotifer/playground@0.30.0`.
This repository contains only synthetic fixtures and test harnesses. It does not contain product fixes, credentials or personal project data.

The manual Windows workflow uses a standard Windows x64 hosted runner and Node 22.19.0. It verifies a fresh npm installation, the matching native addon, real WASM execution, Agent/Seq execution, Genome export, known diagnostics and recovery. Native fixture output must be checked; a process exit code alone is insufficient.

The portable WASM fixtures were compiled from the adjacent arithmetic sources using public Javy 3.0.1 on macOS, and were already executed on Mac and Linux. Their provenance and SHA-256 hashes are in `fixtures/manifest.json`. Windows compilation and the complete source test suite are outside this workflow's claim.

No protocol service credentials are supplied. Host Node HTTP requests are restricted to GET/HEAD/OPTIONS. Automatic publishing and telemetry are disabled. The workflows run manually, without paid runners, paid services, or uploaded Actions artifacts. Results are emitted into job logs and the job summary.

The separate backend preflight uses a standard Ubuntu runner, Supabase CLI 2.121.0, a newly generated local configuration, and the unchanged 89 active migrations from the pinned public source commit. Containers use a dedicated Docker network with an outbound connection deny rule, verified by a live HTTPS refusal probe, to prevent scheduled SQL or hooks from contacting existing services. Local service connections and localhost access remain available. This is a local deployment-replay check, not evidence of a functioning cloud deployment or real OAuth.

Independent QA harness and synthetic arithmetic fixtures: MIT License. Javy-generated WebAssembly embeds third-party runtime components under their respective upstream licenses; see NOTICE.md.
