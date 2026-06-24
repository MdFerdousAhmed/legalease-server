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
    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });

    const database = client.db("legalease_db");
    const lawyersCollection = database.collection("lawyers");
    const usersCollection = database.collection("user");
    const hiresCollection = database.collection("hires");

    app.get('api/users', async (req, res) => {
      const cursor = usersCollection.find()
      const result = await cursor.toArray();
      res.send(result);
    })

    app.get("/api/lawyers", async (req, res) => {
      try {
        const query = {};

        // filter by lawyerId (if you are using Mongo _id)
        if (req.query.lawyerId) {
          query._id = req.query.lawyerId;
        }

        // optional filters
        if (req.query.status) {
          query.status = req.query.status;
        }

        if (req.query.specialization) {
          query.specialization = req.query.specialization;
        }

        const lawyers = await lawyersCollection.find(query);
        const result = await lawyers.toArray();
        // res.send(result);

        res.status(200).json({
          success: true,
          count: lawyers.length,
          data: result
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

    // hire related api
    app.post('/api/hires', async (req, res) => {
      const hire = req.body;
      const newHire = {
        ...hire,
        createdAt: new Date()
      }
      console.log("new hire", newHire);
      const result = await hiresCollection.insertOne(newHire);
      console.log("result", result);
      res.send(result);
    })


    app.post('/api/lawyers', async (req, res) => {
      const lawyer = req.body;
      const result = await lawyersCollection.insertOne(lawyer);
      res.send(result);
    })

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