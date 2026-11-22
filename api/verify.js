import { kv } from "@vercel/kv";

const validKeys = [
  "TEST-KEY-2024-LIFETIME",
  "MAKHAZEN-PRO-KEY-001",
];

const TRIAL_MS = 24 * 60 * 60 * 1000; // 24 ساعة

function deviceKey(serial) {
  return `device:${serial}`;
}

async function getDevice(serial) {
  const data = await kv.get(deviceKey(serial));
  if (data && typeof data === "object") {
    return data;
  }
  // قيم افتراضية
  return {
    trialStart: null,
    isLifetime: false,
    activatedKey: null,
  };
}

async function saveDevice(serial, device) {
  await kv.set(deviceKey(serial), device);
}

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  try {
    const { serial, key, action } = req.body || {};

    if (!serial || typeof serial !== "string" || serial.trim().length < 3) {
      return res.status(400).json({
        success: false,
        message: "سيريال اللوحة الأم مطلوب",
      });
    }

    const cleanSerial = serial.trim().toUpperCase();
    const device = await getDevice(cleanSerial);

    // ========== فحص الحالة ==========
    if (action === "check") {
      if (device.isLifetime) {
        return res.status(200).json({
          success: true,
          status: "lifetime",
          message: "البرنامج مفعّل مدى الحياة",
          remainingHours: null,
        });
      }

      if (device.trialStart) {
        const now = Date.now();
        const elapsed = now - device.trialStart;
        const remaining = TRIAL_MS - elapsed;

        if (remaining > 0) {
          return res.status(200).json({
            success: true,
            status: "trial",
            message: "التجربة المجانية نشطة",
            remainingHours: Math.ceil(remaining / (60 * 60 * 1000)),
            remainingMs: remaining,
          });
        } else {
          return res.status(200).json({
            success: true,
            status: "expired",
            message: "انتهت فترة التجربة المجانية",
            remainingHours: 0,
          });
        }
      }

      return res.status(200).json({
        success: true,
        status: "none",
        message: "لم يتم التفعيل بعد",
        remainingHours: null,
      });
    }

    // ========== بدء التجربة المجانية ==========
    if (action === "start_trial") {
      if (device.isLifetime) {
        return res.status(200).json({
          success: true,
          status: "lifetime",
          message: "البرنامج مفعّل بالفعل مدى الحياة",
        });
      }

      if (device.trialStart) {
        const now = Date.now();
        const elapsed = now - device.trialStart;
        if (elapsed < TRIAL_MS) {
          return res.status(200).json({
            success: true,
            status: "trial",
            message: "التجربة المجانية نشطة بالفعل",
            remainingHours: Math.ceil((TRIAL_MS - elapsed) / (60 * 60 * 1000)),
            remainingMs: TRIAL_MS - elapsed,
          });
        }
      }

      // بدء تجربة جديدة
      device.trialStart = Date.now();
      await saveDevice(cleanSerial, device);

      return res.status(200).json({
        success: true,
        status: "trial",
        message: "تم تفعيل التجربة المجانية لمدة 24 ساعة",
        remainingHours: 24,
        remainingMs: TRIAL_MS,
      });
    }

    // ========== تفعيل مدى الحياة ==========
    if (action === "activate") {
      if (!key || typeof key !== "string") {
        return res.status(400).json({
          success: false,
          message: "مفتاح التفعيل مطلوب",
        });
      }

      const cleanKey = key.trim().toUpperCase();

      if (!validKeys.map((k) => k.toUpperCase()).includes(cleanKey)) {
        return res.status(403).json({
          success: false,
          message: "مفتاح التفعيل غير صالح",
        });
      }

      device.isLifetime = true;
      device.activatedKey = cleanKey;
      await saveDevice(cleanSerial, device);

      return res.status(200).json({
        success: true,
        status: "lifetime",
        message: "تم تفعيل البرنامج بنجاح مدى الحياة",
      });
    }

    return res.status(400).json({
      success: false,
      message: "إجراء غير معروف. استخدم: check | start_trial | activate",
    });
  } catch (err) {
    console.error("KV Error:", err);
    return res.status(500).json({
      success: false,
      message: "خطأ في السيرفر: " + (err.message || "unknown"),
    });
  }
}
