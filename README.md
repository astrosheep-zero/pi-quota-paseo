# pi-quota-paseo

A [Paseo](https://paseo.sh) **usage source plugin** that bridges [@astrosheep/pi-quota](https://github.com/astrosheep-zero/pi-quota): quota windows, balances and spend for every Pi provider with a quota adapter, rendered by Paseo's native usage UI (host Usage modal + per-agent popover). No custom frontend — server-only plugin.

- **Global discovery** lists every auth-ready provider: built-ins (`openai-codex`, `kimi-coding`, `opencode-go`, `deepseek`) plus everything bound under `quotaUsage.providers` in Pi's global `settings.json` (new-api / Sub2API / YesCode / exec / alias).
- **Session discovery** (`provider: "pi"`) attributes the agent to the account behind its selected model, resolved against the session's own launch environment. Other harnesses get `[]`.
- **Credentials** are resolved read-only via `pi auth check --provider <id> --credentials --no-refresh --json`; the plugin never parses or writes credential stores. When an OAuth query rejects an expired login, it delegates refresh to `pi` itself and retries once.
- **Account keys** are rotation-stable: ChatGPT account IDs from JWT claims when available, otherwise a hash of the API key or of the store locator. Credentials and raw emails never become keys or inputs.
- **Relay endpoints** (new-api, Sub2API) come from each provider's `baseUrl` in Pi's `models.json`, mirroring the extension's model-registry resolution.

## Icons

Each provider gets its own usage source: Codex, Kimi, DeepSeek and OpenCode Go use brand logos; other providers use a normal-width, medium-weight initial in muted ink, with no background or decorative cuts. Colors are stable hashes of provider names (same initials may still share a color).

Sources register at plugin load. Providers added later still appear automatically under a **Pi Quota** catch-all with the pixel Pi logo; run `paseo plugin reload pi-quota-paseo` to give them individual icons. Source IDs changed in 0.2.0, so existing usage pins may need re-pinning.

Letter SVGs are prebuilt, font-free assets — nothing is written into an installed plugin directory. Regenerate them with `npm run generate-icons`. Icon attribution is in [NOTICE](./NOTICE).

## Configure

Hide providers from all views with `~/.pi/agent/pi-quota-paseo.json` (resolved from the same agent directory Pi uses):

```json
{ "hide": ["kimi-coding"] }
```

Re-read on every discovery; no reload needed. Set `PI_QUOTA_PASEO_PI` to override the `pi` binary.

## Develop

Requires Node ≥ 22.18. Quota adapters are a published dependency; no local `pi-quota` checkout is needed.

```bash
npm install --ignore-scripts
npm test
npm run typecheck
```

## Install

```bash
paseo plugin install /absolute/path/to/pi-quota-paseo
paseo plugin ls          # expect: running
paseo plugin logs pi-quota-paseo
```

The daemon needs plugins enabled (`pluginsEnabled: true` in the daemon's `config.json`) and the `pi` CLI on its `PATH` (`PI_QUOTA_PASEO_PI` overrides the binary).

## Known limits

See [OVERVIEW.md](./OVERVIEW.md#known-limits).
