# Teneo website

Static site for Teneo. No build step: `index.html`, `privacy.html`, `kettle3d.js` (the 3D Kettle, uses three.js 0.149 from jsDelivr), `img/` and `media/` (real iPhone screen recordings, 60 fps H.264, with posters).

Hosted on GitHub Pages from `main`, root folder.

Before launch:
- Point the two App Store badges (`href="#download"`) at the real App Store URL.
- Add the custom domain in Settings > Pages and commit a `CNAME` file containing it.
- Make `og:image` and `twitter:image` absolute (`https://YOURDOMAIN/og.png`) and add `og:url`.
- Replace support@teneo.app in `privacy.html` if the support address changes.
