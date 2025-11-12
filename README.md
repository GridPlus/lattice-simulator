# Lattice1 Device Simulator

Software model of the GridPlus Lattice1 hardware wallet. It exposes the exact
protocol surfaces the device firmware does, while providing a browser UI for
pairing, wallet management, KV records, and request approval.

## Highlights
- Full Lattice1 protocol stack: connect, pairing, wallets, KV, signing.
- Segregated architecture (`src/server`, `src/client`, `src/shared`) with a
  custom Node/Next server that mirrors the hardware boundary lines.
- Client state lives in Zustand + `localStorage`; the simulator falls back to
  server memory when no browser client is connected.
- Real WebSocket bridge keeps the server simulator and browser UI in sync and
  forwards SDK protocol requests that need user data.

See `docs/ARCHITECTURE.md` for a deeper component overview.

## Key Features
- **Multi-chain wallets** for Ethereum, Bitcoin, and Solana with BIP44 path
  derivation and configurable firmware support.
- **Secure pairing workflow** that mirrors the physical device, including
  connection, pairing codes, and approval flows.
- **Transaction + message signing** with simulated user approvals and data
  normalization identical to the hardware wallet firmware.
- **Address tags / KV records** stored client-side and synchronized to the
  server on demand for SDK requests.
- **Browser UI** (Next.js + Zustand) that exposes connection state, wallet
  management, pending sign requests, and KV records.
- **Testing hooks** via Vitest suites and utility endpoints (e.g.,
  `app/api/test-kv-request`) to exercise protocol edges.

## Requirements

- Node.js ≥ 18
- `pnpm` (preferred) or `npm`

## Install & Run

```bash
git clone https://github.com/GridPlus/gridplus.git
cd gridplus/lattice-simulator
pnpm install

# development
pnpm dev

# production
pnpm build
pnpm start
```

`pnpm dev` starts the Next.js UI and custom protocol server on
`http://127.0.0.1:3000`. The same process also opens a dedicated WebSocket
server on `ws://127.0.0.1:3443`.

## Simulator Communication

### 1. Protocol HTTP Endpoint
- **Route**: `POST /:deviceId`
- **Handler**: `app/[deviceId]/route.ts`
- **Payload**: JSON body containing the raw Lattice1 frame (hex string or
  `{ data: { type: "Buffer", data: number[] } }`).
- **Response**: JSON with a `message` field holding the encoded Lattice1
  response frame.

This POST route is the sole HTTP entry point for the simulator protocol and
handles every Lattice1 command (connect, secure requests, etc.).

### 2. WebSocket Bridge
- **Route**: `ws://<host>:<port+443>/ws/device/<deviceId>`
- **Server implementation**: `server.ts` + `src/server/serverWebSocketManager.ts`
- **Client hook**: `src/client/hooks/useClientWebSocketHandler.ts`

SDK protocol handlers that need user-managed state (KV records, address
derivation, signing requests) call into `RequestManager`
(`src/server/serverRequestManager.ts`). The manager forwards the request over
WebSocket, the browser responds via the same connection, and the server resumes
the protocol flow. When no client is connected (or in CI), the simulator falls
back to its in-memory state.

For more detail on this flow, read `docs/SERVER_CLIENT_COMMUNICATION.md`.

## Development & Testing

```bash
pnpm lint          # ESLint (fix mode)
pnpm lint:check
pnpm format        # Prettier write
pnpm format:check
pnpm type-check    # tsc --noEmit
pnpm test          # Vitest
pnpm test:coverage
```

Husky + lint-staged run formatting, lint, and (when needed) type checking on
commit. `docs/DEVELOPMENT.md` lists the project conventions.

## Troubleshooting
- Make sure the browser UI is open so the WebSocket bridge is connected;
  otherwise KV and wallet address requests fall back to simulator data.
- If you change the base HTTP port, update the client hook or set
  `PORT=<n>`—the WebSocket server always binds to `PORT + 443`.
- Use the debug logs emitted by `server.ts`, `serverRequestManager`, and
  `serverProtocolHandler` to trace protocol frames end-to-end.

## Contributing
1. Fork the repo and create a feature branch.
2. Add tests for behavioral changes.
3. Run the lint, format, and test scripts above.
4. Submit a PR.

Issues and enhancements are tracked on GitHub. For architecture discussions,
reference the docs in `docs/` to keep terminology aligned.
