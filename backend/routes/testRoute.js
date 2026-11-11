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

    const [liveRows] = await billingDb.query(
      `SELECT
            Agent_name,
            call_to,
            did,
            direction,
            campaign_Id
         FROM live
         WHERE Agent = ?`,
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

    const dialerSearchUrl =
      `http://122.176.19.173/ajcrm/home/dialerSearch` +
      `?user=${encodeURIComponent(users[0].user_id)}` +
      `&did=${encodeURIComponent(live.did)}` +
      `&phone=${encodeURIComponent(live.call_to)}` +
      `&name=${encodeURIComponent(users[0].full_name)}` +
      `&calltype=${encodeURIComponent(live.direction)}` +
      `&campaign=${encodeURIComponent(campaignName || "")}`;

    return res.json({
      status: 1,
      data: {
        user: users[0].user_id,
        name: users[0].full_name,
        phone: live.call_to,
        did: live.did,
        calltype: live.direction,
        campaignId: live.campaign_Id,
        campaign: campaignName || null,
        isLiveCall: true,

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

  }
});

module.exports = router;