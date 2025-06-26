require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const port = process.env.PORT || 3000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');


//middleware
app.use(cors({
    origin: ['http://localhost:5173'],
    credentials: true
}));
app.use(express.json());
app.use(cookieParser());

//Firebase admin credentials (top secret)
var admin = require("firebase-admin");

// var serviceAccount = require("./firebase-admin-key.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});


const looger = (req, res, next) => {
    console.log('inside of 54 the looger middleware');
    next();
}






// const verifyToken = (req, res, next) => {
//     const token = req?.cookies?.token;
//     console.log('Cookie in the middleware', req.cookies);

//     if (!token) {
//         return res.status(401).send({ messege: 'Unauthorized Access' })
//     }

//     // Verify Token
//     jwt.verify(token, process.env.JWT_ACCESS_SECRET, (err, decoded) => {
//         if (err) {
//             return res.status(401).send({ messege: 'Unauthorized Access' })
//         }
//         req.decoded = decoded;
//         console.log(decoded);
//         next();
//     })
// }
const verifyToken = (req, res, next) => {
    const token = req?.cookies?.token;
    if (!token) {
        return res.status(401).send({ message: 'Unauthorized acces' });
    }
    jwt.verify(token, process.env.JWT_ACCESS_SECRET, ((err, decoded) => {
        if (err) {
            return res.status(401).send({ message: 'Unauthorized access' })
        }
        req.decoded = decoded;
        next();

    }))
}


// firebase access token verify
const verifyFirebaseToken = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).send({ message: 'Unauthorized Access' });
    }

    const userInfo = await admin.auth().verifyIdToken(token);
    req.tokenEmail = userInfo.email;
    // console.log('inside the firebase token', userInfo);

    // console.log('fb token', token);
    next();
}


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@clusterofrazu.6jqzkwj.mongodb.net/?retryWrites=true&w=majority&appName=clusterOfRazu`;

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
        await client.connect();

        const jobsCollection = client.db('careerCode').collection('jobs')
        const applicationsCollection = client.db('careerCode').collection('applications')

        // Jwt token related apis      

        // app.post('/jwt', async (req, res) => {
        //     const userData = req.body;
        //     const token = jwt.sign(userData, process.env.JWT_ACCESS_SECRET, { expiresIn: '1d' })

        //     // set token in the cookies
        //     res.cookie('token', token, {
        //         httpOnly: true,
        //         secure: false,
        //     })

        //     res.send({ success: true })

        // })

        app.post('/jwt', async (req, res) => {
            const userInfo = req.body;
            const token = jwt.sign(userInfo, process.env.JWT_ACCESS_SECRET, { expiresIn: '2h' });
            res.cookie('token', token, {
                httpOnly: true,
                secure: false
            })
            res.send({ success: true });

        })




        //jobs  API

        //get or read API
        app.get('/jobs', async (req, res) => {
            const email = req.query.email;
            const query = {};
            if (email) {
                query.hr_email = email;
            }

            const cursor = jobsCollection.find(query);
            const result = await cursor.toArray();
            res.send(result);
        })

        // could be done but should not be done
        // app.get('jobsByEmailAddress', async (req, res) => {
        //     const email = req.body.email;
        //     const query = { hr_email: email };
        //     const result = await jobsCollection.find(query).toArray();
        //     res.send(result);

        // })


        //How may applications have be submitted
        app.get('/jobs/applications', async (req, res) => {
            const email = req.query.email;
            const query = { hr_email: email };
            const jobs = await jobsCollection.find(query).toArray();

            //should use aggregae to have optimum database
            for (const job of jobs) {
                const applicationQuery = { jobId: job._id.toString() };
                const application_count = await applicationsCollection.countDocuments(applicationQuery);
                job.application_count = application_count
            }
            res.send(jobs)
        })

        //get specific API
        app.get('/jobs/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await jobsCollection.findOne(query);
            res.send(result);
        })

        //newJob post
        app.post('/jobs', async (req, res) => {
            const newJob = req.body;
            console.log(newJob);
            const result = await jobsCollection.insertOne(newJob);
            res.send(result);
        })









        //Job Application Related APIs

        // Data load by email query (newly learned)
        app.get('/applications', looger, verifyFirebaseToken, async (req, res) => {
            const email = req.query.email;

            //console.log('inside application api', req.cookies)
            // if (email !== req.decoded.email) {
            //     return res.status(403).send({ messege: 'Forbidden access' })
            // }

            //for firebase verify token
            if (req.tokenEmail !== email) {
                return res.status(403).send({ messege: 'Forbidden access' })
            }

            const query = {
                applicant: email
            }
            const result = await applicationsCollection.find(query).toArray();

            //Bad way to aggregate data
            for (const application of result) {
                const jobId = application.jobId;
                const jobQuery = { _id: new ObjectId(jobId) };
                const job = await jobsCollection.findOne(jobQuery);
                application.company = job.company;
                application.title = job.title;
                application.company_logo = job.company_logo;

            }
            res.send(result);
        })

        // Application list for specific job ID
        app.get('/applications/job/:job_id', async (req, res) => {
            const job_id = req.params.job_id;
            const query = { jobId: job_id };
            const result = await applicationsCollection.find(query).toArray();
            res.send(result);
        })



        app.post('/applications', async (req, res) => {
            const application = req.body;
            const result = await applicationsCollection.insertOne(application);
            res.send(result);
        })

        //Patch for application
        app.patch('/applications/:id', async (req, res) => {
            const id = req.params.id
            const filter = { _id: new ObjectId(id) }
            const updatedDoc = {
                $set: {
                    status: req.body.status
                }
            }
            const result = await applicationsCollection.updateOne(filter, updatedDoc);
            res.send(result)
        })


        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);



app.get('/', (req, res) => {
    res.send('Career code on going')
})


app.listen(port, () => {
    console.log(`Career code server running on the port ${port}`);
})


