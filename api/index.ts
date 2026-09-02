import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const loaded = require("../dist/server.cjs");
const app = loaded.default || loaded;
export default app;
