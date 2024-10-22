import { config, rangeConfig } from "@web-art/config-parser";

export default config(
  rangeConfig({
    id: "speed",
    label: "Animation Speed",
    default: 1,
    attrs: {
      min: "0.5",
      max: "5",
      step: "0.1",
    },
  })
);
