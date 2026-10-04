# SysTerm

A small TypeScript framework for data-rich terminal UIs, plus a system monitor that shows how to build one.

The monitor tracks CPU, memory, disks, processes, and network from a normal Node install. Widgets, themes, and a headless renderer live in the same repo, so a clone can start a different app without bringing in a native terminal engine.

## Requirements

- Node.js 20 or newer
- A terminal with a TTY. Windows Terminal, iTerm, Kitty, and VS Code's terminal all work. Truecolor is used when `COLORTERM` or `WT_SESSION` says the terminal supports it.

## Run the monitor

```bash
npm install
npm start
```

`npm run dev` restarts the monitor when files change. `npm test` runs the headless widget tests. `npm run build` writes `dist/` for the `systerm` package entry and the `systerm` command.

## Keys

| Key | Action |
| --- | --- |
| `1`–`6` or Tab | Switch Overview, CPU, Memory, Disks, Processes, Network |
| `j` `k` or arrows | Scroll the page, or move in a list |
| `/` | Jump to processes and filter by name or pid |
| `s` | Cycle the process sort |
| `p` | Pause sampling |
| `t` | Swap the mint and dusk themes |
| `?` or Esc | Open or close the help card |
| `q` | Quit |

While the filter box is focused, keys go to the filter. Enter leaves it. Esc clears it.

Bit, the sprout in the corner, is calm under 50% CPU, busy from there to 85%, and melting after that.

## Write an app

After `npm run build`, Node resolves `systerm` to `dist`. Inside this repo, `examples/hello.ts` imports the TypeScript source so `npm run example` works before a build.

```ts
import { run, column, panel, gauge } from "systerm";

await run({
  title: "My App",
  state: { cpu: 42 },
  render(ctx) {
    return column(
      panel({ title: "CPU" }, gauge({ label: "load", value: ctx.state.cpu })),
    );
  },
  onKey(key, ctx) {
    if (key.name === "q") ctx.exit();
  },
});
```

`render` returns a widget tree. `setState` merges a patch, or replaces state when you pass a function. `setup` starts timers or subscriptions and can return a cleanup function. Focus, scroll position, and input carets stay on widgets that have a `key`.

`renderFrame(tree, { cols, rows })` paints the same tree to a plain string, which is how the tests run without a terminal.

## Widgets

- Layout: `column`, `row`, `panel`, `spacer`, `scroll`
- Text: `text` (with `{b}bold{/b}` and `{#rrggbb}color{/}`), `banner` (figlet), `ascii`
- Charts: `sparkline`, `lineChart` (Braille), `barChart`, `gauge`, `heatmap`
- Data: `table` paints only the visible rows
- Controls: `tabs`, `select`, `textInput`, `checkbox`, `button`, `progress`, `modal`
- `image` decodes a PNG and draws it with half blocks, so it works without Kitty or iTerm image protocols

`RingBuffer` keeps a fixed window of samples for charts. Themes are `mint` and `dusk`.

## Windows notes

`systeminformation` covers CPU, memory, filesystems, and processes on Windows. Some rate counters stay empty: disk I/O, and network bytes per second until a second sample arrives. The monitor keeps the last good snapshot and says when a number is not reported, instead of crashing. The first CPU and network sample is a warmup and is not shown as a real rate.

## License

MIT. See [license](license).
