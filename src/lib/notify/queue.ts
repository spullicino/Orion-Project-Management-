import "server-only";
import { after } from "next/server";
import { sendPendingPush } from "./push";

/** After the response is sent, push any notifications this action created (doesn't slow the user down). */
export function queuePush() {
  try {
    after(async () => {
      try {
        await sendPendingPush();
      } catch (e) {
        console.error("push dispatch failed", e);
      }
    });
  } catch {
    // Outside a request (tests/scripts): nothing to do.
  }
}
