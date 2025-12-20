# Deploying to Vercel

Steps to deploy this Vite app to Vercel and configure the `VITE_VAPI_API_KEY` environment variable.

1) Create a Vercel project
- Option A (recommended): Push your repo to GitHub/GitLab/Bitbucket and import the repo in the Vercel dashboard.
- Option B (CLI): Install the Vercel CLI and run `vercel` from the project root.

2) Project settings
- Build Command: `npm run build`
- Output Directory: `dist`

3) Add Environment Variable (required)
- In the Vercel dashboard for your project go to Settings → Environment Variables.
- Add `VITE_VAPI_API_KEY` and paste your Vapi public API key.
  - Set it for `Production` and `Preview` (and `Development` if you want preview behavior on Vercel dev).

4) Deploy with the CLI (optional)
```powershell
npm i -g vercel
cd "c:\Users\acer\Documents\Interview Application vapi"
vercel login
vercel --prod
```

To add the environment variable with the CLI:
```powershell
vercel env add VITE_VAPI_API_KEY production
vercel env add VITE_VAPI_API_KEY preview
```

Notes and security
- Any `VITE_` prefixed env var is embedded into the client bundle and is publicly visible. If your key must remain secret, implement a server-side proxy (Serverless Function) that holds the real key and forwards requests.
- We added `vercel.json` to ensure Vercel serves the `dist` output. You can remove it if Vercel auto-detects the framework correctly.

If you want, I can add a serverless API route to proxy calls to Vapi (keeps the API key secret). Do you want that? 
