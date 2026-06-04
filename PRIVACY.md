# DeDeUrdf Privacy Notes

DeDeUrdf is designed as a local-first, browser-only URDF workbench.

## What Stays Local

- STL files selected by the user.
- Project JSON files selected by the user.
- Project ZIP files selected by the user.
- Generated URDF previews.
- Generated ZIP downloads before the user saves them.

These files are processed in browser memory using client-side JavaScript.

## What Is Not Included

The app currently has no:

- user accounts
- database
- analytics integration
- upload API
- server-side STL parser
- server-side project storage
- cloud object storage integration

## When Data Leaves the Browser

The user decides when to export files:

- `保存 JSON` downloads a project JSON file.
- `保存项目 ZIP` downloads a reusable project package.
- `导出 URDF ZIP` downloads a URDF package.
- `导出 MuJoCo ZIP` downloads a MuJoCo-ready URDF package.

Those downloads are created by the browser. DeDeUrdf does not upload them to the app server.

## Hosting Logs

If DeDeUrdf is deployed on Vercel or another hosting provider, that provider may keep normal web access logs for page and asset requests. Those logs are separate from DeDeUrdf's app code. Because user project files are not uploaded by the app, those files should not appear in application server storage.

## Practical Recommendation

For confidential robot models, use a trusted local deployment or an internal server. Keep exported project ZIP files under your own version control or file management policy.
