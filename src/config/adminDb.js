import mongoose from 'mongoose';

// Must be set before any model/schema is created so all schemas inherit it.
// Passing bufferCommands in connect() options only applies to the connection
// object, not to schemas already instantiated at import time.
mongoose.set('bufferCommands', false);

// Index builds are a development convenience, not a deploy step. Left on (the
// mongoose default), every cold start re-issues createIndexes for every model
// it touches — pure latency and Atlas load on a platform that cold-starts
// constantly. Indexes are declared on the schemas and applied by
// `npm run sync-indexes` at deploy time instead.
mongoose.set('autoIndex', process.env.NODE_ENV !== 'production');

// Cached on its own global key — distinct from the secondary (smart-duka)
// connection's cache in config/smartDukaDb.js — so the two connections never
// collide across a warm serverless instance's global scope.
let cached = global._adminMongooseCache;

if (!cached) {
  cached = global._adminMongooseCache = { conn: null, promise: null };
}

/** Connects to the admin-native database (Role/AdminUser/Agent/Onboarding/...). */
const connectAdminDB = async () => {
  if (cached.conn && cached.conn.readyState === 1) {
    return cached.conn;
  }

  // Stale connection (cached but socket dropped) — force reconnect
  if (cached.conn) {
    cached.conn = null;
    cached.promise = null;
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(process.env.ADMIN_MONGODB_URI, {
      serverSelectionTimeoutMS: 8000,
      // A serverless instance handles one request at a time, so a large pool
      // buys nothing and costs the only resource that is actually scarce:
      // Atlas connection slots. A few spare sockets cover the parallel
      // Promise.all reads controllers do.
      maxPoolSize: Number(process.env.MONGO_MAX_POOL_SIZE) || 5,
      minPoolSize: 0,
      // Reap sockets left over from instances Vercel has already frozen,
      // rather than holding slots open until the server times them out.
      maxIdleTimeMS: 60_000,
    }).then((m) => m.connection);
  }

  try {
    cached.conn = await cached.promise;
    console.log(`Admin MongoDB connected: ${cached.conn.host}`);
  } catch (error) {
    cached.promise = null;
    console.error(`Error connecting to admin db: ${error.message}`);
    throw error;
  }

  return cached.conn;
};

export default connectAdminDB;
