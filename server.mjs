// A small web server for Parliamentary Word Watch. It does two jobs:
//
// 1. Sends the page to your browser: index.html, style.css, script.js and
//    the two constituency hex maps in maps/.
// 2. Passes the page's questions on to Parliament and hands back the answers.
//    Browsers aren't allowed to ask Parliament's servers directly; Node is.
//      /api/speeches     -> Hansard's search (every speech containing a phrase)
//      /api/member?id=   -> the Members API (a member's parties, seats, posts and committees)
//      /api/link?id=     -> Hansard's web address for one speech
//
// The /api answers live in lib/parliament.mjs, shared with the api/ folder
// that Vercel uses when the site is deployed there.
//
// Run it with:   node server.mjs   (or npm start)
// Then open:     http://localhost:3000

import http from "node:http";
import fs from "node:fs";
import { speeches, member, link } from "./lib/parliament.mjs";

// The files the page is allowed to ask for, and what kind of file each is.
// Anything not listed gets "Not found", so nobody can read other files.
const FILES = {
  "/":                                 ["index.html", "text/html; charset=utf-8"],
  "/style.css":                        ["style.css", "text/css; charset=utf-8"],
  "/script.js":                        ["script.js", "text/javascript; charset=utf-8"],
  "/xlsx.js":                          ["xlsx.js", "text/javascript; charset=utf-8"],
  "/maps/constituencies-2024.hexjson": ["maps/constituencies-2024.hexjson", "application/json; charset=utf-8"],
  "/maps/constituencies-2010.hexjson": ["maps/constituencies-2010.hexjson", "application/json; charset=utf-8"],
};

// Files sit next to this script, so find them from here. That way the
// server works whichever folder you start it from.
const here = (name) => new URL(name, import.meta.url);

async function handle(request, response) {
  const address = new URL(request.url, "http://localhost");
  const path = address.pathname;

  if (path in FILES) {
    // Read the file before starting the reply, so a missing file becomes a
    // proper error rather than a half-sent success.
    const [name, type] = FILES[path];
    const contents = fs.readFileSync(here(name));
    response.writeHead(200, { "Content-Type": type });
    response.end(contents);
  } else if (path === "/api/speeches") {
    await speeches(request, response);
  } else if (path === "/api/member") {
    await member(request, response);
  } else if (path === "/api/link") {
    await link(request, response);
  } else {
    response.writeHead(404);
    response.end("Not found");
  }
}

const server = http.createServer(async (request, response) => {
  // If anything goes wrong with one request, report it and carry on,
  // rather than letting the error shut the whole server down.
  try {
    await handle(request, response);
  } catch (error) {
    console.error("Error on " + request.url + ": " + error.message);
    if (!response.headersSent) {
      response.writeHead(500, { "Content-Type": "application/json" });
    }
    response.end(JSON.stringify({ error: error.message }));
  }
});

// A hosting service sets PORT itself; on your own computer it's 3000.
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Running at http://localhost:" + PORT);
});
