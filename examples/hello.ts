import { banner, column, gauge, panel, row, run, select, sparkline, text, RingBuffer } from "../src/index.js";

const history = new RingBuffer<number>(40);

await run({
  title: "Hello SysTerm",
  fps: 8,
  theme: "mint",
  state: { cpu: 0.2, selected: 0 },
  setup(ctx) {
    const timer = setInterval(() => {
      const cpu = Math.random();
      history.push(cpu * 100);
      ctx.setState({ cpu });
    }, 400);
    return () => clearInterval(timer);
  },
  render(ctx) {
    const pages = ["Overview", "Charts", "About"];
    return column(
      banner("Hello"),
      row(
        panel(
          { title: "load", flexGrow: 1 },
          gauge({ label: "cpu", value: ctx.state.cpu * 100, max: 100 }),
          sparkline({ data: history.toArray(), min: 0, max: 100 }),
          text(pages[ctx.state.selected] ?? "Overview", { tone: "muted" }),
        ),
        panel(
          { title: "pick one", width: 24 },
          select({
            key: "view",
            autofocus: true,
            options: pages,
            selected: ctx.state.selected,
            onSelect: (selected) => ctx.setState({ selected }),
          }),
        ),
      ),
      text("arrows move the list    q quits", { tone: "muted" }),
    );
  },
  onKey(key, ctx) {
    if (key.name === "q") ctx.exit();
  },
});
