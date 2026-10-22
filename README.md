# Independent Rotifer Protocol QA

User-authorized external developer tests against published `@rotifer/playground@0.30.0`.
This repository contains only synthetic fixtures and test harnesses. It does not contain product fixes, credentials or personal project data.

The manual Windows workflow uses a standard Windows x64 hosted runner and Node 22.19.0. It verifies a fresh npm installation, the matching native addon, real WASM execution, Agent/Seq execution, Genome export, known diagnostics and recovery. Native fixture output must be checked; a process exit code alone is insufficient.

The portable WASM fixtures were compiled from the adjacent arithmetic sources using public Javy 3.0.1 on macOS, and were already executed on Mac and Linux. Their provenance and SHA-256 hashes are in `fixtures/manifest.json`. Windows compilation and the complete source test suite are outside this workflow's claim.

No protocol service credentials are supplied. Host Node HTTP requests are restricted to GET/HEAD/OPTIONS. Automatic publishing and telemetry are disabled. The workflows run manually, without paid runners, paid services, or uploaded Actions artifacts. Results are emitted into job logs and the job summary.

The separate backend preflight uses a standard Ubuntu runner, Supabase CLI 2.121.0, a newly generated local configuration, and the unchanged 89 active migrations from the pinned public source commit. Containers use a dedicated Docker network with an outbound connection deny rule, verified by a live HTTPS refusal probe, to prevent scheduled SQL or hooks from contacting existing services. Local service connections and localhost access remain available. This is a local deployment-replay check, not evidence of a functioning cloud deployment or real OAuth.

Independent QA harness and synthetic arithmetic fixtures: MIT License. Javy-generated WebAssembly embeds third-party runtime components under their respective upstream licenses; see NOTICE.md.

## Controlled public P2P nodes

`p2p-node.cjs A` starts the first dedicated test node for at most ten minutes and prints its public multiaddr. `p2p-node.cjs B <A-multiaddr>` first checks A's TCP port, then runs a second node for 150 seconds, including a restart and fresh-announcement checks. Both use private, newly allocated test HOME directories and stop their own daemon on completion or interruption. They install the pinned public npm package locally; they do not change a personal Rotifer workspace, open firewall rules, or create cloud resources.

Use existing Node >=22.18 and npm on two dedicated controlled machines, with inbound TCP 41111 reachable between them within existing resource allowances. No default public bootstrap is used. The script fetches a public IPv4 from `https://api.ipify.org` unless the operator supplies `ROTIFER_QA_PUBLIC_IP`; fixture downloads are pinned and digest-checked. The report includes public peer addresses and synthetic test observations, never the daemon token or identity key. Do not upload personal credentials with reports.

The `--loopback-harness` mode is only for validating this harness locally. It must not be counted as public-network coverage. Initial local validation exposed a fixed-port restart/data-exchange failure; that observation and explicit connection controls remain in the report. A failed data-exchange assertion is retained and is not converted into a pass by a later recovery attempt. Current CLI DHT search is explicitly unavailable; no search success is inferred.
