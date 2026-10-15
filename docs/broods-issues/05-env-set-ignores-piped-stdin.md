# `broods env set NAME` ignores piped stdin (help says it reads it) and stores nothing

## Repro
```sh
echo "$VALUE" | bunx broods env set ODDS_DRIVE_SECRET
bunx broods env set ODDS_DRIVE_SECRET < secret.txt
cat secret.txt | bun node_modules/.bin/broods env set ODDS_DRIVE_SECRET
```
Each prints the prompt `ODDS_DRIVE_SECRET:` and exits; `broods env list` does not show the variable. No error, exit looks normal.

`broods env --help` says: *"`set` reads a piped value, so a secret can come from another tool: echo "$VALUE" | broods env set SOME_NAME"*.

## Works only with a pseudo-TTY
```sh
(sleep 4; cat secret.txt; printf '\r') | script -q /dev/null bun node_modules/.bin/broods env set ODDS_DRIVE_SECRET
```

## Expected
Read stdin when it is not a TTY (as documented); if nothing was stored, exit non-zero with a message. This blocks scripted/agent setup of secrets.

_Environment:_ broods CLI v0.50.0 via bunx / bun 1.x on macOS.
