const db = require("../config/db");

exports.users = (req,res)=>{

    db.query("SELECT admin, user_id, password, full_name, status, campaigns_id, recording_permission FROM users WHERE user_type = '1'",(err,result)=>{

        if(err){
            return res.json(err);
        }
        res.json(result);
    });

}