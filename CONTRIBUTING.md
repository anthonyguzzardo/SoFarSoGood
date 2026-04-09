# Contributing to NIAC Atlas

First off — thank you. This project exists because curious people care about
making scientific knowledge more accessible. Every contribution matters.

## How contributions work

This is a public repo, but **only maintainers can push directly**. Everyone else
contributes through the fork + pull request workflow:

1. **Fork** the repo to your own GitHub account
2. **Clone** your fork locally
3. **Create a branch** for your work (see naming below)
4. **Make your changes**, commit, push to your fork
5. **Open a pull request** back to this repo's `main` branch

If you've never done this before, GitHub has a solid
[guide on forking](https://docs.github.com/en/get-started/quickstart/fork-a-repo).

## Branch naming

Use a short prefix so it's obvious what kind of work it is:

| Prefix | Use |
|--------|-----|
| `feat/` | New feature or capability |
| `fix/` | Bug fix |
| `data/` | Data corrections, new concept entries, metadata fixes |
| `docs/` | Documentation changes |
| `refactor/` | Code restructuring without behavior change |

Examples: `feat/semantic-search`, `data/fix-phase-labels`, `docs/add-setup-guide`

## Pull request guidelines

- **One concern per PR.** Don't mix a bug fix with a new feature. Small, focused
  PRs get reviewed faster.
- **Describe what and why.** The title should be concise. The description should
  explain what changed and why. If it fixes an issue, reference it (`Fixes #42`).
- **Test your changes locally.** Run `npm run dev` and `npm run build` before
  submitting. If it doesn't build, it won't get merged.
- **Screenshots welcome.** If your change is visual, include a before/after
  screenshot.

## Issues

Found a bug? Have an idea? [Open an issue.](../../issues)

- **Bug reports:** Include what you expected, what happened, and steps to
  reproduce.
- **Feature ideas:** Describe the problem you want solved, not just the solution
  you imagine. Context helps us design the right thing.
- **Data corrections:** If a NIAC concept has wrong metadata (wrong phase, wrong
  PI, missing info), open an issue with the concept name and what needs fixing.

## Setting up locally

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/niac-atlas.git
cd niac-atlas

# Install dependencies
npm install

# Run the dev server
npm run dev        # → http://localhost:3000

# Build to check for errors
npm run build
```

Requires Node 25+ (we use native `.ts` via `--experimental-strip-types`).

## What we especially need help with

- **Data quality:** Phase labels, PI attribution, and concept metadata are
  imperfect. If you know NIAC history, your corrections are gold.
- **Historical NIAC concepts (1998-2016):** We're missing the early years.
- **Accessibility:** Screen reader support, keyboard navigation, color contrast.
- **Performance:** Lighthouse audits, bundle size, loading speed.

## Code style

- TypeScript everywhere. No `any` unless absolutely necessary.
- Astro for pages, React for interactive islands.
- Tailwind for styling. No custom CSS unless Tailwind can't do it.
- Keep it simple. Don't over-abstract.

## License

By contributing, you agree that your contributions will be licensed under the
same license as the project.

---

Questions? Open an issue or start a discussion. We're friendly.
