# Codeforces Video Solutions

A Tampermonkey userscript that puts YouTube walkthroughs in the right sidebar of Codeforces problem pages.

**[Install the userscript](https://raw.githubusercontent.com/suraj-xd/codeforces-video-solutions/main/codeforces-video-solutions.user.js)** · [Try problem 4A](https://codeforces.com/problemset/problem/4/A)

## Features

- **Solution videos dropdown** beside the problem statement. Open it to find videos.
- **Top match** ranked by the problem ID and title, followed by explanation keywords and views.
- **More walkthroughs** dropdown with up to eight relevant videos.
- **Video dialog** with an embedded YouTube player, a video selector, and a link to watch on YouTube.
- **Refresh** to fetch new results without using the six-hour cache.
- **Home-page library** with recent problems and search by problem ID or Codeforces URL.

Works on `/problemset/problem/`, `/contest/.../problem/`, `/gym/.../problem/`, and group contest problem URLs. The library appears at `/`, `/home`, or `/index`.

## Install in Comet / Chrome

1. Install [Tampermonkey](https://www.tampermonkey.net/) if you do not have it.
2. Open the **[installation link](https://raw.githubusercontent.com/suraj-xd/codeforces-video-solutions/main/codeforces-video-solutions.user.js)** and click **Install** in Tampermonkey.
3. Reload a [Codeforces problem](https://codeforces.com/problemset/problem/4/A).
4. Open **Solution videos → Find a walkthrough** in the right sidebar.
5. Click the top video or choose another walkthrough. Close the dialog with its close button or Escape.

If the link displays source code, use **Tampermonkey → Dashboard → Utilities → Import from URL** with the same URL. If the script does not run, check that Tampermonkey and the script are enabled and follow [Tampermonkey’s browser-specific setup](https://www.tampermonkey.net/faq.php).

The install link includes GitHub update metadata, so future versions can be checked by Tampermonkey. If you installed an early localhost copy, install the GitHub copy once to receive that metadata.

## Finding videos from the home page

Visit the [Codeforces home page](https://codeforces.com/). Choose a recent problem or enter an ID such as `4A`, `4A Watermelon`, or a full Codeforces problem URL. **Clear library** removes recent problems and cached results from this script’s storage.

## How it works

No API key, backend, runtime dependency, or paid service is required. On request, the script retrieves YouTube’s public search page through Tampermonkey and reads its embedded JSON. It never executes code from that response. It supports classic video cards and newer video lockup data.

Results must match the exact problem ID, or the full problem title together with “Codeforces”/“CF”. Ranking favors ID matches, then title matches, explanation keywords, and a small view-count bonus. **Top match means a relevance estimate, not a human-reviewed quality rating.** Results can be in different languages; choose another from the dropdown when needed. Contest-wide editorials without a matching ID/title may be excluded.

## Privacy and permissions

- Runs only on HTTPS `codeforces.com` and its subdomains; never inside iframes.
- `GM_xmlhttpRequest` is restricted to `www.youtube.com`. Searches use anonymous requests without account cookies.
- Search sends the problem ID and title to YouTube, not the problem statement, submissions, or account details.
- Recent problems (up to 12) and cached searches (up to 24) live in Tampermonkey storage in this browser.
- Thumbnails load from YouTube’s image CDN after searching. The privacy-enhanced YouTube player loads when you choose a video; YouTube then handles playback and its associated data collection.
- No analytics, external libraries, or access to your Codeforces credentials.

## Limitations

YouTube’s search markup is undocumented and can change. Consent pages, throttling, and network failures may prevent results. The script shows an error and offers **Refresh** and **Search YouTube**. Videos that prohibit embedding can be opened with **Watch on YouTube**.

A live Comet/Tampermonkey check returned eight matching videos for **4A · Watermelon**. Automated tests cover route detection, input validation, JSON extraction, both result formats, duplicate/ad filtering, relevance, and safe query encoding. This is not a claim of exhaustive compatibility across all Codeforces pages or YouTube locales.

## Development

Requires Node.js 22 or newer. There are no package dependencies.

```sh
npm run check
npm test
npm start
```

The local installer is served at `http://127.0.0.1:8766`. Override the port with `CF_VIDEO_PORT=8767 npm start`. The server binds only to the loopback interface. It serves the install page and userscript, not arbitrary local files.

## Related projects

During discovery, [ForceGuide](https://chromewebstore.google.com/detail/forceguide/boildnecamebknpjfjkmggaalgallfle) advertised Codeforces video explanations as a browser extension. This repository is an independent userscript implementation with a sidebar dropdown, video dialog, refresh, and a home-page library. Existing script catalogs: [Greasy Fork for Codeforces](https://greasyfork.org/en/scripts/by-site/codeforces.com) and [Tampermonkey’s script directories](https://www.tampermonkey.net/scripts.php).

## License

MIT. Not affiliated with Codeforces, YouTube, or Tampermonkey.
