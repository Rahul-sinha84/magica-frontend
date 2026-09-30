This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Contracts

The API contracts (Zod schemas, plus `fold.ts`) are owned by the backend and **pushed** into this repo. Nothing here creates or edits them.

To update them, run this in the **backend** repo:

```bash
cd ../magica-backend
pnpm contracts:sync        # set FRONTEND_REPO_PATH if this repo is not next to it
```

then check the result here:

```bash
pnpm contracts:check
```

- Never edit `contracts/*.ts` or `contracts.lock.json` by hand. `pnpm contracts:sync` in this repo only prints these instructions and copies nothing.
- `pnpm contracts:generate-lock` exists for the backend's sync to write the lock file. Never run it by hand.
- `pnpm contracts:check` fails if a contract was edited, is missing, or is not in the lock, **and** if a file lacks the `// Generated from magica-backend` header or has a relative import ending in `.js`. Next.js can't resolve `./x.js` to `x.ts` when building, while `tsc` and the tests can, so without this check a bad copy would only fail at deploy. `pnpm build` runs the check first.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
