export default {
  extends: [
    "@projectwallace/stylelint-plugin/configs/recommended",
    "@projectwallace/stylelint-plugin/configs/design-tokens",
  ],
  rules: {
    "projectwallace/max-unique-colors": 20,
    "projectwallace/max-unique-font-families": 2,
    "projectwallace/max-unique-font-sizes": 10,
    "projectwallace/max-unique-line-heights": 10,
    "projectwallace/max-unique-box-shadows": 5,
    "projectwallace/max-unique-z-indexes": 10,
  },
};