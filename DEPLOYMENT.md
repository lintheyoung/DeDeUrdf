# DeDeUrdf Deployment Guide

DeDeUrdf is a browser-only Next.js app. It does not require Python, a database, object storage, or any server-side upload endpoint for user STL/JSON/ZIP files.

## Requirements

- Node.js `>=22 <25`
- npm

The repository includes `.nvmrc`, so local users can run:

```bash
nvm use
```

## Local Development

```bash
cd DeDeUrdf
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

## Production Build

```bash
npm ci
npm run build
npm run start
```

By default, `npm run start` serves the app on port `3000`.

## Vercel from Git

1. Import this repository into Vercel.
2. Set the framework preset to `Next.js` if it is not auto-detected.
3. Use Node.js 22 or newer in the project settings.
4. Keep the default commands:

```text
Install Command: npm ci
Build Command: npm run build
Output Directory: .next
```

No environment variables are required.

## Vercel CLI

Deploy directly from the local repository:

```bash
cd DeDeUrdf
npm ci
npm run build
npx vercel --prod
```

If the Vercel CLI asks to link the project, choose:

```text
Set up and deploy? yes
Which scope? your Vercel account or team
Link to existing project? no
Project name: dedeurdf
In which directory is your code located? ./
Want to modify settings? no
```

After deployment, Vercel prints a production URL. Future deployments can be repeated with:

```bash
npx vercel --prod
```

## Self Hosting

On a server:

```bash
git clone <your-repo-url> dedeurdf
cd dedeurdf
npm ci
npm run build
npm run start
```

For long-running service management, place `npm run start` behind your preferred process manager, reverse proxy, or platform runner.

## Data Storage Boundary

DeDeUrdf keeps user files in browser memory. A self-hosted deployment only serves the JavaScript/CSS/static assets needed to run the app. The application code does not persist user STL/JSON/ZIP files to disk or send them to an API route.
