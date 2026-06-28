const express = require('express');
const dotenv = require('dotenv');
const cors = require("cors")
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
dotenv.config();
const app = express();
const port = process.env.PORT;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Hello World!');
});

const logger = (req, res, next) => {
  console.log('logger middleware logger', req.params);
  next()
}


const uri = process.env.MONGO_DB_URI;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const database = client.db("legalease_db");
    const lawyersCollection = database.collection("lawyers");
    const usersCollection = database.collection("user");
    const hiresCollection = database.collection("hires");
    const sessionCollection = database.collection('session');

    // verification related
    const verifyToken = async (req, res, next) => {
      const authHeader = req.headers?.authorization;
      if (!authHeader) {
        return res.status(401).send({ message: 'unauthorized access' })
      }

      const token = authHeader.split(' ')[1]

      if (!token) {
        return res.status(401).send({ message: 'unauthorized access' })
      }

      const query = { token: token }
      const session = await sessionCollection.findOne(query);

      if (!session) {
        return res.status(401).send({ message: 'unauthorized access' })
      }

      const userId = session.userId;


      const userQuery = {
        _id: userId
      }

      const user = await usersCollection.findOne(userQuery);
      if (!user) {
        return res.status(401).send({ message: 'unauthorized access' })
      }
      // set data in the req object
      req.user = user;
      next();
    }

    const verifyUser = async (req, res, next) => {
      if (req.user?.role !== 'user') {
        return res.status(403).send({ message: 'forbidden access' })
      }
      next()
    }
    const verifyLawyer = async (req, res, next) => {
      if (req.user?.role !== 'lawyer') {
        return res.status(403).send({ message: 'forbidden access' })
      }
      next()
    }
    const verifyAdmin = async (req, res, next) => {
      if (req.user?.role !== 'admin') {
        return res.status(403).send({ message: 'forbidden access' })
      }
      next()
    }


    // app.get('/api/users', async (req, res) => {
    //   const cursor = usersCollection.find()
    //   const result = await cursor.toArray();
    //   res.send(result);
    // })



    app.patch('/api/users/:id', verifyToken, async (req, res) => {
      try {
        const id = req.params.id;
        const updatedUser = req.body; // Contains { name, image, email } from your frontend fetch

        const filter = { _id: new ObjectId(id) };

        // Build the update object dynamically based on what the frontend sends
        const updateFields = {};

        if (updatedUser.name) updateFields.name = updatedUser.name;
        if (updatedUser.image) updateFields.image = updatedUser.image;
        if (updatedUser.status) updateFields.status = updatedUser.status; // Keeps your old status logic working too!

        const updateDoc = {
          $set: updateFields
        };

        const result = await usersCollection.updateOne(filter, updateDoc);

        if (result.matchedCount === 0) {
          return res.status(404).send({ success: false, message: "User not found" });
        }

        res.send({ success: true, result });
      } catch (error) {
        console.error("Backend Error:", error);
        res.status(500).send({ success: false, message: "Internal Server Error" });
      }
    });

    // ASSUMPTION: You should have a middleware like verifyAdmin to prevent users from promoting themselves.
    app.patch("/api/users/:id/userRole", async (req, res) => {
      try {
        const { id } = req.params;
        const { userRole } = req.body;

        if (!userRole) {
          return res.status(400).json({
            success: false,
            message: "userRole is required",
          });
        }

        const allowedRoles = ["user", "lawyer", "admin"];

        if (!allowedRoles.includes(userRole)) {
          return res.status(400).json({
            success: false,
            message: "Invalid role",
          });
        }

        const result = await usersCollection.updateOne(
          {
            _id: new ObjectId(id),
          },
          {
            $set: {
              userRole,
            },
          }
        );

        if (!result.matchedCount) {
          return res.status(404).json({
            success: false,
            message: "User not found",
          });
        }

        res.json({
          success: true,
          message: "Role updated successfully",
        });
      } catch (err) {
        console.log(err);

        res.status(500).json({
          success: false,
          message: "Internal Server Error",
        });
      }
    });


    // lawyer related api
    app.get("/api/lawyers", async (req, res) => {
      try {
        const query = {};

        // 1. Extract and parse pagination parameters from req.query
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 8;
        const skip = (page - 1) * limit;

        // Filter by lawyerId (if you are using Mongo _id)
        if (req.query.lawyerId) {
          query._id = req.query.lawyerId;
        }

        // Optional filters matching your frontend
        if (req.query.availability) { // Frontend passes 'availability', maps to database 'status'
          query.status = req.query.availability;
        } else if (req.query.status) {
          query.status = req.query.status;
        }

        if (req.query.specialization) {
          query.specialization = req.query.specialization;
        }

        // Text search filter (Case-insensitive matching for name)
        if (req.query.search) {
          query.name = { $regex: req.query.search, $options: "i" };
        }

        // 2. Fetch data with skip & limit, and get total matching counts in parallel
        const [result, totalItems] = await Promise.all([
          lawyersCollection.find(query).skip(skip).limit(limit).toArray(),
          lawyersCollection.countDocuments(query) // Total counts ignoring limit
        ]);

        // 3. Calculate total pages
        const totalPages = Math.ceil(totalItems / limit);

        // 4. Return structured JSON that our frontend state looks for
        res.status(200).json({
          success: true,
          data: result,
          totalPages: totalPages,
          totalItems: totalItems,
          currentPage: page
        });

      } catch (error) {
        res.status(500).json({
          success: false,
          message: error.message
        });
      }
    });

    app.get('/api/lawyers/:id', async (req, res) => {
      const id = req.params.id;
      const query = {
        _id: new ObjectId(id)
      }
      const result = await lawyersCollection.findOne(query);
      res.send(result);
    })

    app.post('/api/lawyers', async (req, res) => {
      const lawyer = req.body;
      const result = await lawyersCollection.insertOne(lawyer);
      res.send(result);
    })


    // hire related api
    app.get('/api/hires', verifyToken, async (req, res) => {
      const query = {};
      if (req.query.clientId) {
        query.clientId = req.query.clientId;

        // check whether asking for user information or someone else
        if (req.user._id.toString() !== req.query.clientId) {
          return res.status(403).send({ message: 'forbidden access' })
        }

      }
      if (req.query.lawyerId) {
        query.lawyerId = req.query.lawyerId;
      }
      const cursor = hiresCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    })


    app.post('/api/hires', async (req, res) => {
      const hire = req.body;
      const newHire = {
        ...hire,
        createdAt: new Date()
      }
      console.log("new hire", newHire);
      const result = await hiresCollection.insertOne(newHire);
      res.send(result);
    })

    app.patch('/api/hires/:id', logger, verifyToken, verifyLawyer, async (req, res) => {
      const id = req.params.id;
      const updatedHire = req.body;
      const filter = { _id: new ObjectId(id) }
      const updateDoc = {
        $set: {
          status: updatedHire.status
        }
      }
      const result = await hiresCollection.updateOne(filter, updateDoc)
      res.send(result);
    })

    // payment system


    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});