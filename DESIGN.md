# Stockly interface system

## Scene and strategy

Parts counter staff use Stockly between customer requests and stockroom checks, often on a
standard office monitor with bright overhead lighting. Keep the work surface quiet, legible, and
fast to scan. Strategy: restrained product UI, with cobalt reserved for primary actions and
selection states.

## Palette

Tokens live in `src/styles.css` and use OKLCH.

| Role | Token | Use |
|---|---|---|
| Primary | `--accent` | Main actions, active navigation, links, focus. |
| Accent soft | `--accent-soft` | Low-emphasis information status. |
| Ink / muted | `--ink`, `--muted` | Main and secondary text. |
| Canvas / surface | `--canvas`, `--surface` | Page ground and working surfaces. |
| Navigation | `--nav`, `--nav-muted` | Persistent workspace navigation. |
| Semantic | `--success`, `--warning`, `--danger` | Stock and transaction states. |

## Typography and layout

Use Noto Sans with its Arabic companion fallback. Headings use compact weight and scale; tables and forms remain dense
enough for daily operations. Desktop uses a fixed workspace sidebar; below 700px it becomes a
horizontal scrollable navigation row. Tables scroll horizontally when their columns cannot fit.

## Components and behavior

Shared classes cover buttons, inputs, surfaces, metrics, tables, status pills, toolbars, empty
states, errors, and page headings. Keyboard focus is visible. Status always includes text as well
as color. Motion is limited to brief interaction feedback and respects reduced-motion settings.
