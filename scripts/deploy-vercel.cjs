#!/usr/bin/env node
/** Ejecuta vercel --prod con VERCEL_ORG_ID y VERCEL_PROJECT_ID para que el deploy funcione sin prompt. */
process.env.VERCEL_ORG_ID = "team_ZrFs7KNf947ZEMU0YbE1Ri05";
process.env.VERCEL_PROJECT_ID = "prj_mzDDYrMiQPXnQcHlWVpGUXoIfQ77";
const { execSync } = require("child_process");
execSync("npx vercel --prod", { stdio: "inherit", cwd: require("path").resolve(__dirname, "..") });
