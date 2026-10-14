# NephroTDM 1.5.2 (14 October 2026)

One change: an anonymous visit counter on the published site. The models, the numbers and every other behaviour are as in 1.5.1.

- **What is counted.** One page view per page load, through a 1-pixel image request to GoatCounter (`nephrotdm.goatcounter.com`, cookie-free). GoatCounter shows the owner how many
  visits, from which countries and browsers, and from which referring sites. It cannot identify a person, and this is deliberate.
- **What is sent.** The page (`/`) and the referring site's origin. Never anything typed into the app, the URL's query or hash, or a cookie. An image, not a script, is used so that no
  third-party code runs in a page where patient data are entered.
- **Where it runs.** Only on `https://robterheine.github.io`. A downloaded copy opened from disk, a copy on localhost or on another host sends nothing, and a blocked request
  (ad blocker, no network) shows no error. "Do Not Track" and "Global Privacy Control" switch it off.
- **Disclosure.** The About dialog's privacy section says so in one paragraph. README rule 2 ("offline, forever") now names this as its single exception.
- **Tests.** `tests/test_visits.js` (6): the request URL, the host gate (file, http, localhost, another domain, a look-alike domain), Do Not Track, `ping()` never throws, the module is
  wired in and uses no cookie, storage, fetch or script. Red first (6 of 6 failed before the module existed), and removing the host check fails two of them.
- **UI-text snapshot** re-recorded for the new About paragraph and the version digit only.

Not checked: the counter's data actually arriving in the GoatCounter dashboard, which can be seen only after publishing and opening the live page once.
