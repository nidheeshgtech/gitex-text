# GITEX Global 2026 Intro

Static prototype for the GITEX Global 2026 cinematic intro and first-fold landing screen.

## Structure

```text
.
├── index.html
├── css/
│   └── styles.css
├── js/
│   └── app.js
├── assets/
│   ├── fonts/
│   ├── images/
│   └── svg/
└── docs/
    └── reference-threejs-skills/
```

## Run Locally

Use a local web server so ES modules, HLS video, and SVG fetching work reliably:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000/
```

## External Runtime Dependencies

The prototype imports these browser modules from CDNs:

- Three.js
- hls.js
- cobe

The landing video uses a remote Mux HLS stream.
# gitex-text
