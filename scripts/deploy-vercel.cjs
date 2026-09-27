#!/usr/bin/env node
/**
 * hashrate.space = Vercel project `sgi` (settings Root Directory = client/).
 * Run from the repo root so Vercel does not look for client/client.
 * Do not target `sgi-client` (legacy Hobby); that is not production.
 */
const path = require("path");
const { execSync } = require("child_process");

process.env.VERCEL_ORG_ID = "team_ZrFs7KNf947ZEMU0YbE1Ri05";
process.env.VERCEL_PROJECT_ID = "prj_kjqLA3yUL27AlCiGOACNhjqNekgN";

const root = path.resolve(__dirname, "..");
execSync("npx vercel --prod --yes", { stdio: "inherit", cwd: root });
