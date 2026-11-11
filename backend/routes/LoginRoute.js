const express = require("express");
const router = express.Router();
const logController = require("../controller/LogController");
const authenticate = require("../middlewares/authenticateMiddleware");
const db = require("../models/db");


// router.get("/checkSession", logController.checkSession);
router.post("/login", logController.login);
router.post("/check-login", authenticate(), logController.checkLogin);
router.post("/get-dcdtkn", logController.dcdtkn);
router.post("/loginWithoutOtp", logController.loginWithoutOtp);
router.post("/get_mask", logController.get_mask);
router.post("/verify_otp", logController.verifyAdminOTP);
router.post("/resend-otp", logController.resendOtp);


router.post('/select_campaign', logController.selectCampaign)
router.get('/get_agent_status', logController.getBreakStatus)
router.post("/break_time", logController.updateBreak);
router.post("/logout", logController.logout);
router.post("/adminLogoutUser", logController.adminLogoutUser);
router.post("/logoutAllAgents", logController.adminLogoutAllUsers);
router.post("/emergencyReset", logController.emergencyReset);

router.get("/phnlink", authenticate(), (req, res) => {
    db.query(
        "SELECT password FROM users WHERE user_id = ?",
        [req.user.userId],
        (err, rows) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }

            if (!rows.length) {
                return res.status(404).json({
                    error: "User not found"
                });
            }

            const password = rows[0].password;

            return res.status(200).json({
                user: req.user,
                url: `https://ringfy.next2call.com/softphone/Phone/index.html?profileName=${req.user.userId}&SipDomain=ringfy.next2call.com&SipUsername=${req.user.userId}&SipPassword=${encodeURIComponent(password)}`
            });
        }
    );
});



router.get("/softphone-config", authenticate(), (req, res) => {

    db.query(
        "SELECT user_id,password FROM users WHERE user_id=?",
        [req.user.userId],
        (err, rows) => {

            if (err) {
                return res.status(500).json({
                    error: err.message
                });
            }

            if (!rows.length) {
                return res.status(404).json({
                    error: "User not found"
                });
            }

            return res.json({
                profileName: rows[0].user_id,
                SipDomain: "ringfy.next2call.com",
                SipUsername: rows[0].user_id,
                SipPassword: rows[0].password
            });
        }
    );
});

// router.get("/phnlink", authenticate(), (req, res) => {

//     res.json({
//         success: true,
//         phoneUrl:
//             "https://ringfy.next2call.com/api_softphone/Phone/index.html"
//     });

// });

module.exports = router;
