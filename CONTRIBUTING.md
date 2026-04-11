# Contributing

You found this repo. You're curious enough to click into the contributing guide.
That already puts you ahead of most people. Welcome.

This project is building a living atlas of scientific knowledge — the kind of
thing that should have existed ten years ago but didn't because nobody was
stubborn enough to start it. If you want to help make it better, here's how.

## The workflow

Only maintainers push directly. Everyone else:

1. **Fork** the repo
2. **Clone** your fork
3. **Branch** off `main` (see naming below)
4. **Make your changes**, commit, push to your fork
5. **Open a pull request** back to `main`

Never done this before? GitHub's
[forking guide](https://docs.github.com/en/get-started/quickstart/fork-a-repo)
will get you there in five minutes.

## Branch naming

Keep it obvious:

| Prefix | When to use it |
|--------|----------------|
| `feat/` | New feature or capability |
| `fix/` | Bug fix |
| `data/` | Data corrections, new entries, metadata fixes |
| `docs/` | Documentation |
| `refactor/` | Code restructuring, no behavior change |

Examples: `feat/semantic-search`, `data/fix-phase-labels`, `feat/add-titan-schrodinger`

## Pull requests

- **One thing per PR.** A bug fix and a feature in the same PR will sit in review
  limbo. Keep them separate.
- **Say what and why.** The diff shows *what* changed. The description should
  explain *why* it matters.
- **Build before you submit.** Run `npm run dev` and `npm run build`. If it
  doesn't build, it doesn't ship.
- **Screenshots if it's visual.** Before/after. Takes thirty seconds. Saves
  everyone time.

## Issues

Found something broken? Have an idea? Want to nominate a titan for the Pantheon?
[Open an issue.](../../issues)

- **Bugs:** What you expected. What happened. Steps to reproduce.
- **Ideas:** Describe the problem, not just the solution. Context helps us
  design the right thing instead of the fast thing.
- **Data corrections:** If a NIAC concept has wrong metadata or a Pantheon entry
  has bad info, tell us. Accuracy matters — especially in the Tea section.

## Setting up locally

```bash
git clone https://github.com/YOUR_USERNAME/SoFarSoGood.git
cd SoFarSoGood
npm install
npm run dev        # -> http://localhost:3000
npm run build      # check for errors before submitting
```

Requires Node 25+ (native `.ts` via `--experimental-strip-types`).

## Where help matters most

- **Data quality.** Phase labels, PI attribution, concept metadata. If you know
  NIAC history, your corrections are worth more than code.
- **Historical NIAC concepts (1998-2016).** The early years are missing.
- **Pantheon research.** New titans, better tea, deeper power moves. Do the
  reading. Get the details right.
- **Accessibility.** Screen readers, keyboard nav, color contrast. The atlas
  should work for everyone.
- **Performance.** Lighthouse scores, bundle size, load times. The Pantheon
  gallery page is heavy. Ideas welcome.

## Code style

- TypeScript everywhere. No `any` unless you can defend it.
- Astro for pages, React for interactive islands.
- Tailwind for styling. Custom CSS only when Tailwind genuinely can't do it.
- Simple over clever. If a junior dev can't read it in thirty seconds, simplify it.

## License

By contributing, you agree your work falls under the same license as the project.

---

Questions? Open an issue. We don't bite. We might tier-rank your pull request
though.
