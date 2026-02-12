#!/usr/bin/env bun
import { Command } from "commander";
import { commands as accountsCommands } from "./commands/accounts";
import { commands as authCommands } from "./commands/auth";
import { commands as scrapeCommands } from "./commands/scrape";
import { commands as runsCommands } from "./commands/runs";
import { commands as queueCommands } from "./commands/queue";
import { commands as dbCommands } from "./commands/db";

const program = new Command();

program.name("socmed-engagement").description("Multi-account engagement copilot for X/Threads").version("0.1.0");

accountsCommands(program);
authCommands(program);
scrapeCommands(program);
runsCommands(program);
queueCommands(program);
dbCommands(program);

program.parse();
