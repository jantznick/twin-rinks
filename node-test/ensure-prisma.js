"use strict";

/**
 * Must run before any `require("@prisma/client")`. Generates the client into
 * ./node_modules/.prisma — fixes "did not initialize yet" when postinstall was
 * skipped or node_modules was copied without running generate.
 *
 * Loads .env from this directory (not process.cwd()) so DATABASE_URL works when
 * you start the API from another folder.
 */
const path = require("path");
const { execSync } = require("child_process");

const root = __dirname;

require("dotenv").config({ path: path.join(root, ".env") });

if (process.env.SKIP_PRISMA_GENERATE !== "1") {
  try {
    execSync("npx prisma generate", {
      cwd: root,
      stdio: "inherit",
      env: process.env,
      shell: true
    });
  } catch {
    console.error(
      "\n[prisma] Generate failed. From the node-test directory run:\n  npm install\n  npx prisma generate\n"
    );
    process.exit(1);
  }
}
