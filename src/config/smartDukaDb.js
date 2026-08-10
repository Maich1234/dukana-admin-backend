import mongoose from 'mongoose';

// Second, independent Mongoose connection into the *existing* smart-duka
// database. Uses createConnection() (not the default connect()) because
// admin-native models (src/models/admin/*.js) are already bound to the
// default connection via config/adminDb.js — the two must never share a
// connection object, or a query for the wrong model could silently run
// against the wrong database.
//
// autoIndex is unconditionally false, in every environment: this backend
// never owns these collections' indexes (smart-duka-backend does, via its
// own sync-indexes script) and must never attempt to create or change one.
//
// Cached on its own global key so a warm serverless instance reuses both
// connections independently across invocations.
let cached = global._smartDukaMongooseCache;

if (!cached) {
  cached = global._smartDukaMongooseCache = { conn: null, promise: null };
}

const connectSmartDuka = async () => {
  if (cached.conn && cached.conn.readyState === 1) {
    return cached.conn;
  }

  if (cached.conn) {
    cached.conn = null;
    cached.promise = null;
  }

  if (!cached.promise) {
    const connection = mongoose.createConnection(process.env.SMARTDUKA_MONGODB_URI, {
      serverSelectionTimeoutMS: 8000,
      maxPoolSize: Number(process.env.MONGO_MAX_POOL_SIZE) || 5,
      minPoolSize: 0,
      maxIdleTimeMS: 60_000,
      autoIndex: false,
      bufferCommands: false,
    });
    cached.promise = new Promise((resolve, reject) => {
      connection.once('open', () => resolve(connection));
      connection.once('error', reject);
    });
  }

  try {
    cached.conn = await cached.promise;
    console.log(`SmartDuka MongoDB connected: ${cached.conn.host}`);
  } catch (error) {
    cached.promise = null;
    console.error(`Error connecting to smart-duka db: ${error.message}`);
    throw error;
  }

  return cached.conn;
};

export default connectSmartDuka;
