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

## TURN

STUN only by default, you can add a TURN server via configuration.
