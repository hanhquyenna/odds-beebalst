# 9router tunnel (launchd)

`run-tunnel.ts` keeps a Cloudflare quick tunnel in front of 9router (`http://127.0.0.1:20129`) and points Broods project `odds-apply` at the public `/v1` base (`NINE_ROUTER_BASE_URL`, then `broods deploy`).

It restarts `cloudflared` when stderr contains `Tunnel not found` or `Register tunnel error`, when `https://<tunnel>/v1/models` stays unreachable for about 60 seconds, immediately after a Mac sleep/wake timer gap, when active network addresses change, or when a usable network returns after an offline interval. HTTP 401 with the body `API key required for remote API access` counts as reachable. If `NINE_ROUTER_API_KEY` is set, or `~/.odds-9router/api-key` exists, that key is sent on the health check.

Broods is updated only after the new public URL passes the models check. URL updates are serialized so a slow deployment for an old quick tunnel cannot overwrite a newer one. Failed Broods environment updates or deploys retry every 30 seconds while that URL remains current. If no new URL becomes healthy, Broods keeps the previous URL; new application runs still surface `Broods' model is unreachable` through the drive start/status checks instead of remaining on Filling.

## Install

Paths below match the machine that runs 9router. Adjust `DIR` inside `run-tunnel.ts` if yours differ.

```bash
mkdir -p ~/Library/LaunchAgents
cat > ~/Library/LaunchAgents/com.odds.tunnel.plist <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.odds.tunnel</string>
  <key>ProgramArguments</key>
  <array>
    <string>/Users/kien/.bun/bin/bun</string>
    <string>/Users/kien/Documents/Files/odds-beebalst/scripts/launchd/run-tunnel.ts</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/Users/kien/Library/Logs/odds-tunnel.log</string>
  <key>StandardErrorPath</key><string>/Users/kien/Library/Logs/odds-tunnel.log</string>
</dict>
</plist>
EOF
```

Reload:

```bash
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.odds.tunnel.plist 2>/dev/null || true
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.odds.tunnel.plist
launchctl kickstart -k gui/$(id -u)/com.odds.tunnel
```

On older macOS, `launchctl unload` then `launchctl load ~/Library/LaunchAgents/com.odds.tunnel.plist` does the same reload.

## Named tunnel (not built)

A quick tunnel's hostname changes every start, which is why this script rewrites `NINE_ROUTER_BASE_URL`. A named tunnel keeps one hostname:

1. `cloudflared tunnel login`
2. `cloudflared tunnel create odds-9router`
3. A `config.yml` with `tunnel: odds-9router`, `credentials-file`, and an ingress hostname (for example `router.example.com`) to `http://127.0.0.1:20129`.
4. A DNS CNAME from that hostname to `<tunnel-id>.cfargotunnel.com`.
5. Run `cloudflared tunnel --config config.yml run` instead of `tunnel --url`. Set `NINE_ROUTER_BASE_URL` once to `https://router.example.com/v1` and deploy Broods. No trycloudflare URL rotation.
