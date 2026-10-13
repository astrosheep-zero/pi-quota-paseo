# Pi Quota usage source

Shows your Pi provider quota in Paseo's native usage UI: the host-wide Usage modal lists every logged-in provider account, and each Pi agent's popover shows the account that agent is actually burning.

Accounts come from the same place the pi-quota extension uses: Pi's built-in Codex, Kimi, OpenCode Go and DeepSeek adapters, plus every provider bound in the `quotaUsage` section of Pi's global settings (new-api, Sub2API, YesCode, exec and alias bindings included).

## How it works

The plugin resolves credentials read-only through Pi's official CLI (`pi auth check --credentials --no-refresh`) and re-reads Pi's settings file on every fetch, so token rotation and settings edits take effect without reinstalling anything. It never writes credential stores and never refreshes tokens itself; a login that needs a refresh shows Paseo's standard remedy pointing at the `pi` CLI.

Session attribution uses the agent's launch environment: for a Pi agent, the plugin checks auth exactly as that session sees it and reports only the account behind the session's selected model.

## Configuration

Hide providers from every view by creating `pi-quota-paseo.json` next to Pi's agent config (`~/.pi/agent/pi-quota-paseo.json` by default):

```json
{ "hide": ["kimi-coding"] }
```

The file is re-read on every discovery, so changes apply the next time the usage view refreshes. Relay providers (new-api, Sub2API) resolve their query endpoint from the provider's `baseUrl` in Pi's `models.json`, the same source the Pi extension uses.

## Requirements

- Paseo 0.11 or newer.
- The `pi` CLI on the daemon's PATH, with providers already logged in. Set the `PI_QUOTA_PASEO_PI` environment variable to point at a specific binary if needed.
- Quota adapters come from the `@astrosheep/pi-quota` package; providers without an adapter there are not shown.

## Known limits

- Sessions authenticated purely through environment variables (no credential store) discover normally but their fetch reports the login as rejected, because the store cannot be re-read later.
- Balances in currencies other than USD appear as detail rows, since Paseo balance meters only support usd, credits, requests and tokens.
