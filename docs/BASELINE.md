# Verified starting point — October 27, 2026

- GitHub repository: `adventurestationfl/adventure-station-website`, public; default `main`.
- Clone head: `0fe2d4b6296a110615d1db8719981e9b81b780c8`.
- Adventure Station GitHub connector confirmed administrator/push access. Local GitHub CLI credentials were not established for this account; connector access is separate.
- The production homepage returned HTTP 200 at `https://adventurestationfl.com/`. Its downloaded HTML is preserved locally in the ignored baseline folder. Cloudflare rewrites email links, so it differs from the source bytes. It is not a source-file hash match.
- Original source hashes and the four payment URLs are in `baseline/files.json`. `npm run baseline:check` verifies that `index.html`, `adventure_station_website.html` and `CNAME` remain byte-for-byte unchanged.
- Both original embedded JPEG images were extracted and inspected. The new layout retains their artwork; WebP derivatives improve delivery. The preserved HTML retains the original JPEG bytes.
- Cloudflare zone active; nameservers `adaline.ns.cloudflare.com`, `sid.ns.cloudflare.com`.
- Apex A records: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`, all proxied. `www` CNAME: `adventurestationfl.github.io`, proxied. The domain-connect CNAME and DMARC TXT were also present and untouched.
- Cloudflare API lists returned zero Workers, zero Pages projects and zero D1 databases before development. The zone plan was Free.
- Cloudflare Access API returned `access.api.error.not_enabled`; the response explicitly said reconnecting would not resolve this account setup condition.
- No Square/Stripe/Cloudflare API secret variables were present in the development process. No Square developer-account or account-specific fee verification was possible.
- No real customer data was accessed or imported. No other project repositories were modified.

No production resources were created, modified, removed, or rerouted. DNS observations support the GitHub Pages baseline; GitHub Pages control-panel settings were not independently retrieved through the connector.
