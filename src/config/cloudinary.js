import { v2 as cloudinary } from 'cloudinary';

// Own direct integration, not a relay through smart-duka-backend's /internal/*
// endpoints — unlike Daraja/Firebase (complex, stateful, business-critical),
// Cloudinary upload is a simple, stateless SDK call, low risk to configure
// twice. Can point at the same Cloudinary account as smart-duka-backend or a
// distinct one — either works, this just needs its own env vars set.
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export default cloudinary;
