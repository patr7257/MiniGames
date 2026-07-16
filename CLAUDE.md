# CLAUDE.md, MiniGames

GitHub description: "Coding games for fun" (`patr7257/MiniGames`, public). A
tiny browser arcade of three simple, zero-build games that are also hosted on
patrickrobel.dk/arcade.

## Architecture

Each game is a self-contained folder of plain HTML + CSS + JavaScript. No build
step, no framework, no bundler, no dependencies. The games share ONE stylesheet.

```
MiniGames/
  shared/
    arcade.css                  single source of truth for the Neon CRT look
    fonts/press-start-2p.woff2  self-hosted pixel font (SIL OFL, OFL.txt)
  minesweeper/  index.html + minesweeper.js + minesweeper.css
  snake/        index.html + snake.js + snake.css
  pacman/       index.html + pacman.js + pacman.css
```

### The shared stylesheet contract

`shared/arcade.css` owns the palette tokens (`--arcade-bg`, `--arcade-accent`,
`--arcade-accent-2`, `--arcade-ok`, `--arcade-danger`, `--arcade-font`, ...) and
the chrome classes (`.arcade-body`, `.arcade-scanlines`, `.arcade-title`,
`.arcade-hud`, `.arcade-btn`, `.arcade-panel`, `.arcade-overlay`,
`.arcade-touch-only`). Every game:

- links it FIRST, then its own stylesheet:
  `<link rel="stylesheet" href="../shared/arcade.css">`
  then `<link rel="stylesheet" href="snake.css">`
- uses the tokens and chrome classes for its frame, HUD, buttons, overlays
- adds only game-specific rules in its own CSS file
- does NOT fork or edit `arcade.css`. A restyle happens there once and every
  game follows. Chrome changes go through a single edit to that file.

The font `url()` inside `arcade.css` is relative (`fonts/press-start-2p.woff2`)
and resolves because the file is served from `shared/`. This holds in all three
serving contexts: `file://`, `npx serve .`, and the website.

## How to run

Static, so open a game's `index.html` directly, or serve the root:

```
npx serve .
```

then `http://localhost:3000/snake/` (or `/minesweeper/`, `/pacman/`). Serve the
ROOT, not a single game folder, so `../shared/arcade.css` resolves.

## Website sync contract (patrickrobel.dk)

The site (repo `patr7257/patrickrobelweb`) hosts these games at `/arcade`. It
copies `shared/`, `minesweeper/`, `snake/`, and `pacman/` into its
`website/public/arcade/games/` with `pnpm sync:minigames` and embeds each game
in an iframe at `src="/arcade/games/<game>/index.html"`. Because the iframe URL
ends in `/index.html`, every relative path inside a game resolves natively, so
the sync is a plain recursive copy with no path rewriting.

Consequences for anyone changing a game here:

- keep each game a self-contained folder that works when opened directly; the
  website does no rewriting.
- after changing a game, the website must re-run `pnpm sync:minigames` and
  commit the refreshed `public/arcade/games/` copy, or the site keeps serving
  the old version.
- games must make NO external network requests (no CDN, no external fonts): the
  self-hosted pixel font is the only asset, and the site serves everything from
  its own origin.

## Conventions

- Vanilla JS only, no build tooling. Keep each game SIMPLE and readable.
- Keyboard controls plus basic touch (swipe or on-screen) via `.arcade-touch-only`.
- Games call `preventDefault()` on arrow keys and space so the page never scrolls.
- No emojis in code.
- No em dashes or en dashes anywhere (code, comments, strings, docs, commits):
  reword, or use a comma, colon, parentheses, or a single hyphen.
- Danish text (rare here) uses the real letters aa/oe/ae -> the actual
  characters, never digraph transliterations.
