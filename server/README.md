# DooTask MCP Server (Node.js)

This directory hosts the standalone MCP server that proxies DooTask APIs via a token authenticated against the official `dootask-tools` contracts.

## Scripts

- `npm run dev` – start the server with live reload using `ts-node-dev`.
- `npm run build` – transpile TypeScript sources into `dist/`.
- `npm start` – launch the compiled server.

## Environment Variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `API_BASE_URL` | `http://nginx` | Root URL of the DooTask deployment (can stay default inside DooTask environment). |
| `MCP_PORT` | `7000` | Port exposed by the MCP HTTP stream server. |
| `HEALTH_PORT` | `7001` | Port serving the usage guide (`/`) and health endpoint (`/healthz`). |
| `LOG_LEVEL` | `info` | Pino log level (`debug`, `info`, `warn`, `error`). |
| `REQUEST_TIMEOUT` | `30000` | HTTP timeout (ms) when contacting DooTask APIs. |

Create a `.env` file (see `.env.example`) or supply the variables through your container orchestrator.

## Testing the Server

```bash
npm install
npm run build --prefix ../guide
npm run build
API_BASE_URL=https://dootask.example.com \
node dist/index.js
```

Then configure your MCP client with `http://localhost:7000/mcp` and supply the header
`Authorization: Bearer <DooTaskToken>` on every request. The onboarding page is served from
`http://localhost:7001/` after the guide build completes.
