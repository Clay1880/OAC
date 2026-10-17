/**
 * Web Push sender. Task 10 replaces this stub with the real `web-push` implementation;
 * the contract is already final: it never throws, so a failed push cannot fail an order action.
 */
export async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; url: string },
): Promise<void> {
  void userId;
  void payload;
}
