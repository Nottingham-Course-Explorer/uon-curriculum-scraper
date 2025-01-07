# UoN Curriculum Scraper

Downloads module information.

## Usage

```
npm install
touch modules.db
sqlite3 modules.db ".read migrations/up.sql"
npm run scrape
```

## Debugging

Logs are placed in `.log`.
