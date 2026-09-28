import requestword = input("Word or phrase: ")
start = "2024-01-01"
end = "2026-01-01"


var word = "nuclear";
var start = "2024-01-01"
var end = "2026-01-01"

var url = "https://hansard-api.parliament.uk/search/contributions/Spoken.json"

# Terminal colour codes. Anything not listed counts as Other.
COLOURS = {
    "Con":    "\033[34m",   # blue
    "Lab":    "\033[31m",   # red
    "LD":     "\033[33m",   # yellow
    "SNP":    "\033[93m",   # bright yellow
    "Reform": "\033[36m",   # cyan
    "Green":  "\033[32m",   # green
    "CB":     "\033[35m",   # magenta: crossbench peers
    "Other":  "\033[90m",   # grey
}
RESET = "\033[0m"

# --- 1. Fetch every speech, 100 at a time ---------------------------------

speeches = []
skip = 0

while True:
    settings = {
        "queryParameters.searchTerm": word,
        "queryParameters.startDate": start,
        "queryParameters.endDate": end,
        "queryParameters.take": 100,
        "queryParameters.skip": skip,
    }
    data = requests.get(url, params=settings).json()
    page = data["Results"]
    speeches = speeches + page
    skip = skip + 100
    print("Fetched", len(speeches), "of", data["TotalResultCount"])
    if len(page) == 0 or skip >= data["TotalResultCount"] or skip >= 2000:
        break

# --- 2. Work out a speaker's party -----------------------------------------

def get_party(name):
    if "(" not in name:
        return "Other"
    party = name.split("(")[-1].replace(")", "")
    if party == "Lab/Co-op":
        party = "Lab"
    if party in COLOURS:
        return party
    return "Other"

# --- 3. Count speeches per month per party ----------------------------------

counts = {}

for speech in speeches:
    month = speech["SittingDate"][:7]
    party = get_party(speech["AttributedTo"])
    if month not in counts:
        counts[month] = {}
    if party not in counts[month]:
        counts[month][party] = 0
    counts[month][party] = counts[month][party] + 1

# --- 4. Draw it -------------------------------------------------------------

print()
for party in COLOURS:
    print(COLOURS[party] + "█ " + party + RESET, end="   ")
print("\n")

for month in sorted(counts):
    line = month + " "
    total = 0
    for party in COLOURS:
        n = counts[month].get(party, 0)
        line = line + COLOURS[party] + "█" * n + RESET
        total = total + n
    print(line, total)