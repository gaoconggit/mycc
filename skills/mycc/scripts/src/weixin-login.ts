#!/usr/bin/env node
import { WeixinChannel } from "./channels/weixin.js";

async function main() {
  const ch = new WeixinChannel({ stateDir: ".." });
  const ok = await ch.login();
  process.exit(ok ? 0 : 1);
}

main();
