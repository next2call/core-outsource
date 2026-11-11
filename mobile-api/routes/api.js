const router = require("express").Router();
const c = require("../controllers/mobileController");
const { authenticate } = require("../middleware/auth");
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// The only public endpoint: it validates both legacy user stores, records login,
// then returns the JWT used by every route below.
router.post("/auth/login", c.login);
router.post("/auth/check-user", c.checkUser);
router.use(authenticate);

router.post("/users", c.users);
router.post("/auth/logout", c.logout);
router.post("/auth/status", c.loginStatus);
router.post("/break", c.break);
router.post("/dashboard/call-counts", c.callCounts);
router.post("/dashboard/summary", c.summary);
router.post("/calls/history", c.callHistory);
router.post("/calls/sip", c.leadSip);
router.post("/reminders", c.reminders);
router.post("/feedback", c.feedback);
router.post("/blocked-numbers", c.blockNumber);
router.post("/users/search", c.searchUsers);
router.post("/messages", c.messages);
router.post("/chat-history", c.chatHistory);
router.post("/device-token", c.storeToken);
router.post("/uploads", upload.single("file"), c.uploadData);
router.post("/uploads/list", c.uploadList);
router.post("/brighto/:action", c.brighto);

module.exports = router;
