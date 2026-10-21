import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "../src/mcp/server";

async function main() {
  const server = createMcpServer();
  await server.connect(new StdioServerTransport());
}
main().catch((error) => {
  console.error(
    "InstaPlanner MCP:",
    error instanceof Error ? error.message : "Błąd uruchomienia.",
  );
  process.exitCode = 1;
});
