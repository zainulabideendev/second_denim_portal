/**
 * Post a message to Slack via Incoming Webhook.
 * No-ops (with a console warning) when SLACK_WEBHOOK_URL is unset.
 */
export async function sendSlackMessage(text: string): Promise<boolean> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL?.trim();
  if (!webhookUrl) {
    console.warn("[slack] SLACK_WEBHOOK_URL is not set — skipping notification");
    return false;
  }

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[slack] webhook failed", res.status, body);
      return false;
    }

    return true;
  } catch (err) {
    console.error("[slack] webhook error", err);
    return false;
  }
}
