import { setupWorker } from "msw/browser";
import { handlers } from "./handlers";
import { addLongChat } from "./fixtures";

addLongChat();

export const worker = setupWorker(...handlers);
