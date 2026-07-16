# MiniGames

A tiny browser arcade: three simple games written for fun and playable with no
build step. Each game is a self-contained folder of plain HTML, CSS, and
JavaScript sharing one "Neon CRT" stylesheet.

The games are also hosted on my site at
[patrickrobel.dk/arcade](https://www.patrickrobel.dk/arcade), where each is
embedded in an arcade cabinet frame.

## Games

| Game | Folder | What it is |
| --- | --- | --- |
| Minesweeper | `minesweeper/` | Classic mine-clearing on a grid, three difficulty presets. |
| Snake | `snake/` | Eat, grow, avoid yourself. Speeds up as you score. |
| Pacman | `pacman/` | Eat pellets, dodge (or chase) ghosts, clear the maze. |

## Play locally

Everything is static, so either open a game's `index.html` directly, or serve
the repo root and browse to a game:

```
npx serve .
```

then open `http://localhost:3000/snake/` (or `/minesweeper/`, `/pacman/`).

Serving the root (rather than a single game folder) matters because each game
links the shared stylesheet with a relative path (`../shared/arcade.css`).

## Structure

```
MiniGames/
  shared/
    arcade.css                 the single Neon CRT stylesheet (tokens + chrome)
    fonts/press-start-2p.woff2  self-hosted pixel font (SIL OFL, see OFL.txt)
  minesweeper/  index.html + minesweeper.js + minesweeper.css
  snake/        index.html + snake.js + snake.css
  pacman/       index.html + pacman.js + pacman.css
```

Styling lives in one place: `shared/arcade.css` defines the palette tokens
(`--arcade-*`) and the chrome classes (`.arcade-hud`, `.arcade-btn`,
`.arcade-overlay`, `.arcade-panel`, `.arcade-scanlines`). Each game links it
first, then adds only game-specific rules in its own CSS. A restyle happens in
that one file and every game follows.

## Fonts

`shared/fonts/press-start-2p.woff2` is the Press Start 2P pixel font, licensed
under the SIL Open Font License 1.1 (`shared/fonts/OFL.txt`). It is self-hosted;
the games make no external network requests.
