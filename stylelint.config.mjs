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
};
