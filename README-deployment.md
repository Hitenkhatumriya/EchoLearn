# EchoLearn static demo deployment

## Files to deploy

Publish the contents of this `outputs` folder as the site root. `index.html` is the entry page. Keep `echolearn.css`, `echolearn.js`, and `_headers` beside it. `synthetic-echo-test.png` is an optional sample upload for demonstrations.

The `_headers` file uses the static-host header format supported by Netlify and Cloudflare Pages. Confirm that your chosen host applies these headers in its deployment preview. The page also has a restrictive Content Security Policy meta tag as a fallback, but host-level response headers are preferred.

## Current scope

- The image is decoded, resized, analyzed, and previewed in the browser. The app does not post the uploaded file to a server or save it.
- The current image check estimates a fan-shaped scan sector, measures brightness inside that sector, and highlights connected dark regions. It is not a trained AI model, cannot reliably identify anatomy or chamber names, and is not clinically validated.
- The voice is browser text-to-speech. The scanner controls are simulated in the preview and do not connect to ultrasound hardware.
- Do not use this version for diagnosis, patient care, or real scanner guidance. A clinical product would need a validated model, clinical and regulatory review, device integration, security/privacy review, and testing across devices and patient groups.

## Analytics

GA4 is disabled until a real Measurement ID is entered as `GA_MEASUREMENT_ID` near the top of `echolearn.js`. Before enabling it, configure an appropriate privacy notice and consent behavior for your audience and jurisdiction. The current code sends only the standard page view; do not add image contents, patient details, uploaded filenames, or measurements to analytics.

## Deployment checks

1. Deploy the whole folder to an HTTPS static host.
2. Confirm the host applies the headers in `_headers` and that `index.html`, `echolearn.css`, and `echolearn.js` load without console errors.
3. Test the included synthetic image and confirm it remains local in the browser.
4. Check keyboard access, speech support, mobile layout, and the host’s privacy/analytics behavior before sharing.
