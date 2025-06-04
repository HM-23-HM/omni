## About

Omni is a web service that aggregates news reports and emails you concise summaries daily so that you can stay informed while saving time.

## Sample email

![Image](https://github.com/user-attachments/assets/b88a7402-6fbd-458d-8eab-24ced5f43ec9)

## Tech stack

- Node.js
- TypeScript
- Google Gemini API

## Architectural decisions

- I chose a monolithic architecture to keep this project easy to deploy, debug and maintain. I'm only one person after all :).

- I used a layered file structure to separate the files based on technical concerns. Here's an overview:

```
src/
├── services/
│   ├── aiService.ts
│   ├── browserService.ts
│   ├── emailService.ts
│   └── logger.ts
├── utils/
│   ├── cleanup.ts
│   ├── constants.ts
│   ├── holidays.ts
│   ├── parsing.ts
│   └── types.ts
├── templates/
├── prompts/
├── scraping.ts
└── summarizing.ts
```
