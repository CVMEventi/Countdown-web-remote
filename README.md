# Countdown Web Remote

A browser remote for [Countdown](https://github.com/CVMEventi/Countdown) that connects **directly
to the desktop app over WebRTC** — NAT hole-punched, peer to peer. No port forwarding, and the
timer data never passes through a server.

Deploy the contents of `dist/` anywhere on your site.

## How a connection is made

1. The desktop app registers with a signaling server under a peer id derived from its **session id**.
2. You open this page and enter a pairing code: `SESSION.KEY`.
3. The page connects to that peer id and presents the key in a `hello` frame.
4. The desktop app answers `welcome` + `snapshot`, and everything after that flows over the
   DataChannel.

## Development

```bash
yarn install
yarn dev        # dev server
yarn build      # production build into dist/
yarn vitest run # tests
yarn typecheck  # vue-tsc --noEmit
```

## Deployment (GitHub Pages)

`.github/workflows/deploy.yml` typechecks, tests, builds and publishes on every push to `main`,
and can be run by hand from the Actions tab.

One-time setup:

1. Push this repo to GitHub with `main` as the default branch (the workflow triggers on `main`).
2. **Settings → Pages → Source → GitHub Actions.** Without this the workflow succeeds but nothing
   is served.
3. Push, or run the workflow manually. The deployed URL appears on the `deploy` job.
4. Put that URL into the desktop app under **Settings → Remote → Web Remote → Remote page
   address**, so its QR codes point here.

### Why this deploys cleanly

- **`base: './'`** — every asset reference in `dist/index.html` is relative, so the same build
  works at `user.github.io/countdown-web-remote/`, at a custom domain, or under any other subpath.
  Nothing has to know the repo name at build time.
- **Hash routing** — `createWebHashHistory()` keeps every route inside the fragment, so Pages
  never sees `/d/...` and there is no need for a `404.html` SPA fallback.
- **HTTPS by default** — browsers only allow WebRTC in a secure context, and Pages is always
  HTTPS.

### The signaling server must be HTTPS too

An HTTPS page cannot open an insecure WebSocket. If the desktop app is pointed at a plain `http`
PeerServer, the browser blocks it as mixed content and the connection fails with nothing obviously
wrong in the UI. Serve PeerServer over TLS and set **Use TLS** in the app's Advanced settings.

### Notes

- The workflow deliberately does not cache dependencies. The install is a few seconds and a cache
  keyed wrongly across Yarn versions costs more debugging than it saves.
- Yarn 4 is pinned via `packageManager`, and CI runs `corepack enable` **after** `setup-node` so
  the pinned version is the one used.
- `index.html` carries `<meta name="robots" content="noindex">` — a remote control page has no
  business in search results.

## TURN

STUN only by default, which fails on roughly 10% of real-world networks (symmetric NAT, some
corporate and hotel WiFi). `RtcSession` takes an `iceServers` option shaped exactly like the DOM
`RTCIceServer`, so adding a TURN server is configuration, not code.
