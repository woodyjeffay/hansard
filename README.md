# Parliamentary Word Watch

Chart who in Parliament is saying a word or phrase, month by month and by party, and map which MPs’ constituencies said it.

## Try it

Try it [here](https://parliamentary-word-watch.onrender.com/).

## Run it

You need [Node.js](https://nodejs.org) 18 or later. In this folder:

```
npm start
```

Then open http://localhost:3000.

## Deploy it to Vercel

The project runs on Vercel as it is, with no build step. Import the repository in Vercel (or run `vercel` in this folder) and leave the framework preset as **Other**. Vercel serves the page’s files directly and runs the three files in `api/` as functions. `vercel.json` gives them up to 60 seconds, since Hansard can take a while on common words.

## Share and download

- After a search, **Share this search** copies a link (or opens your phone’s share sheet). The link holds the phrase, dates and House, so whoever opens it sees the same search. The address bar updates with every search too, so you can bookmark it.
- **Download spreadsheet (.xlsx)** saves one row per speech: title, name, constituency, date, debate, quote, and the committees the speaker sat on that day. The title is the role they spoke in (such as “The Deputy Prime Minister”), or any post they held that day, or else MP or Member of the House of Lords.

## How it works

A search finds every speech in Hansard containing the words, keeps those where they appear together, and looks up each speaker’s party and seat on the day they spoke. It then charts the speeches by month and maps them by constituency.

| File | What it does |
| --- | --- |
| `index.html`, `style.css`, `script.js` | The page |
| `xlsx.js` | Builds the spreadsheet download in the browser |
| `lib/parliament.mjs` | Passes the page’s requests on to Parliament, which browsers can’t call directly |
| `server.mjs` | Runs the site on your own computer |
| `api/`, `vercel.json` | Run the site on Vercel |
| `maps/` | Hex maps of the constituencies used from 2010 to 2024, and since 2024 |

## Limits

- A search returns at most 2,000 speeches.
- The map starts at the May 2010 election.
- The spreadsheet’s Committees / APPGs column lists committees only: Parliament doesn’t publish APPG membership in a form the site can look up.

## Data

Speeches from [Hansard](https://hansard.parliament.uk); parties and seats from the [UK Parliament Members API](https://members-api.parliament.uk). Contains Parliamentary information licensed under the [Open Parliament Licence v3.0](https://www.parliament.uk/site-information/copyright-parliament/open-parliament-licence/). Hex maps from [Open Innovations](https://open-innovations.org/projects/hexmaps/).

Made with the assistance of [Claude Code](https://claude.com/claude-code).
