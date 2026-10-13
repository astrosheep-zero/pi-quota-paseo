# pi-quota-paseo

A [Paseo](https://paseo.sh) **usage source plugin** that bridges [@astrosheep/pi-quota](https://github.com/astrosheep-zero/pi-quota): quota windows, balances and spend for every Pi provider with a quota adapter, rendered by Paseo's native usage UI (host Usage modal + per-agent popover). No custom frontend — server-only plugin.

- **Global discovery** lists every auth-ready provider: built-ins (`openai-codex`, `kimi-coding`, `opencode-go`, `deepseek`) plus everything bound under `quotaUsage.providers` in Pi's global `settings.json` (new-api / Sub2API / YesCode / exec / alias).
- **Session discovery** (`provider: "pi"`) attributes the agent to the account behind its selected model, resolved against the session's own launch environment. Other harnesses get `[]`.
- **Credentials** are resolved read-only via `pi auth check --provider <id> --credentials --no-refresh --json`; the plugin never parses or writes credential stores and never refreshes tokens.
- **Account keys** are rotation-stable: ChatGPT account IDs from JWT claims when available, otherwise a hash of the API key or of the store locator. Credentials and raw emails never become keys or inputs.

## Develop

Requires Node ≥ 22.18 (TypeScript runs via type stripping) and a local checkout of `pi-quota` (linked via `file:`).

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
