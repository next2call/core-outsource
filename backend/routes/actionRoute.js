const express = require('express');
const authenticate = require('../middlewares/authenticateMiddleware');
const billingDb = require('../models/billingdb');
const router = express.Router();

router.get("/me", authenticate(), (req, res) => {
  res.json({
    success: true,
    tokenData: req.user,
  });
});

router.get("/dialer-search-data", authenticate(), async (req, res) => {
  try {
    const userId = req.user.userId;

    const [users] = await billingDb.query(
      `SELECT user_id, full_name
         FROM users
         WHERE user_id = ?`,
      [userId]
    );

    if (!users.length) {
      return res.status(404).json({
        status: 0,
        message: "User not found",
      });
    }

    const [dynamicIp] = await billingDb.query(
      `
  SELECT u2.api_url
  FROM users u1
  JOIN users u2
      ON u1.admin = u2.user_id
  WHERE u1.user_id = ?
  `,
      [userId]
    );

    if (!dynamicIp.length) {
      return res.status(404).json({
        status: 0,
        message: "No IP address found",
      });
    }

    const apiUrl = dynamicIp[0].api_url;

    const [liveRows] = await billingDb.query(
      `SELECT Agent_name, call_to, call_from, did, direction, campaign_Id FROM live WHERE Agent LIKE ?`,
      [userId]
    );

    if (!liveRows.length) {
      return res.json({
        status: 0,
        message: "No live call found",
      });
    }

    const live = liveRows[0];

    let campaignName = null;

    if (live.campaign_Id) {
      const [campaignRows] = await billingDb.query(
        `SELECT compaignname
           FROM compaign_list
           WHERE compaign_id = ?`,
        [live.campaign_Id]
      );

      if (campaignRows.length) {
        campaignName = campaignRows[0].compaignname;
      }
    }

    let did = String(live.did || "").trim();
    if (!did.startsWith("0120")) {
      did = `0120${did}`;
    }

    let phone;
    const direction = String(live.direction || "").trim().toLowerCase();

    if (direction === "inbound") {
      phone = String(live.call_from || "").trim();
    } else {
      phone = String(live.call_to || "").trim();
    }


    if (phone.length <= 8 && !phone.startsWith("0120")) {
      phone = `0120${phone}`;
    }

    const dialerSearchUrl =
      `http://${apiUrl}/ajcrm/home/dialerSearch` +
      `?user=${encodeURIComponent(users[0].user_id)}` +
      `&did=${encodeURIComponent(did)}` +
      `&phone=${encodeURIComponent(phone)}` +
      `&name=${encodeURIComponent(users[0].full_name)}` +
      `&calltype=${encodeURIComponent(live.direction)}` +
      `&campaign=${encodeURIComponent(campaignName || "")}`;

    return res.json({
      status: 1,
      data: {
        user: users[0].user_id,
        name: users[0].full_name,
        phone: live.call_to,
        did: did,
        calltype: live.direction,
        campaignId: live.campaign_Id,
        campaign: campaignName || null,
        isLiveCall: true,
        dynamicIp: apiUrl,

        dialerSearchUrl,
      },
    });
  } catch (err) {
    return res.status(500).json({
      status: 0,
      message: err.message,
    });
  }
}
);

router.get(
  "/debug-live", authenticate(), async (req, res) => {
    try {
      const [rows] = await billingDb.query(
        `SELECT * FROM live LIMIT 10`
      );

      return res.json(rows);
    } catch (err) {
      return res.status(500).json({
        error: err.message,
        sqlMessage: err.sqlMessage || null,
      });
    }
  }
);

router.get("/getTokenData", authenticate(), (req, res) => {
  try {
    const userId = req.user.userId;
    const admin = req.user.admin;
    let redirect = false;

    if (admin == 20100) {
      redirect = true;
    } else {
      redirect = false;
    }

    res.json({
      action: redirect,
    });
  } catch (error) {
    return res.status(500).json({ error });
  }
});

router.get("/changeSipStatus", authenticate(), async (req, res) => {
  try {
    const query = `
      UPDATE reload_status
      SET status = 1
      WHERE reload_type = 'pjsip_reload'
    `;

    await billingDb.query(query);

    return res.json({
      success: true,
      message: "SIP status updated."
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post("/changeUrlIp", authenticate(), async (req, res) => {
  try {

    const userId = req.user.userId;
    const role = req.user.role;
    const newIP = req.body.ip;

    if (!newIP) {
      return res.status(400).json({ message: "IP can not be null!" });
    }

    if (role !== "admin") {
      return res.status(300).json({ message: "Unauthorized request, contact your admin." });
    }

    const [result] = await billingDb.query(
      `UPDATE users
      SET api_url = ?
      WHERE user_id = ?`,
      [newIP, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    return res.json({
      success: true,
      message: "IP updated successfully"
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;