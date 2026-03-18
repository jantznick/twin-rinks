"use strict";

const fs = require("fs");
const path = require("path");
const { parseSubsHtml } = require("./subs-parser");

function main() {
  const fileArg = process.argv[2];
  const targetPath = fileArg
    ? path.resolve(process.cwd(), fileArg)
    : path.resolve(__dirname, "../subs_page.html");

  const html = fs.readFileSync(targetPath, "utf8");
  const parsed = parseSubsHtml(html);

  console.log(`Parsed ${parsed.gameCount} games from: ${targetPath}`);
  console.log(JSON.stringify(parsed, null, 2));
}

main();
