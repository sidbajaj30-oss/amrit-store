// /api/verify-razorpay-payment.js
// Runs on Vercel's server only. Verifies that a payment response actually
// came from Razorpay (not spoofed) using an HMAC signature check with your
// secret key — the secret key never touches the browser.
import crypto from "crypto";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) {
    return res.status(500).json({ error: "Razorpay is not configured on the server yet." });
  }

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ verified: false, error: "Missing payment details." });
  }

  const expected = crypto
    .createHmac("sha256", keySecret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  if (expected === razorpay_signature) {
    return res.status(200).json({ verified: true });
  }
  return res.status(400).json({ verified: false, error: "Payment verification failed." });
}
