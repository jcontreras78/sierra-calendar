# Sierra Calendar

Airbnb-style React availability calendar with:

- Booked nights pulled from Airbnb iCal feed
- Manual color-coded custom events
- Month navigation and local persistence for custom events

## Run

```bash
npm install
npm run dev
```

## iCal source

Set your full Airbnb private iCal URL in `.env`:

```bash
cp .env.example .env
# then set VITE_AIRBNB_ICAL_URL to the full export link from Airbnb
```

The app uses a local Vite proxy endpoint to avoid browser CORS issues.
For Cloudflare Pages production, a Pages Function is included at
`functions/api/airbnb-ical/[[path]].js` so `/api/airbnb-ical/...` works after deploy.

## Important

Airbnb iCal updates are not instant and often lag behind real-time booking updates.
