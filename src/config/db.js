const mongoose = require('mongoose');

const redactMongoUri = (uri) => {
  if (!uri) {
    return "<missing>";
  }

  return uri.replace(/(mongodb(?:\+srv)?:\/\/)([^@]+)@/i, "$1***:***@");
};

const describeMongoTarget = (uri) => {
  try {
    const parsed = new URL(uri);
    const databaseName = parsed.pathname?.replace(/^\//, "") || "<default>";

    return {
      host: parsed.hostname || "<unknown>",
      databaseName,
    };
  } catch {
    return {
      host: "<unparsed>",
      databaseName: "<unknown>",
    };
  }
};

const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGO_URI;

    if (!mongoUri) {
      console.warn("[db] MONGO_URI is not set. MongoDB connection skipped.");
      return false;
    }

    const target = describeMongoTarget(mongoUri);

    console.log(`[db] Connecting to ${redactMongoUri(mongoUri)}`);
    console.log(`[db] Target database: ${target.databaseName} @ ${target.host}`);

    mongoose.connection.on("connected", () => {
      console.log(`[db] MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
    });

    mongoose.connection.on("disconnected", () => {
      console.warn("[db] MongoDB disconnected");
    });

    mongoose.connection.on("error", (error) => {
      console.error(`[db] MongoDB error: ${error.message}`);
    });

    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 10000,
    });
    console.log(`[db] MongoDB ready: ${mongoose.connection.host}/${mongoose.connection.name}`);
    return true;
  } catch (error) {
    const isSrvLookupFailure = /querySrv|ENOTFOUND|ECONNREFUSED/i.test(error.message);

    if (isSrvLookupFailure) {
      console.warn("[db] MongoDB SRV lookup failed. Check Atlas status, DNS, VPN/firewall, and network access to mongodb.net.");
    }

    console.warn(`[db] MongoDB connection failed: ${error.message}`);
    return false;
  }
};

module.exports = connectDB;
