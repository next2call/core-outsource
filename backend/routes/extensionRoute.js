const express = require('express');
const router = express.Router();
const extController = require('../controller/extensionController');
const authenticate = require('../middlewares/authenticateMiddleware');

router.get("/viewExtension", authenticate(), extController.getExtension)
router.post("/addExtension", authenticate(), extController.addExtn);
router.delete("/deleteExtension/:id", authenticate(), extController.deleteExtn);
router.put("/extensionUpdate/:id", authenticate(), extController.editExtn);

router.get("/agentsExtension", authenticate(), extController.getAgentExt)

router.get("/getAgentsExtension/:group_id", authenticate(), extController.getAgentsExtension)
router.post("/assignAgent", authenticate(), extController.assignAgent)
router.delete("/deletelist/:id", authenticate(), extController.deleteAssignAgents)
router.get("/getAgentsByGroup/:group_id", authenticate(), extController.getAgentsByGroup);

module.exports = router