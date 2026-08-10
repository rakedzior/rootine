export default {
  plugins: ["@projectwallace/stylelint-plugin"],
  rules: {
    "projectwallace/no-unknown-custom-properties": [true, { importFrom: ["src/styles/tokens.css"] }],
    "projectwallace/max-selector-complexity": 12,
    "projectwallace/max-selectors-per-rule": 10,
    "projectwallace/max-declarations-per-rule": 64,
    "projectwallace/max-important-ratio": 0.05,
    "projectwallace/max-unique-colors": 40,
    "projectwallace/max-unique-font-families": 4,
    "projectwallace/max-unique-font-sizes": 20,
    "projectwallace/max-unique-line-heights": 14,
    "projectwallace/max-unique-box-shadows": 5,
    "projectwallace/max-unique-z-indexes": 10,
    "projectwallace/max-unique-media-queries": 14,
  },
  overrides: [
    {
      /*
       * ui.css owns the shared shell primitives and ambient.css owns a
       * viewport-sized backdrop. A looping animation in either keeps the
       * compositor busy for as long as the screen is open, which reads as a
       * permanently janky app rather than as a slow decoration: fourteen such
       * loops used to cost 440-2400ms of compositor work per 3s of an idle
       * page. Loading spinners loop legitimately, but they belong to the
       * stylesheets that own the pending state — not to these two.
       */
      files: ["src/styles/ui.css", "src/styles/ambient.css"],
      rules: {
        "declaration-property-value-disallowed-list": [
          {
            animation: [/infinite/],
            "animation-iteration-count": [/infinite/],
          },
          {
            message:
              "Looping animations are not allowed in ui.css: the ambient scene is a static identity layer that animates only on arrival and on discrete state changes.",
          },
        ],
      },
    },
  ],
};
