require("dotenv").config();
const connectDB = require("./src/config/db");
const app = require("./src/app");

// connect to database
connectDB();

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
