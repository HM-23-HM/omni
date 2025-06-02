## About

Omni is a web service that aggregates news reports and emails you concise summaries daily so that you can stay informed while saving time.

## Sample email

[Insert screenshot here]

## Tech stack

- Node.js
- TypeScript
- Google Gemini API

## Architectural decisions

- I chose a monolithic architecture to keep this project easy to deploy, debug and maintain. I'm only one person after all :).

- I used a layered folder structure to separate the files based on technical concerns. Here's an overview of how the folders and files are structured:

scripts/               # Post-deployment scripts
src/
├── config/            # API keys, sources
├── emailer/           # Email sending
├── scheduler/         # Cron jobs
├── scraper/           # News aggregation
├── summarizer/        # Gemini API calls
├── templates/         # Email templates
├── utils/             # Shared utilities
└── index.ts           # Orchestrates everything

