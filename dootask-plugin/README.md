# MCP Remote Server (Cloud Edition)

Expose your workspace as a **remote HTTP service** to Claude and Model Context Protocol (MCP) clients. After installation, authorized members can instantly obtain their personal Token and server address from the plugin page without manually running local processes.

## What Can This Plugin Do?

- ✅ 25 tools consistent with the desktop MCP server (complete capabilities for users / projects / tasks / messages / files / work reports)
- 🌐 Centrally deployed on the plugin platform, accessible remotely by multiple members simultaneously
- 🔐 Uses personal Token authentication, permissions remain consistent with account
- ⚡️ One-click copy of configuration for Claude Desktop, fastmcp CLI, and other common clients

## Differences from "Desktop MCP Server"

- Deployment location: Desktop version runs on personal computers, this plugin resides in platform containers and is accessible via HTTPS remotely.
- Use case: Desktop version is suitable for quick personal debugging, this plugin is ideal for team or cross-environment collaboration, accessible anytime, anywhere.
- Network requirements: Desktop version is limited to `http://localhost`, this plugin automatically generates public addresses at `/apps/mcp_server/...`.
- Token management: Desktop version requires manual copying and saving, this plugin provides real-time Token retrieval on the guide page, available on-demand and can be re-copied after expiration.

If you only need to temporarily try MCP on your personal computer, the desktop version is sufficient; when you need to **share with a team or collaborate with Claude in the cloud/mobile**, choose this plugin.

## How to Use?

After installation, you can see "MCP Guide" in the application center.

## FAQ

- **Does this service need to expose external ports?** No. The plugin container is hosted by the platform and automatically provides `/apps/mcp_server/mcp` and `/apps/mcp_server/sse` via HTTPS.
- **Will the Token be shared with others?** No. The page only reads the Token in the current login session. Please keep it safe after copying.
- **Can it be used on mobile or browser?** As long as Claude/MCP-compatible clients can access the address provided by the plugin, they can connect to your workspace.
