import { fileURLToPath } from "node:url";

/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
    [fileURLToPath(new URL("./tailwind-compat.config.cjs", import.meta.url))]: {},
    autoprefixer: {},
  },
};

export default config;
