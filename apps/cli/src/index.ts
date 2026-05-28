#!/usr/bin/env bun
import { Command } from "commander";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_PORT = 8080;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getUiOutputPath(): string {
  return path.resolve(__dirname, "../../ui/out");
}

async function serveUi(port: number): Promise<void> {
  const uiPath = getUiOutputPath();

  if (!existsSync(uiPath)) {
    console.error("UI build not found. Run `bun run build:ui` before starting the dashboard.");
    process.exit(1);
  }

  const { default: express } = await import("express");
  const app = express();

  app.use(express.static(uiPath));
  app.get("/{*path}", (_request, response) => {
    response.sendFile(path.join(uiPath, "index.html"));
  });

  app.listen(port, () => {
    console.log(`TLX dashboard is running at http://localhost:${port}`);
  });
}

const program = new Command();

program
  .name("tlx")
  .description("TLX command line interface")
  .version("1.0.0");

program
  .command("ui:start")
  .description("Serve the exported Next.js dashboard with Express")
  .option("-p, --port <port>", "Port to bind the dashboard server", String(DEFAULT_PORT))
  .action(async (options: { port: string }) => {
    const port = Number.parseInt(options.port, 10);

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      console.error("Port must be a number between 1 and 65535.");
      process.exit(1);
    }

    await serveUi(port);
  });

program.parse(process.argv);
