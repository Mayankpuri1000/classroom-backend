import express from "express";

const app = express();
const PORT = 8000;

app.use(express.json()); 

app.get('/', (req, res) => {
    res.send("Hello, Welcome to the classroom API");
})

app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
})