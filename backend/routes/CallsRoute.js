 const express =require('express');
 const router = express.Router();
 const  callsController = require('../controller/CallsController')
 
 
router.get('/data/getMissedCalls', callsController.getMissedCalls)
// router.get('/data/viewAllCalls', callsController.ViewAllCalls)
 router.get('/data/:type',callsController.getTotalCall)
 router.get('/call-counts',callsController.getNumOfCall)
 router.get('/call-counts-per',callsController.getNumOfCallWithPercent)
 router.get('/call-graph',callsController.totalCallGraph)
  router.get('api/call-graph',callsController.getFilteredCalls)
  router.get("/viewCalls", callsController.ViewAllCalls);
  router.get("/agent_viewCall", callsController.getAgentcallReport);
//   router.get("/viewLead", callsController.LeadReoprt);
router.post("/update-live-report", callsController.updateAgentLiveReport);
  router.get("/call_report_agent_dropdown", callsController.callReportAgentsDropdown);
  router.get("/top-caller", callsController.topCaller);
 
 module.exports = router