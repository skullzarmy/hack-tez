# hack.tez — Free Tezos Subdomains

Claim your free subdomain on **hack.tez**. Connect your Tezos wallet and get `yourname.hack.tez` in seconds.

## Features

- **Free registration** — no tez charged, you only pay gas (~0.01 ꜩ)
- **Wallet-gated** — requires a revealed Tezos account at least 4 hours old
- **Self-sovereign** — you own your subdomain record and can update it directly
- **HTTP redirects** — optionally point `yourname.hack.tez.page` to any URL
- **Open source** — built with React, Taquito, and SmartPy on Netlify

## Stack

- **Frontend**: Vite + React + TypeScript + Tailwind CSS
- **Wallet**: `@taquito/taquito` + `@tezos-x/octez.connect-sdk`
- **Backend**: Netlify Functions (permit issuance, redirect storage)
- **Storage**: Netlify Blobs (redirects) + on-chain (Tezos Domains)
- **Contract**: SmartPy (HackTezRegistrar — permit-gated subdomain registrar)

## Development

```bash
npm install
npm run dev
```

## Architecture

See [PLAN.md](./PLAN.md) for full architecture, contract design, and workplan.

## License

Unlicensed. No rights reserved. Take it.

Free subdomain service for hack.tez — claim yourname.hack.tez with any Tezos wallet
