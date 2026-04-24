# CSMP App Backend

Independent Cloudflare Worker backend for the CSMP application system.

## What it does

- Accepts application submissions at `POST /apply`
- Validates the payload against this repo's local `form.json`
- Sends applications and saves to Discord webhooks
- Supports CORS for an optional allowed frontend origin

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Add local environment variables:

   ```bash
   cp .dev.vars.example .dev.vars
   ```

3. Fill in `.dev.vars`:

   ```env
   ALLOWED_ORIGIN=http://localhost:6777
   ```

## Run locally

```bash
npm run dev
```

## Deploy

The Discord webhook routing is stored in the Worker source. If you want to lock the API to one site origin, set `ALLOWED_ORIGIN` as a plain environment variable in Cloudflare.

Then deploy:

```bash
npm run deploy
```

## API

### `GET /`
Returns basic service metadata.

### `GET /health`
Returns a health response.

### `POST /apply`

Request body:

```json
{
  "role": "admin",
  "responses": {
    "name": "Example User",
    "discord": "@example"
  },
  "declarations": {
    "I confirm that everything I wrote in this application is true and accurate.": true
  },
  "submittedAt": "2026-04-20T18:20:00.000Z",
  "source": "http://localhost:5173"
}
```
