const db = require("../models/db");

//--------------------------------upload data select(view) query--------------------------

app.get("/list", authenticateToken, (req, res) => {
  const userId = req.user.userId;

  const listQuery = "SELECT * FROM lists WHERE admin = ? ORDER BY LIST_ID ASC";

  db.query(listQuery, [userId], (err, lists) => {
    if (err) {
      return res.status(500).send("Error fetching lists");
    }

    if (lists.length === 0) {
      return res.status(404).json({ message: "No lists found." });
    }

    const leadCountPromises = lists.map((list) => {
      return new Promise((resolve, reject) => {
        const leadQuery = `
          SELECT COUNT(*) as LEADS_COUNT
          FROM upload_data
          WHERE admin = ? AND list_id = ? AND dial_status = 'NEW'
        `;

        db.query(leadQuery, [userId, list.LIST_ID], (err, leadResult) => {
          if (err) {
            console.error("Error fetching lead count:", err);
            reject(err);
          } else {
            resolve({
              ...list,
              LEADS_COUNT: leadResult[0].LEADS_COUNT || 0,
            });
          }
        });
      });
    });

    Promise.all(leadCountPromises)
      .then((finalData) => {
        res.status(200).json(finalData);
      })
      .catch((error) => {
        res.status(500).json({ error: "Error fetching lead counts" });
      });
  });
});

//--------------------------------upload data insert query--------------------------

app.post("/listAdd", authenticateToken, (req, res) => {
  const { LIST_ID, NAME, DESCRIPTION, LEADS_COUNT, CAMPAIGN, ACTIVE } =
    req.body;
  const adminId = req.user.admin || req.user.userId;
  // console.log("djd", adminId);
  const createTime = new Date();

  const query = `
    INSERT INTO lists 
    (LIST_ID, NAME, DESCRIPTION, LEADS_COUNT, CAMPAIGN, ACTIVE, ADMIN, RTIME) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.query(
    query,
    [
      LIST_ID,
      NAME,
      DESCRIPTION,
      LEADS_COUNT,
      CAMPAIGN,
      ACTIVE !== undefined ? (ACTIVE ? 1 : 0) : 1,
      adminId,
      createTime,
    ],
    (err, result) => {
      if (err) {
        console.error("Error inserting data:", err);
        return res.status(500).json({
          message: "Error adding new list.",
          error: err,
        });
      }
      res.status(201).json({
        message: "List added successfully.",
        list: {
          LIST_ID,
          NAME,
          DESCRIPTION,
          LEADS_COUNT,
          CAMPAIGN,
          ACTIVE,
          ADMIN: adminId,
          RTIME: createTime,
        },
      });
    }
  );
});

app.put("/lists/:listId", authenticateToken, (req, res) => {
  const adminId = req.user.userId; // Extract admin ID from JWT
  const { listId } = req.params; // Get listId from URL
  const { name, description, leadsCount, campaign, active } = req.body; // Extract fields from request body

  const updateSql = `
    UPDATE lists 
    SET NAME = ?, DESCRIPTION = ?, LEADS_COUNT = ?, CAMPAIGN = ?, ACTIVE = ?, ADMIN = ?
    WHERE LIST_ID = ?
  `;

  const values = [
    name,
    description,
    leadsCount || 0, // Default leads count to 0 if not provided
    campaign || "Unknown Campaign", // Default campaign name
    active !== undefined ? active : true, // Default active to true
    adminId, // Track admin who made the change
    listId, // WHERE condition
  ];

  db.query(updateSql, values, (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res
        .status(500)
        .json({ error: "Database error", details: err.message });
    }

    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ error: "List not found or no changes made" });
    }

    res.status(200).json({ message: "Data updated successfully" });
  });
});

// ------------------------upload data delete query --------------------------------

app.delete("/lists/:listId", authenticateToken, (req, res) => {
  const { listId } = req.params;

  const deleteQuery = "DELETE FROM lists WHERE LIST_ID = ?";

  db.query(deleteQuery, [listId], (err, result) => {
    if (err) {
      console.error("Error deleting list:", err);
      return res.status(500).json({ error: "Failed to delete the list." });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "List not found." });
    }

    res.status(200).json({ message: "List deleted successfully." });
  });
});
