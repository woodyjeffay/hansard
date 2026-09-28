// A tiny web server. Its jobs:
// 1. Sends parties.html to your browser at http://localhost:3000, and the
//    constituency hex maps when the page asks for them: map.hexjson.json
//    (seats since 2024) and map-2010.hexjson.json (seats from 2010 to 2024)
// 2. Passes /api/speeches requests on to Parliament and hands back the answer.
// 3. Passes /api/member?id=4520 on to Parliament's Members API, which knows
//    every member's party history.
// 4. Passes /api/link?id=... on to Hansard, which replies with the web
//    address of that speech.
//    (Browsers aren't allowed to ask Parliament directly. Node is.)
//
// Run it with:   node server.mjs

import http from "node:http";
import fs from "node:fs";

const HANSARD = "https://hansard-api.parliament.uk/search/contributions/Spoken.json";
const MEMBERS = "https://members-api.parliament.uk/api/Members/";
const LINKS = "https://hansard-api.parliament.uk/search/parlisearchredirect.json?externalId=";

// Ask another server for something and hand its answer straight back.
async function passOn(targetUrl, response) {
  try {
    const reply = await fetch(targetUrl);
    response.writeHead(reply.status, { "Content-Type": "application/json" });
    response.end(await reply.text());
  } catch (error) {
    response.writeHead(502, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: error.message }));
  }
}

// Files sit next to this script, so find them from here. That way the
// server works whichever folder you start it from.
const here = (name) => new URL(name, import.meta.url);

async function handle(request, response) {
  const address = new URL(request.url, "http://localhost");

  // Read each file before starting the reply, so a missing file becomes a
  // proper error rather than a half-sent success.
  if (address.pathname === "/") {
    const page = fs.readFileSync(here("parties.html"));
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(page);
  } else if (address.pathname === "/map.hexjson.json" || address.pathname === "/map-2010.hexjson.json") {
    // The hex maps of the 650 constituencies
    const map = fs.readFileSync(here(address.pathname.slice(1)));
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(map);
  } else if (address.pathname === "/api/speeches") {
    await passOn(HANSARD + address.search, response);
  } else if (address.pathname === "/api/member") {
    const id = Number(address.searchParams.get("id"));
    if (!Number.isInteger(id)) {
      // Only pass on whole numbers, never anything else someone types into the URL
      response.writeHead(400, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "id must be a number" }));
      return;
    }
    await passOn(MEMBERS + id + "/Biography", response);
  } else if (address.pathname === "/api/link") {
    // Ask Hansard for the web address of one speech, by its ID
    const id = address.searchParams.get("id") ?? "";
    if (!/^[0-9A-Fa-f-]{36}$/.test(id)) {
      // Speech IDs look like 221F53ED-C9FB-4FC7-A871-09567FF9EC62; refuse anything else
      response.writeHead(400, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "not a speech id" }));
      return;
    }
    await passOn(LINKS + id, response);
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
   const PORT = process.env.PORT || 3000;
   server.listen(PORT, () => {
     console.log("Running on port " + PORT);
   });
