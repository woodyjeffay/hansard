# Parliamentary Word Watch

Chart who in Parliament is saying a word or phrase, month by month and by party, and map which MPs’ constituencies said it.

## Run it

You need [Node.js](https://nodejs.org) 18 or later. In this folder:

```
npm start
```

Then open http://localhost:3000.

## How it works

A search finds every speech in Hansard containing the words, keeps those where they appear together, and looks up each speaker’s party and seat on the day they spoke. It then charts the speeches by month and maps them by constituency.

| File | What it does |
| --- | --- |
| `index.html`, `style.css`, `script.js` | The page |
| `server.mjs` | Serves the page and passes its requests on to Parliament, which browsers can’t call directly |
| `maps/` | Hex maps of the constituencies used from 2010 to 2024, and since 2024 |

## Limits

- A search returns at most 2,000 speeches.
- The map starts at the May 2010 election.

## Data

Speeches from [Hansard](https://hansard.parliament.uk); parties and seats from the [UK Parliament Members API](https://members-api.parliament.uk). Contains Parliamentary information licensed under the [Open Parliament Licence v3.0](https://www.parliament.uk/site-information/copyright-parliament/open-parliament-licence/). Hex maps from [Open Innovations](https://open-innovations.org/projects/hexmaps/).

Made with the assistance of [Claude Code](https://claude.com/claude-code).
