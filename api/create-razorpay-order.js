// /api/create-razorpay-order.js
// Runs on Vercel's server only. Creates a Razorpay order using your secret
// key — the secret key never touches the browser.
import Razorpay from "razorpay";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    return res.status(500).json({ error: "Razorpay is not configured on the server yet." });
  }

  const { amount } = req.body || {};
  if (!amount || typeof amount !== "number" || amount <= 0) {
    return res.status(400).json({ error: "Invalid amount." });
  }

  try {
    const instance = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const order = await instance.orders.create({
      amount: Math.round(amount * 100), // Razorpay expects paise
      currency: "INR",
      receipt: "amrit_" + Date.now(),
    });
    return res.status(200).json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId, // Razorpay's key_id is meant to be public — safe to return here
    });
  } catch (err) {
    return res.status(500).json({ error: err?.error?.description || err?.message || "Could not create payment order." });
  }
}
