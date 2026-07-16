# CLAUDE.md, MiniGames

GitHub description: "Coding games for fun" (`patr7257/MiniGames`, public). This
repo was set up to hold small hobby games written while learning or practicing
coding, but as of now it has no working code in it.

## Current state (factual)

The repository has exactly two commits on `main`:

1. `initializing folders for different minigames`, which added IntelliJ IDEA
   project skeletons for three games: Catan, Pacman, and Snake. Each folder
   contained only auto generated `.idea` project files and empty stub Java
   classes (`Main.java`, `Board.java`, `Cell.java`, `Draw.java`, and a
   game class) with no actual game logic implemented. This commit also added a
   path called `Minesweeper` as a git submodule reference (gitlink), not as a
   folder of files.
2. `Fixing folders etc`, which deleted every file added in the first commit
   (Catan, Pacman, Snake, and the root `.idea` files). It left the repo with
   only the `Minesweeper` gitlink.

There is no `.gitmodules` file in this repo and there never has been (checked
across the full history). Without a `.gitmodules` entry, git has no URL to
fetch the `Minesweeper` submodule from, and the commit it points to
(`f3a5ee36b8cc61ce01a781d1b5bef03557a3e17d`) is not present in this repository's
object store. The result: `Minesweeper` is a broken, orphaned submodule
reference. Locally it checks out as an empty directory; `git submodule status`
fails with "no submodule mapping found in .gitmodules for path 'Minesweeper'".

**In short: there is currently no runnable or readable source code in this
repository.** No game can be built or run from this checkout today.

## Layout

```
MiniGames/
  Minesweeper/   empty directory, broken git submodule link (no content, no .gitmodules)
```

## If you are picking this repo back up

To make it usable again, one of the following is needed first:

- Add a real `.gitmodules` file pointing `Minesweeper` at an actual Minesweeper
  repo URL, then run `git submodule update --init`, or
- Remove the broken `Minesweeper` gitlink (`git rm Minesweeper`) and commit
  plain source files directly instead of a submodule, or
- Recreate the Catan, Pacman, and Snake skeletons (or new games) as regular
  tracked files with real game logic, since the previous stub code was deleted
  and contained no working implementation to restore anyway.

Until one of those happens, there is nothing here to build, test, or run.
