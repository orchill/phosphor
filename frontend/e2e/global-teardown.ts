/** Playwright global teardown: always stop the backend server. */
import { stopServer } from "./server-manager";

export default async function globalTeardown() {
  await stopServer();
}
