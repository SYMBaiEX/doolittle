#!/usr/bin/env nub
import "./entrypoint/host-execution";
import { startAcpServer } from "./entrypoint/acp-server";

await startAcpServer();
