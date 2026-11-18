// The three questions the page asks Parliament, shared by server.mjs (on
// your own computer) and the files in api/ (on Vercel). Each one checks the
// request, asks Parliament, and hands the answer straight back.
//
// They only use plain Node features (res.statusCode, res.setHeader, res.end)
// so they work the same under node:http and under Vercel.

const HANSARD = "https://hansard-api.parliament.uk/search/contributions/Spoken.json";
const MEMBERS = "https://members-api.parliament.uk/api/Members/";
const LINKS = "https://hansard-api.parliament.uk/search/parlisearchredirect.json?externalId=";

function send(res, status, body, cacheSeconds = 0) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (cacheSeconds > 0 && status === 200) {
    // Lets Vercel's CDN (and the browser) reuse answers that rarely change
    res.setHeader("Cache-Control", `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds}`);
  }
  res.end(body);
}

// Ask Parliament for something and hand its answer straight back
async function passOn(targetUrl, res, cacheSeconds) {
  try {
    const reply = await fetch(targetUrl);
    send(res, reply.status, await reply.text(), cacheSeconds);
  } catch (error) {
    send(res, 502, JSON.stringify({ error: error.message }));
  }
}

function refuse(res, message) {
  send(res, 400, JSON.stringify({ error: message }));
}

// The search part of a request's address ("?a=1&b=2"), whichever server it came through
function query(req) {
  return new URL(req.url, "http://localhost");
}

// /api/speeches -> Hansard's search (every speech containing a phrase)
export async function speeches(req, res) {
  await passOn(HANSARD + query(req).search, res, 600);
}

// /api/member?id= -> the Members API (a member's parties, seats, posts and committees, with dates)
export async function member(req, res) {
  // Only pass on whole numbers, never anything else someone types into the URL
  const id = Number(query(req).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return refuse(res, "id must be a number");
  await passOn(MEMBERS + id + "/Biography", res, 86400);
}

// /api/link?id= -> Hansard's web address for one speech
export async function link(req, res) {
  // Speech IDs look like 221F53ED-C9FB-4FC7-A871-09567FF9EC62; refuse anything else
  const id = query(req).searchParams.get("id") ?? "";
  if (!/^[0-9A-Fa-f-]{36}$/.test(id)) return refuse(res, "not a speech id");
  await passOn(LINKS + id, res, 86400);
}
