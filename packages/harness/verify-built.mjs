#!/usr/bin/env node
// Read-only entry point for sandboxed patch workspaces. The parent builds before starting Codex.
import { main } from './dist/cli.js';
process.exitCode = await main(process.argv.slice(2));
