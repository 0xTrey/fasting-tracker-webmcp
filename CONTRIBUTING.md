# Contributing

Issues and focused pull requests are welcome.

Before opening a pull request:

```bash
npm install
npm run check
npm test
npm run build
```

Keep the WebMCP manifest explicit. New capabilities must have a narrow purpose, a clear read or mutation boundary, and tests that prove destructive or administrative access did not drift into the browser toolset.

Use synthetic records in tests, documentation, screenshots, and videos. Never commit credentials, cookies, real fasting history, or private screenshots.
